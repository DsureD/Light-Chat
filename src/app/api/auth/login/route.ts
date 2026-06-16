import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { jsonError, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, resetRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // 获取客户端 IP
    const clientIp = getClientIp(request);

    // 检查频率限制
    const rateLimitResult = checkRateLimit(clientIp, "login");
    if (!rateLimitResult.allowed) {
      return jsonError(
        `登录尝试次数过多，请在 ${rateLimitResult.retryAfter} 秒后重试。`,
        429
      );
    }

    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      return jsonError("请输入用户名和密码。", 400);
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return jsonError("用户名或密码错误。", 401);
    }

    // 检查用户状态
    if (user.status === "banned") {
      return jsonError("您的账号已被封禁，无法登录。如有疑问请联系管理员。", 403);
    }

    // 登录成功，重置该 IP 的登录频率限制
    resetRateLimit(clientIp, "login");

    const publicUser = { id: user.id, username: user.username, role: user.role };
    const response = NextResponse.json({ user: publicUser });
    setSessionCookie(
      response,
      createSessionToken({
        userId: publicUser.id,
        username: publicUser.username,
        role: publicUser.role
      })
    );
    return response;
  } catch (error) {
    return routeError(error);
  }
}
