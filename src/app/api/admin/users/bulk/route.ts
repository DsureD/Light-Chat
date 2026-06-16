import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-log";

// POST /api/admin/users/bulk - 批量操作用户
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const action = body.action; // "delete" | "grant_credits" | "update_status"
    const userIds = body.userIds as string[];
    const value = body.value; // 根据action不同含义不同

    if (!action || !Array.isArray(userIds) || userIds.length === 0) {
      return jsonError("无效的请求参数", 400);
    }

    if (userIds.length > 100) {
      return jsonError("一次最多操作 100 个用户", 400);
    }

    let result: { deleted?: number; granted?: number; updated?: number; credits?: number; status?: string } = {};

    switch (action) {
      case "delete":
        // 批量删除用户
        await prisma.user.updateMany({
          where: {
            id: { in: userIds },
            role: "USER" // 只能删除普通用户
          },
          data: { deletedAt: new Date() }
        });

        await logAdminAction(admin.id, "bulk_delete_users", "user", userIds.join(","), {
          count: userIds.length
        });

        result = { deleted: userIds.length };
        break;

      case "grant_credits":
        // 批量充值积分
        const credits = parseInt(String(value), 10);
        if (isNaN(credits) || credits === 0) {
          return jsonError("积分数量无效", 400);
        }

        // 更新积分
        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { credits: { increment: credits } }
        });

        // 记录日志
        const creditLogs = userIds.map(userId => ({
          userId,
          amount: credits,
          type: "admin_grant" as const,
          description: `批量充值 ${credits} 积分`
        }));

        await prisma.creditLog.createMany({
          data: creditLogs
        });

        await logAdminAction(admin.id, "bulk_grant_credits", "user", userIds.join(","), {
          count: userIds.length,
          credits
        });

        result = { granted: userIds.length, credits };
        break;

      case "update_status":
        // 批量修改状态
        const newStatus = value;
        if (!["active", "suspended", "banned"].includes(newStatus)) {
          return jsonError("无效的状态", 400);
        }

        await prisma.user.updateMany({
          where: {
            id: { in: userIds },
            role: "USER" // 只能修改普通用户
          },
          data: { status: newStatus }
        });

        await logAdminAction(admin.id, "bulk_update_status", "user", userIds.join(","), {
          count: userIds.length,
          status: newStatus
        });

        result = { updated: userIds.length, status: newStatus };
        break;

      default:
        return jsonError("不支持的操作", 400);
    }

    return jsonOk({
      message: "批量操作成功",
      result
    });
  } catch (error) {
    return routeError(error);
  }
}
