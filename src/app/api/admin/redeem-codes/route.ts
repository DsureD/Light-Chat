import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createRedeemCodes } from "@/lib/redeem";
import { logAdminAction } from "@/lib/admin-log";

// GET /api/admin/redeem-codes - 获取兑换码列表
export async function GET(request: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status") || "";
    const offset = (page - 1) * limit;

    const where: import("@prisma/client").Prisma.RedeemCodeWhereInput = {};
    const now = new Date();
    // 未过期条件：无过期时间，或过期时间在当前时间之后
    const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] };
    // 未用完条件：无限次，或已用次数小于上限
    const notUsedUp = {
      OR: [{ maxUses: -1 }, { usedCount: { lt: prisma.redeemCode.fields.maxUses } }]
    };

    if (status === "disabled") {
      where.status = "disabled";
    } else if (status === "expired") {
      // 已过期：未禁用，但已过期
      where.status = "active";
      where.expiresAt = { not: null, lt: now };
    } else if (status === "used_up") {
      // 已用完：未禁用、未过期，但已达到使用次数上限（无限次不算）
      where.status = "active";
      where.maxUses = { not: -1 };
      where.usedCount = { gte: prisma.redeemCode.fields.maxUses };
      where.AND = [notExpired];
    } else if (status === "active") {
      // 有效：未禁用、未过期、未用完
      where.status = "active";
      where.AND = [notExpired, notUsedUp];
    }

    const [redeemCodes, total] = await Promise.all([
      prisma.redeemCode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit
      }),
      prisma.redeemCode.count({ where })
    ]);

    return jsonOk({
      redeemCodes: redeemCodes.map((code) => ({
        id: code.id,
        code: code.code,
        credits: code.credits,
        maxUses: code.maxUses,
        usedCount: code.usedCount,
        expiresAt: code.expiresAt?.toISOString() || null,
        status: code.status,
        description: code.description,
        createdAt: code.createdAt.toISOString(),
        updatedAt: code.updatedAt.toISOString()
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

// POST /api/admin/redeem-codes - 创建兑换码
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const credits = parseInt(String(body.credits || "0"), 10);
    const maxUses = parseInt(String(body.maxUses || "1"), 10);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
    const description = body.description ? String(body.description).trim() : undefined;
    const prefix = body.prefix ? String(body.prefix).trim().toUpperCase() : undefined;
    const count = Math.min(Math.max(parseInt(String(body.count || "1"), 10), 1), 100);

    if (credits <= 0) {
      return jsonError("积分数量必须大于 0。", 400);
    }

    if (maxUses < -1 || maxUses === 0) {
      return jsonError("使用次数必须为正数或 -1（无限次）。", 400);
    }

    if (expiresAt && expiresAt <= new Date()) {
      return jsonError("过期时间必须在未来。", 400);
    }

    if (prefix && prefix.length > 6) {
      return jsonError("前缀最多6个字符。", 400);
    }

    // 批量生成兑换码（一次查重 + 一次批量写入）
    const codes = await createRedeemCodes(admin.id, count, credits, maxUses, expiresAt, description, prefix);

    // 记录管理员操作
    await logAdminAction(admin.id, "create_redeem_code", "redeem_code", codes.join(", "), {
      credits,
      maxUses,
      count,
      prefix,
      expiresAt: expiresAt?.toISOString(),
      description
    });

    // 返回生成的兑换码列表
    const redeemCodes = await prisma.redeemCode.findMany({
      where: { code: { in: codes } }
    });

    return jsonOk({
      redeemCodes: redeemCodes.map((code) => ({
        id: code.id,
        code: code.code,
        credits: code.credits,
        maxUses: code.maxUses,
        usedCount: code.usedCount,
        expiresAt: code.expiresAt?.toISOString() || null,
        status: code.status,
        description: code.description,
        createdAt: code.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return routeError(error);
  }
}
