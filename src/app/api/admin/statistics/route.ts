import { requireAdmin } from "@/lib/auth";
import { jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

// GET /api/admin/statistics - 管理员查看统计信息
export async function GET() {
  try {
    const admin = await requireAdmin();

    // 统计用户数量
    const totalUsers = await prisma.user.count({
      where: { role: "USER", deletedAt: null }
    });

    const activeUsers = await prisma.user.count({
      where: { role: "USER", status: "active", deletedAt: null }
    });

    const suspendedUsers = await prisma.user.count({
      where: { role: "USER", status: "suspended", deletedAt: null }
    });

    const bannedUsers = await prisma.user.count({
      where: { role: "USER", status: "banned", deletedAt: null }
    });

    // 统计积分
    const creditStats = await prisma.creditLog.aggregate({
      _sum: {
        amount: true
      },
      where: {
        type: { in: ["admin_grant", "admin_adjust", "redeem"] }
      }
    });

    const usedCreditsStats = await prisma.creditLog.aggregate({
      _sum: {
        amount: true
      },
      where: {
        type: { in: ["chat", "image"] }
      }
    });

    const totalCreditsGranted = creditStats._sum.amount || 0;
    const totalCreditsUsed = Math.abs(usedCreditsStats._sum.amount || 0);

    // 统计会话数量
    const totalConversations = await prisma.conversation.count();

    // 统计兑换码
    const totalRedeemCodes = await prisma.redeemCode.count();
    const activeRedeemCodes = await prisma.redeemCode.count({
      where: { status: "active" }
    });

    // 统计今日活跃
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayActiveUsers = await prisma.creditLog.groupBy({
      by: ["userId"],
      where: {
        createdAt: { gte: today },
        type: { in: ["chat", "image"] }
      }
    });

    const todayCreditsUsed = await prisma.creditLog.aggregate({
      _sum: {
        amount: true
      },
      where: {
        createdAt: { gte: today },
        type: { in: ["chat", "image"] }
      }
    });

    return jsonOk({
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        banned: bannedUsers
      },
      credits: {
        totalGranted: totalCreditsGranted,
        totalUsed: totalCreditsUsed,
        remaining: totalCreditsGranted - totalCreditsUsed
      },
      conversations: {
        total: totalConversations
      },
      redeemCodes: {
        total: totalRedeemCodes,
        active: activeRedeemCodes
      },
      today: {
        activeUsers: todayActiveUsers.length,
        creditsUsed: Math.abs(todayCreditsUsed._sum.amount || 0)
      }
    });
  } catch (error) {
    return routeError(error);
  }
}
