import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-log";
import { getRedeemCodeLogs } from "@/lib/redeem";

// GET /api/admin/redeem-codes/[codeId] - 获取兑换码详情（包含使用记录）
export async function GET(request: Request, { params }: { params: Promise<{ codeId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { codeId } = await params;

    const redeemCode = await prisma.redeemCode.findUnique({
      where: { id: codeId }
    });

    if (!redeemCode) {
      return jsonError("兑换码不存在。", 404);
    }

    const logs = await getRedeemCodeLogs(codeId);

    return jsonOk({
      redeemCode: {
        id: redeemCode.id,
        code: redeemCode.code,
        credits: redeemCode.credits,
        maxUses: redeemCode.maxUses,
        usedCount: redeemCode.usedCount,
        expiresAt: redeemCode.expiresAt?.toISOString() || null,
        status: redeemCode.status,
        description: redeemCode.description,
        createdAt: redeemCode.createdAt.toISOString(),
        updatedAt: redeemCode.updatedAt.toISOString()
      },
      logs: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        username: log.user?.username || "(已删除的用户)",
        credits: log.credits,
        redeemedAt: log.redeemedAt.toISOString()
      }))
    });
  } catch (error) {
    return routeError(error);
  }
}

// PATCH /api/admin/redeem-codes/[codeId] - 更新兑换码状态
export async function PATCH(request: Request, { params }: { params: Promise<{ codeId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { codeId } = await params;
    const body = await request.json();

    const status = body.status ? String(body.status) : undefined;

    if (status && !["active", "disabled"].includes(status)) {
      return jsonError("状态必须为 active 或 disabled。", 400);
    }

    const redeemCode = await prisma.redeemCode.update({
      where: { id: codeId },
      data: { status }
    });

    // 记录管理员操作
    await logAdminAction(admin.id, "update_redeem_code", "redeem_code", codeId, {
      status
    });

    return jsonOk({
      redeemCode: {
        id: redeemCode.id,
        code: redeemCode.code,
        status: redeemCode.status,
        updatedAt: redeemCode.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

// DELETE /api/admin/redeem-codes/[codeId] - 删除兑换码
export async function DELETE(request: Request, { params }: { params: Promise<{ codeId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { codeId } = await params;

    const redeemCode = await prisma.redeemCode.findUnique({
      where: { id: codeId },
      select: { code: true }
    });

    if (!redeemCode) {
      return jsonError("兑换码不存在。", 404);
    }

    await prisma.redeemCode.delete({
      where: { id: codeId }
    });

    // 记录管理员操作
    await logAdminAction(admin.id, "delete_redeem_code", "redeem_code", codeId, {
      code: redeemCode.code
    });

    return jsonOk({ message: "兑换码已删除。" });
  } catch (error) {
    return routeError(error);
  }
}
