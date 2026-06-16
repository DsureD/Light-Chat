import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { useRedeemCode } from "@/lib/redeem";
import { getUserCredits } from "@/lib/credits";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/redeem - 使用兑换码
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    // 检查频率限制（基于用户 ID）
    const rateLimitResult = checkRateLimit(user.id, "redeem");
    if (!rateLimitResult.allowed) {
      return jsonError(
        `兑换请求过于频繁，请在 ${rateLimitResult.retryAfter} 秒后重试。`,
        429
      );
    }

    const body = await request.json();
    const code = String(body.code || "").trim();

    if (!code) {
      return jsonError("请输入兑换码。", 400);
    }

    // 使用兑换码（注意：useRedeemCode是普通函数，不是React Hook）
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const credits = await useRedeemCode(user.id, code);

    // 获取更新后的积分余额
    const newBalance = await getUserCredits(user.id);

    return jsonOk({
      credits,
      newBalance,
      message: `兑换成功！获得 ${credits} 积分。`
    });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(error.message, 400);
    }
    return routeError(error);
  }
}
