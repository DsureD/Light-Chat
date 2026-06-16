import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { adjustUserCredits, getUserCredits } from "@/lib/credits";
import { logAdminAction } from "@/lib/admin-log";

// POST /api/admin/users/[userId]/grant-credits - 为用户充值积分
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;
    const body = await request.json();

    const amount = parseInt(String(body.amount || "0"), 10);
    const description = body.description ? String(body.description).trim() : undefined;

    if (amount === 0) {
      return jsonError("积分变动数量不能为 0。", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { username: true }
    });

    if (!user) {
      return jsonError("用户不存在。", 404);
    }

    // 调整积分
    await adjustUserCredits(userId, amount, description || (amount > 0 ? "管理员充值" : "管理员扣除"));

    // 获取更新后的积分
    const newCredits = await getUserCredits(userId);

    // 记录管理员操作
    await logAdminAction(admin.id, "grant_credits", "user", userId, {
      amount,
      description,
      newCredits
    });

    return jsonOk({
      amount,
      newCredits,
      message: amount > 0 ? `成功为 ${user.username} 充值 ${amount} 积分。` : `成功为 ${user.username} 扣除 ${Math.abs(amount)} 积分。`
    });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(error.message, 400);
    }
    return routeError(error);
  }
}
