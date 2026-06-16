import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const { conversationId } = await context.params;
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });

    if (!conversation) {
      return jsonError("会话不存在。", 404);
    }

    return jsonOk({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        providerId: conversation.providerId,
        modelId: conversation.modelId,
        modelName: conversation.modelName,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          modelName: message.modelName,
          imageUrl: message.imageUrl,
          imageBase64: message.imageBase64,
          createdAt: message.createdAt.toISOString()
        }))
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const { conversationId } = await context.params;
    const body = await request.json();
    const title = String(body.title || "").trim().slice(0, 80);

    if (!title) {
      return jsonError("会话标题不能为空。", 400);
    }

    // 带 userId 条件更新，确保只能修改自己的会话（防越权）
    const updateResult = await prisma.conversation.updateMany({
      where: { id: conversationId, userId: user.id },
      data: { title }
    });

    if (updateResult.count === 0) {
      return jsonError("会话不存在。", 404);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      return jsonError("会话不存在。", 404);
    }

    return jsonOk({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        providerId: conversation.providerId,
        modelId: conversation.modelId,
        modelName: conversation.modelName,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const { conversationId } = await context.params;
    // 带 userId 条件删除，确保只能删除自己的会话（防越权）
    const deleteResult = await prisma.conversation.deleteMany({
      where: { id: conversationId, userId: user.id }
    });

    if (deleteResult.count === 0) {
      return jsonError("会话不存在。", 404);
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
