import { prisma } from "./prisma";
import { getRedeemCodeLength } from "./config";

/**
 * 生成随机兑换码
 */
export function generateRedeemCode(length?: number, prefix?: string): string {
  const codeLength = length ?? getRedeemCodeLength();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆的字符 I, O, 0, 1
  let code = "";

  for (let i = 0; i < codeLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return prefix ? `${prefix}-${code}` : code;
}

/**
 * 验证兑换码是否可用
 */
export async function validateRedeemCode(code: string) {
  const redeemCode = await prisma.redeemCode.findUnique({
    where: { code: code.toUpperCase() }
  });

  if (!redeemCode) {
    throw new Error("兑换码不存在");
  }

  if (redeemCode.status !== "active") {
    throw new Error("兑换码已被禁用");
  }

  // 检查是否过期
  if (redeemCode.expiresAt && redeemCode.expiresAt < new Date()) {
    throw new Error("兑换码已过期");
  }

  // 检查使用次数
  if (redeemCode.maxUses !== -1 && redeemCode.usedCount >= redeemCode.maxUses) {
    throw new Error("兑换码已达到使用次数上限");
  }

  return redeemCode;
}

/**
 * 使用兑换码
 */
export async function useRedeemCode(userId: string, code: string): Promise<number> {
  const upperCode = code.toUpperCase().trim();

  return await prisma.$transaction(async (tx) => {
    // 验证兑换码
    const redeemCode = await tx.redeemCode.findUnique({
      where: { code: upperCode }
    });

    if (!redeemCode) {
      throw new Error("兑换码不存在");
    }

    if (redeemCode.status !== "active") {
      throw new Error("兑换码已被禁用");
    }

    // 检查是否过期
    if (redeemCode.expiresAt && redeemCode.expiresAt < new Date()) {
      throw new Error("兑换码已过期");
    }

    // 检查使用次数
    if (redeemCode.maxUses !== -1 && redeemCode.usedCount >= redeemCode.maxUses) {
      throw new Error("兑换码已达到使用次数上限");
    }

    // 检查用户是否已使用过该兑换码
    const existingLog = await tx.redeemLog.findFirst({
      where: {
        userId,
        redeemCodeId: redeemCode.id
      }
    });

    if (existingLog) {
      throw new Error("您已使用过该兑换码");
    }

    // 增加用户积分
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: redeemCode.credits } }
    });

    // 更新兑换码使用次数
    await tx.redeemCode.update({
      where: { id: redeemCode.id },
      data: { usedCount: { increment: 1 } }
    });

    // 记录兑换日志
    await tx.redeemLog.create({
      data: {
        userId,
        redeemCodeId: redeemCode.id,
        credits: redeemCode.credits
      }
    });

    // 记录积分日志
    await tx.creditLog.create({
      data: {
        userId,
        amount: redeemCode.credits,
        type: "redeem",
        description: `使用兑换码：${upperCode}`
      }
    });

    return redeemCode.credits;
  });
}

/**
 * 创建兑换码
 */
export async function createRedeemCode(
  adminId: string,
  credits: number,
  maxUses: number = 1,
  expiresAt?: Date,
  description?: string,
  prefix?: string
): Promise<string> {
  const [code] = await createRedeemCodes(adminId, 1, credits, maxUses, expiresAt, description, prefix);
  return code;
}

/**
 * 批量创建兑换码：内存生成候选 → 一次查重 → createMany 一次写入，
 * 避免逐个 findUnique + create 造成上百次串行 SQL。
 */
export async function createRedeemCodes(
  adminId: string,
  count: number,
  credits: number,
  maxUses: number = 1,
  expiresAt?: Date,
  description?: string,
  prefix?: string
): Promise<string[]> {
  const created: string[] = [];
  let attempts = 0;

  while (created.length < count) {
    if (attempts++ >= 10) {
      throw new Error("生成兑换码失败，请重试");
    }

    // 生成本批候选（Set 保证本批内不重复）
    const need = count - created.length;
    const candidates = new Set<string>();
    while (candidates.size < need) {
      candidates.add(generateRedeemCode(undefined, prefix));
    }

    // 一次查重，过滤掉库中已存在的
    const list = Array.from(candidates);
    const existing = await prisma.redeemCode.findMany({
      where: { code: { in: list } },
      select: { code: true }
    });
    const taken = new Set(existing.map((row) => row.code));
    const fresh = list.filter((code) => !taken.has(code));

    if (fresh.length === 0) {
      continue;
    }

    try {
      await prisma.redeemCode.createMany({
        data: fresh.map((code) => ({
          code,
          credits,
          maxUses,
          expiresAt,
          description,
          createdBy: adminId,
          status: "active"
        }))
      });
    } catch {
      // 极小概率：查重与写入之间被并发插入了相同 code，整批重试
      continue;
    }

    created.push(...fresh);
  }

  return created;
}

/**
 * 获取兑换码的使用记录（最多返回最近 200 条，避免无限次兑换码全量拉取）
 */
export async function getRedeemCodeLogs(redeemCodeId: string) {
  return prisma.redeemLog.findMany({
    where: { redeemCodeId },
    include: {
      user: {
        select: {
          id: true,
          username: true
        }
      }
    },
    orderBy: { redeemedAt: "desc" },
    take: 200
  });
}
