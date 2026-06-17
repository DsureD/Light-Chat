import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getProviderHeaders, providerUrl, type ChatMessage } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import {
  getCreditPerChatMessage,
  getMaxContextChars,
  getMaxContextImages,
  getMaxContextMessages,
  getMaxConversationsPerUser,
  getMaxMessageChars,
  getMaxMessagesPerConversation
} from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { readUploadAsDataUrl } from "@/lib/storage";

export const runtime = "nodejs";

type ContentPart = { type: string; text?: string; image_url?: { url: string } };

function streamEvent(eventName: string, data: unknown) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

function conversationTitle(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 30) || "新会话";
}

function extractDelta(payload: unknown) {
  const choice = (payload as { choices?: Array<{ delta?: { content?: string }; text?: string }> })?.choices?.[0];
  return choice?.delta?.content ?? choice?.text ?? "";
}

/**
 * 构建发给上游的上下文消息：
 * - 条数受 MAX_CONTEXT_MESSAGES 限制，总字符数受 MAX_CONTEXT_CHARS 限制（至少保留最新一条）；
 * - 图片附件存的是本地 /uploads URL，发上游前内联为 data URL，
 *   且最多内联 MAX_CONTEXT_IMAGES 张（优先保留最新的），避免每轮重发几十 MB。
 */
