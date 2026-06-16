import { prisma } from "./prisma";

/**
 * 获取用户当前积分
 */
export async function getUserCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true }
  });

  return user?.credits ?? 0;
}

/**
 * 检查用户积分是否足够
 */
export async function checkUserCredits(userId: string, required: number): Promise<boolean> {
  const credits = await getUserCredits(userId);
  return credits >= required;
}

/**
 * 扣除积分并记录日志
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: "chat" | "image",
  conversationId?: string,
  modelName?: string
): Promise<void> {
  if (amount <= 0) {
    throw new Error("扣除积分数量必须大于 0");
  }

  await prisma.$transaction(async (tx) => {
    // 获取当前积分
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true }
    });

    if (!user) {
      throw new Error("用户不存在");
    }

    if (user.credits < amount) {
      throw new Error("积分余额不足");
    }

    // 扣除积分
    await tx.user.update({
      where: { id: userId },
      data: { credits: { decrement: amount } }
    });

    // 记录日志
    await tx.creditLog.create({
      data: {
        userId,
        amount: -amount,
        type,
        conversationId,
        modelName,
        description: type === "chat" ? "聊天消耗" : "图片生成消耗"
      }
    });
  });
}

/**
 * 增加积分并记录日志
 */
export async function grantCredits(
  userId: string,
  amount: number,
  type: "redeem" | "admin_grant" | "admin_adjust",
  description?: string
): Promise<void> {
  if (amount === 0) {
    throw new Error("积分变动数量不能为 0");
  }

  await prisma.$transaction(async (tx) => {
    // 增加积分
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } }
    });

    // 记录日志
    await tx.creditLog.create({
      data: {
        userId,
        amount,
        type,
        description: description || (amount > 0 ? "积分充值" : "积分扣除")
      }
    });
  });
}

/**
 * 获取用户积分日志
 */
export async function getUserCreditLogs(userId: string, limit: number = 50, offset: number = 0) {
  return prisma.creditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit
  });
}

/**
 * 获取用户积分日志总数
 */
export async function getUserCreditLogsCount(userId: string): Promise<number> {
  return prisma.creditLog.count({
    where: { userId }
  });
}

/**
 * 调整用户积分（管理员操作，支持增加或减少）
 */
export async function adjustUserCredits(
  userId: string,
  amount: number,
  description?: string
): Promise<void> {
  if (amount === 0) {
    throw new Error("调整积分数量不能为 0");
  }

  await prisma.$transaction(async (tx) => {
    // 如果是减少积分，需要检查余额
    if (amount < 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true }
      });

      if (!user) {
        throw new Error("用户不存在");
      }

      if (user.credits + amount < 0) {
        throw new Error("调整后积分不能为负数");
      }
    }

    // 调整积分
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } }
    });

    // 记录日志
    await tx.creditLog.create({
      data: {
        userId,
        amount,
        type: "admin_adjust",
        description: description || (amount > 0 ? "管理员增加积分" : "管理员减少积分")
      }
    });
  });
}
