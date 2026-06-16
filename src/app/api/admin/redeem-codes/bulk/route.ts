import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-log";

// POST /api/admin/redeem-codes/bulk - 批量操作兑换码
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const action = body.action; // "delete" | "enable" | "disable"
    const codeIds = body.codeIds as string[];

    if (!action || !Array.isArray(codeIds) || codeIds.length === 0) {
      return jsonError("无效的请求参数", 400);
    }

    if (codeIds.length > 100) {
      return jsonError("一次最多操作 100 个兑换码", 400);
    }

    let result: { deleted?: number; enabled?: number; disabled?: number } = {};

    switch (action) {
      case "delete":
        // 批量删除
        await prisma.redeemCode.deleteMany({
          where: { id: { in: codeIds } }
        });

        await logAdminAction(admin.id, "bulk_delete_redeem_codes", "redeem_code", codeIds.join(","), {
          count: codeIds.length
        });

        result = { deleted: codeIds.length };
        break;

      case "enable":
        // 批量启用
        await prisma.redeemCode.updateMany({
          where: { id: { in: codeIds } },
          data: { status: "active" }
        });

        await logAdminAction(admin.id, "bulk_enable_redeem_codes", "redeem_code", codeIds.join(","), {
          count: codeIds.length
        });

        result = { enabled: codeIds.length };
        break;

      case "disable":
        // 批量禁用
        await prisma.redeemCode.updateMany({
          where: { id: { in: codeIds } },
          data: { status: "disabled" }
        });

        await logAdminAction(admin.id, "bulk_disable_redeem_codes", "redeem_code", codeIds.join(","), {
          count: codeIds.length
        });

        result = { disabled: codeIds.length };
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
