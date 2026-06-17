import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getProviderHeaders, providerUrl } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { checkUserCredits } from "@/lib/credits";
import { checkModelPermission } from "@/lib/permissions";
import { getCreditPerImageGeneration } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveBase64Image, saveImageFromUrl } from "@/lib/storage";

export const runtime = "nodejs";

function streamEvent(eventName: string, data: unknown) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

function conversationTitle(content: string) {
  return `画图：${content.replace(/\s+/g, " ").trim().slice(0, 24) || "新图片"}`;
}

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  // 检查频率限制（基于用户 ID）
  const rateLimitResult = checkRateLimit(user.id, "imageGeneration");
  if (!rateLimitResult.allowed) {
    return jsonError(
      `图片生成请求过于频繁，请在 ${rateLimitResult.retryAfter} 秒后重试。`,
      429
    );
  }

  const body = await request.json();
  const modelId = String(body.modelId || "");
  const prompt = String(body.prompt || body.content || "").trim();

  if (!modelId || !prompt) {
    return jsonError("模型和提示词不能为空。", 400);
  }

  const model = await prisma.model.findFirst({
    where: { id: modelId, enabled: true, provider: { enabled: true } },
    include: { provider: true }
  });

  if (!model) {
    return jsonError("模型不存在或未启用。", 404);
  }

  if (model.type !== "image" && !model.capabilities.split(",").includes("image")) {
    return jsonError("当前模型未标记为图片模型。", 400);
  }

  // 检查用户状态
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { status: true }
  });

  if (!fullUser) {
    return jsonError("用户不存在。", 404);
  }

  if (fullUser.status === "banned") {
    return jsonError("您的账号已被封禁，无法使用服务。", 403);
  }

  if (fullUser.status === "suspended") {
    return jsonError("您的账号已被暂停，无法使用服务。", 403);
  }

  // 检查用户是否有权使用该模型
  const hasPermission = await checkModelPermission(user.id, modelId);

  if (!hasPermission) {
    return jsonError("您没有权限使用该模型。", 403);
  }

  // 检查积分是否足够
  const requiredCredits = getCreditPerImageGeneration();
  const hasEnoughCredits = await checkUserCredits(user.id, requiredCredits);

  if (!hasEnoughCredits) {
    return jsonError("积分余额不足，请前往个人中心兑换。", 402);
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";

  if (conversationId) {
    // 校验会话归属，防止越权向他人会话写入消息
    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: user.id },
      select: { id: true }
    });

    if (!owned) {
      return jsonError("会话不存在。", 404);
    }
  }

  const conversation = conversationId
    ? await prisma.conversation.update({
        where: { id: conversationId },
        data: { modelId: model.id, modelName: model.name, providerId: model.providerId }
      })
    : await prisma.conversation.create({
        data: {
          userId: user.id,
          title: conversationTitle(prompt),
          modelId: model.id,
          modelName: model.name,
          providerId: model.providerId
        }
      });

  const userMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: prompt,
      modelName: model.name
    }
  });

  const encoder = new TextEncoder();

  // 客户端断开（停止生成/关闭页面）时取消上游请求，避免上游继续生成并计费
  const upstreamAbort = new AbortController();
  request.signal?.addEventListener("abort", () => upstreamAbort.abort());

  // SSE 流式响应：生图是长耗时操作（30~90s），同步返回会被 Cloudflare 100s 回源超时
  // 掐断（524）。这里在等待期间持续发送心跳，让连接始终有数据流动，规避超时；
  // 上游出图、落地、扣分完成后再通过 done 事件返回最终结果。
  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(streamEvent(eventName, data)));
        } catch {
          // 客户端已断开（cancel 之后 enqueue 会抛错），静默忽略
        }
      };

      // 立即发出首个事件并占位 conversationId，确保第一字节尽快到达边缘节点
      send("meta", {
        conversationId: conversation.id,
        title: conversation.title
      });

      // 每 15 秒发一个 SSE 注释行作为心跳（前端解析时无 data 会自动忽略），
      // 远小于 Cloudflare 100s 回源超时，保证长耗时生图期间连接不被掐断
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:keepalive\n\n`));
        } catch {
          // 已断开，忽略
        }
      }, 15000);

      try {
        const response = await fetch(providerUrl(model.provider, "/v1/images/generations"), {
          method: "POST",
          headers: getProviderHeaders(model.provider),
          body: JSON.stringify({
            model: model.name,
            prompt,
            n: Number(body.n ?? 1),
            size: String(body.size || "1024x1024"),
            response_format: String(body.responseFormat || "url")
          }),
          signal: upstreamAbort.signal
        });

        if (!response.ok) {
          send("error", { message: `图片生成失败：${response.status} ${await response.text()}` });
          return;
        }

        const payload = await response.json();
        const firstImage = Array.isArray(payload?.data) ? payload.data[0] : payload;
        const remoteUrl = typeof firstImage?.url === "string" ? firstImage.url : null;
        const remoteBase64 = typeof firstImage?.b64_json === "string" ? firstImage.b64_json : null;
        const revisedPrompt = typeof firstImage?.revised_prompt === "string" ? firstImage.revised_prompt : null;

        if (!remoteUrl && !remoteBase64) {
          send("error", { message: "图片接口未返回 url 或 b64_json。" });
          return;
        }

        // 将图片落地到本地 public/uploads，DB 只存本地 URL，避免 base64 撑大数据库。
        // 第三方返回的 URL 通常有有效期，落地后可长期访问。
        let imageUrl: string | null = null;
        try {
          if (remoteBase64) {
            imageUrl = await saveBase64Image(remoteBase64);
          } else if (remoteUrl) {
            imageUrl = await saveImageFromUrl(remoteUrl);
          }
        } catch (saveError) {
          console.error("图片落地失败，降级使用原始返回:", saveError);
          // 落地失败时降级：base64 无法长期保存则直接用远程 URL（可能有有效期）
          imageUrl = remoteUrl;
        }

        if (!imageUrl) {
          send("error", { message: "图片保存失败，请重试。" });
          return;
        }

        // metadata 剔除 b64_json 大字段，避免整张 base64 图被存进数据库
        const sanitizedPayload = Array.isArray(payload?.data)
          ? {
              ...payload,
              data: payload.data.map((item: Record<string, unknown>) => {
                const rest = { ...item };
                delete rest.b64_json;
                return rest;
              })
            }
          : payload;

        // 将“存储助手消息”与“扣除积分”放入同一事务，保证账目一致：
        // 要么消息入库且积分扣除，要么都不发生，避免扣分失败仍白嫖图片。
        const assistantMessage = await prisma.$transaction(async (tx) => {
          const message = await tx.message.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: revisedPrompt || "图片已生成。",
              modelName: model.name,
              imageUrl,
              metadata: JSON.stringify(sanitizedPayload)
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
              type: "image",
              conversationId: conversation.id,
              modelName: model.name,
              description: "图片生成消耗"
            }
          });

          return message;
        });
        const persistedAssistantMessage = await prisma.message.findUnique({
          where: { id: assistantMessage.id }
        });
        const finalAssistantMessage = persistedAssistantMessage || assistantMessage;

        send("done", {
          conversation: {
            id: conversation.id,
            title: conversation.title,
            providerId: conversation.providerId,
            modelId: conversation.modelId,
            modelName: conversation.modelName,
            createdAt: conversation.createdAt.toISOString(),
            updatedAt: conversation.updatedAt.toISOString()
          },
          messages: [
            {
              id: userMessage.id,
              role: userMessage.role,
              content: userMessage.content,
              modelName: userMessage.modelName,
              imageUrl: userMessage.imageUrl,
              imageBase64: userMessage.imageBase64,
              createdAt: userMessage.createdAt.toISOString()
            },
            {
              id: finalAssistantMessage.id,
              role: finalAssistantMessage.role,
              content: finalAssistantMessage.content,
              modelName: finalAssistantMessage.modelName,
              imageUrl: finalAssistantMessage.imageUrl,
              imageBase64: finalAssistantMessage.imageBase64,
              createdAt: finalAssistantMessage.createdAt.toISOString()
            }
          ]
        });
      } catch (error) {
        // 客户端主动断开导致的中止不算错误，静默结束即可
        if (!upstreamAbort.signal.aborted) {
          send("error", { message: error instanceof Error ? error.message : "图片生成异常。" });
        }
      } finally {
        clearInterval(heartbeat);
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
