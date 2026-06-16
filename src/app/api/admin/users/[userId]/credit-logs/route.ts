import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { getUserCreditLogs } from "@/lib/credits";

// GET /api/admin/users/[userId]/credit-logs - 查看用户积分日志
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;

    const logs = await getUserCreditLogs(userId, 100);

    return jsonOk({
      logs: logs.map((log) => ({
        id: log.id,
        amount: log.amount,
        type: log.type,
        modelName: log.modelName,
        conversationId: log.conversationId,
        description: log.description,
        createdAt: log.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return routeError(error);
  }
}
