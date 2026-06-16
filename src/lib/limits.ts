import { prisma } from "./prisma";
import { getMaxConversationsPerUser, getMaxMessagesPerConversation, getMaxContextMessages } from "./config";

/**
 * 检查用户会话数量是否达到上限
 */
export async function checkConversationLimit(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { maxConversations: true }
  });

  const limit = user?.maxConversations ?? getMaxConversationsPerUser();
  const count = await prisma.conversation.count({
    where: { userId }
  });

  return count < limit;
}

/**
 * 清理用户超出限制的会话（删除最旧的）
 */
export async function enforceConversationLimit(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { maxConversations: true }
  });

  const limit = user?.maxConversations ?? getMaxConversationsPerUser();
  const count = await prisma.conversation.count({
    where: { userId }
  });

  if (count >= limit) {
    const excess = count - limit + 1;

    // 找出最旧的会话
    const oldestConversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "asc" },
      take: excess,
      select: { id: true }
    });

    // 删除最旧的会话
    await prisma.conversation.deleteMany({
      where: {
        id: { in: oldestConversations.map((c) => c.id) }
      }
    });
  }
}

/**
 * 清理会话中超出限制的消息（删除最旧的）
 */
export async function enforceMessageLimit(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { user: { select: { maxMessagesPerConversation: true } } }
  });

  if (!conversation) {
    return;
  }

  const limit = conversation.user.maxMessagesPerConversation ?? getMaxMessagesPerConversation();
  const count = await prisma.message.count({
    where: { conversationId }
  });

  if (count > limit) {
    const excess = count - limit;

    // 找出最旧的消息
    const oldestMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: excess,
      select: { id: true }
    });

    // 删除最旧的消息
    await prisma.message.deleteMany({
      where: {
        id: { in: oldestMessages.map((m) => m.id) }
      }
    });
  }
}

/**
 * 获取会话的上下文消息（限制数量）
 */
export async function getContextMessages(conversationId: string, limit?: number) {
  const maxMessages = limit ?? getMaxContextMessages();

  return prisma.message.findMany({
    where: {
      conversationId,
      role: { in: ["system", "user", "assistant"] }
    },
    orderBy: { createdAt: "desc" },
    take: maxMessages
  });
}

/**
 * 获取用户的会话数量限制
 */
export async function getUserConversationLimit(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { maxConversations: true }
  });

  return user?.maxConversations ?? getMaxConversationsPerUser();
}

/**
 * 获取用户的消息数量限制
 */
export async function getUserMessageLimit(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { maxMessagesPerConversation: true }
  });

  return user?.maxMessagesPerConversation ?? getMaxMessagesPerConversation();
}
