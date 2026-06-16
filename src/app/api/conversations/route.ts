import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { checkConversationLimit, getUserConversationLimit } from "@/lib/limits";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    // 游标分页：?limit=30&cursor=<lastConversationId>
    // 多取 1 条用于判断是否还有下一页（hasMore），返回时再裁掉。
    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") || "30", 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 30 : rawLimit, 1), 100);
    const cursor = url.searchParams.get("cursor") || undefined;

    const rows = await prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: limit + 1,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {})
    });

    const hasMore = rows.length > limit;
    const conversations = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? conversations[conversations.length - 1].id : null;

    return jsonOk({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        providerId: conversation.providerId,
        modelId: conversation.modelId,
        modelName: conversation.modelName,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString()
      })),
      nextCursor,
      hasMore
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const body = await request.json();
    const title = String(body.title || "新会话").trim().slice(0, 80) || "新会话";
    const modelId = typeof body.modelId === "string" ? body.modelId : undefined;
    const model = modelId
      ? await prisma.model.findFirst({ where: { id: modelId }, include: { provider: true } })
      : null;

    // 检查会话数量限制
    const canCreateConversation = await checkConversationLimit(user.id);

    if (!canCreateConversation) {
      const conversationLimit = await getUserConversationLimit(user.id);
      return jsonError(
        `会话数量已达上限（${conversationLimit} 个），请先删除部分旧会话后再新建。`,
        403
      );
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title,
        modelId: model?.id,
        modelName: model?.name,
        providerId: model?.providerId
      }
    });

    return jsonOk({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        providerId: conversation.providerId,
        modelId: conversation.modelId,
        modelName: conversation.modelName,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages: []
      }
    });
  } catch (error) {
    return routeError(error);
  }
}
