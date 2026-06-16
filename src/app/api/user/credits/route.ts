import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { getUserCredits, getUserCreditLogs, getUserCreditLogsCount } from "@/lib/credits";
import { NextRequest } from "next/server";

// GET /api/user/credits - 用户查看自己的积分和日志
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    const credits = await getUserCredits(user.id);
    const logs = await getUserCreditLogs(user.id, limit, offset);
    const total = await getUserCreditLogsCount(user.id);

    return jsonOk({
      credits,
      logs: logs.map((log) => ({
        id: log.id,
        amount: log.amount,
        type: log.type,
        modelName: log.modelName,
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