async function buildContextMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      role: { in: ["system", "user", "assistant"] }
    },
    orderBy: { createdAt: "desc" },
    take: getMaxContextMessages()
  });

  const maxChars = getMaxContextChars();
  let usedChars = 0;
  let remainingImages = getMaxContextImages();
  const result: ChatMessage[] = [];

  // rows 按新→旧排列：从最新开始装入预算，放不下的旧消息直接丢弃
  for (const row of rows) {
    let content: string | ContentPart[] = row.content;

    // 尝试解析JSON格式的vision消息
    if (typeof content === "string" && content.startsWith("[") && content.includes('"type"')) {
      try {
        content = JSON.parse(content) as ContentPart[];
      } catch {
        // 解析失败，保持字符串格式
      }
    }

    // data: URL（历史遗留的内嵌 base64 图片）按完整长度计入预算，
    // 使超大的旧消息自然被挤出上下文；新格式的 /uploads URL 本身很短
    const textLength =
      typeof content === "string"
        ? content.length
        : content.reduce(
            (sum, part) =>
              sum +
              (part.text?.length ?? 0) +
              (part.image_url?.url.startsWith("data:") ? part.image_url.url.length : 0),
            0
          );

    if (result.length > 0 && usedChars + textLength > maxChars) {
      break;
    }
    usedChars += textLength;

    if (Array.isArray(content)) {
      const parts: ContentPart[] = [];

      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          if (remainingImages <= 0) {
            continue; // 超出配额的旧图直接剥离
          }

          const url = part.image_url.url;

          if (url.startsWith("/uploads/")) {
            const dataUrl = await readUploadAsDataUrl(url);
            if (dataUrl) {
              parts.push({ type: "image_url", image_url: { url: dataUrl } });
              remainingImages--;
            }
          } else {
            parts.push(part);
            remainingImages--;
          }
        } else {
          parts.push(part);
        }
      }

      content = parts.length === 1 && parts[0].type === "text" ? parts[0].text ?? "" : parts;
    }

    result.push({ role: row.role as ChatMessage["role"], content });
  }

  return result.reverse();
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  // 检查频率限制（基于用户 ID）
  const rateLimitResult = checkRateLimit(user.id, "chat");
  if (!rateLimitResult.allowed) {
    return jsonError(
      `请求过于频繁，请在 ${rateLimitResult.retryAfter} 秒后重试。`,
      429
    );
  }

  const body = await request.json();
  const modelId = String(body.modelId || "");
  const content = body.content;
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";

  // 支持字符串或vision格式的content
  let contentText = "";
  if (typeof content === "string") {
    contentText = content.trim();
  } else if (Array.isArray(content)) {
    // 从vision格式中提取文本用于标题和存储
    contentText = content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .trim();
  }

  if (!modelId || !contentText) {
    return jsonError("模型和消息内容不能为空。", 400);
  }

  // 服务端长度校验：防止超大消息（包括内嵌 base64）撑爆数据库与上游请求
  const maxMessageChars = getMaxMessageChars();
  const totalChars = typeof content === "string" ? content.length : JSON.stringify(content).length;
  if (totalChars > maxMessageChars) {
    return jsonError(`消息内容过长（上限 ${maxMessageChars} 字符），图片请使用附件上传。`, 413);
  }

  // 一次性取齐用户字段并行完成模型/权限查询，减少首 token 前的串行 DB 往返
  const [userRecord, model, permission] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        status: true,
        role: true,
        credits: true,
        maxConversations: true,
        maxMessagesPerConversation: true
      }
    }),
    prisma.model.findFirst({
      where: { id: modelId, enabled: true, provider: { enabled: true } },
      include: { provider: true }
    }),
    prisma.userModelPermission.findUnique({
      where: { userId_modelId: { userId: user.id, modelId } },
      select: { enabled: true }
    })
  ]);

  if (!userRecord) {
    return jsonError("用户不存在。", 404);
  }

  // banned 已在 getSessionUser 拦截，这里处理 suspended
  if (userRecord.status === "suspended") {
    return jsonError("您的账号已被暂停，无法使用此功能。请联系管理员。", 403);
  }

  if (!model) {
    return jsonError("模型不存在或未启用。", 404);
  }

  if (model.type === "image") {
    return jsonError("图片模型请使用图片生成接口。", 400);
  }

  // 检查用户是否有权使用该模型（管理员拥有全部模型权限）
  const hasPermission = userRecord.role === "ADMIN" || (permission?.enabled ?? false);

  if (!hasPermission) {
    return jsonError("您没有权限使用该模型。", 403);
  }

  // 检查积分是否足够
  const requiredCredits = getCreditPerChatMessage();

  if (userRecord.credits < requiredCredits) {
    return jsonError("积分余额不足，请前往个人中心兑换。", 402);
  }

  const existingConversationId = typeof body.conversationId === "string" ? body.conversationId : "";

  if (existingConversationId) {
    // 校验会话归属，防止越权向他人会话写入消息；并行统计消息数
    const [owned, messageCount] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id: existingConversationId, userId: user.id },
        select: { id: true }
      }),
      prisma.message.count({
        where: { conversationId: existingConversationId }
      })
    ]);

    if (!owned) {
      return jsonError("会话不存在。", 404);
    }

    const messageLimit = userRecord.maxMessagesPerConversation ?? getMaxMessagesPerConversation();

    // 本次会新增 1 条用户消息 + 1 条助手消息，因此预留 2 条空间
    if (messageCount + 2 > messageLimit) {
      return jsonError(
        `当前会话消息数已达上限（${messageLimit} 条），请新建会话后继续。`,
        403
      );
    }
  } else {
    // 新建会话：检查用户会话数是否已达上限
    const conversationLimit = userRecord.maxConversations ?? getMaxConversationsPerUser();
    const conversationCount = await prisma.conversation.count({
      where: { userId: user.id }
    });

    if (conversationCount >= conversationLimit) {
      return jsonError(
        `会话数量已达上限（${conversationLimit} 个），请先删除部分旧会话后再新建。`,
        403
      );
    }
  }

  const conversation = existingConversationId
    ? await prisma.conversation.update({
        where: { id: existingConversationId },
        data: { modelId: model.id, modelName: model.name, providerId: model.providerId }
      })
    : await prisma.conversation.create({
        data: {
          userId: user.id,
          title: conversationTitle(contentText),
          modelId: model.id,
          modelName: model.name,
          providerId: model.providerId
        }
      });

  // 保存用户消息时，将vision格式转为JSON字符串存储
  const contentToStore = typeof content === "string" ? content : JSON.stringify(content);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: contentToStore,
      modelName: model.name
    }
  });

  const contextMessages = await buildContextMessages(conversation.id);

  // 如果有 systemPrompt，插入到消息列表最前面
  const finalMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...contextMessages]
    : contextMessages;

  const encoder = new TextEncoder();

  // 客户端断开（停止生成/关闭页面）时取消上游请求，避免上游 token 继续计费
  const upstreamAbort = new AbortController();
  request.signal?.addEventListener("abort", () => upstreamAbort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(streamEvent(eventName, data)));
        } catch {
          // 客户端已断开（cancel 之后 enqueue 会抛错），静默忽略
        }
      };

      send("meta", {
        conversationId: conversation.id,
        title: conversation.title,
        modelName: model.name
      });

      let assistantContent = "";

      try {
        const response = await fetch(providerUrl(model.provider, "/v1/chat/completions"), {
          method: "POST",
          headers: getProviderHeaders(model.provider),
          body: JSON.stringify({
            model: model.name,
            messages: finalMessages,
            temperature: Number(body.temperature ?? 0.7),
            stream: true
          }),
          signal: upstreamAbort.signal
        });

        if (!response.ok || !response.body) {
          send("error", { message: `模型调用失败：${response.status} ${await response.text()}` });
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const result = await reader.read();
          done = result.done;
          buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !done });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();

            if (!line.startsWith("data:")) {
              continue;
            }

            const data = line.slice(5).trim();

            if (!data || data === "[DONE]") {
              continue;
            }

            try {
              const delta = extractDelta(JSON.parse(data));

              if (delta) {
                assistantContent += delta;
                send("delta", { content: delta });
              }
            } catch {
              send("delta", { content: data });
              assistantContent += data;
            }
          }
        }

        // 将“存储助手消息”与“扣除积分”放入同一事务，保证账目一致：
        // 要么消息入库且积分扣除，要么都不发生，避免扣分失败仍白嫖回复。
        const assistantMessage = await prisma.$transaction(async (tx) => {
          const message = await tx.message.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: assistantContent,
              modelName: model.name
            }
          });

          // 事务内复查余额并扣除（防并发把余额扣空）
          const current = await tx.user.findUnique({
            where: { id: user.id },
            select: { credits: true }
          });

          if (!current || current.credits < requiredCredits) {
            throw new Error("积分余额不足");
          }

          await tx.user.update({
            where: { id: user.id },
            data: { credits: { decrement: requiredCredits } }
          });

          await tx.creditLog.create({
            data: {
              userId: user.id,
              amount: -requiredCredits,
              type: "chat",
              conversationId: conversation.id,
              modelName: model.name,
              description: "聊天消耗"
            }
          });

          return message;
        });

        send("done", {
          messageId: assistantMessage.id,
          conversationId: conversation.id,
          content: assistantContent
        });
      } catch (error) {
        // 客户端主动断开导致的中止不算错误，静默结束即可
        if (!upstreamAbort.signal.aborted) {
          const message =
            error instanceof TypeError
              ? "模型调用失败：无法连接服务商，请检查 Base URL 是否正确，或服务商网络是否可达。"
              : error instanceof Error
                ? error.message
                : "模型调用异常。";
          send("error", { message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // controller 可能已因 cancel 关闭
        }
      }
    },
    cancel() {
      // 客户端断开时取消上游请求
      upstreamAbort.abort();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
