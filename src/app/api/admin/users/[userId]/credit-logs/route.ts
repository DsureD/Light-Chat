import { requireAdmin } from "@/lib/auth";
import { jsonOk, routeError } from "@/lib/http";
import { getUserCreditLogs, getUserCreditLogsCount } from "@/lib/credits";

// GET /api/admin/users/[userId]/credit-logs - 查看用户积分日志
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin();
    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const parsedPage = parseInt(searchParams.get("page") || "1", 10);
    const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const limit = 20;
    const offset = (page - 1) * limit;

    const logs = await getUserCreditLogs(userId, limit, offset);
    const total = await getUserCreditLogsCount(userId);

    return jsonOk({
      logs: logs.map((log) => ({
        id: log.id,
        amount: log.amount,
        type: log.type,
        modelName: log.modelName,
        conversationId: log.conversationId,
        description: log.description,
        createdAt: log.createdAt.toISOString()
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
