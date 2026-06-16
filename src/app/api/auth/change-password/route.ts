import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    // 检查频率限制（基于用户 ID）
    const rateLimitResult = checkRateLimit(user.id, "passwordChange");
    if (!rateLimitResult.allowed) {
      return jsonError(
        `密码修改请求过于频繁，请在 ${rateLimitResult.retryAfter} 秒后重试。`,
        429
      );
    }

    const body = await request.json();
    const oldPassword = String(body.oldPassword || "");
    const newPassword = String(body.newPassword || "");

    if (!oldPassword || !newPassword) {
      return jsonError("请输入旧密码和新密码。", 400);
    }

    if (newPassword.length < 8) {
      return jsonError("新密码长度至少为 8 位。", 400);
    }

    // 获取完整用户信息
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id }
    });

    if (!fullUser) {
      return jsonError("用户不存在。", 404);
    }

    // 验证旧密码
    const isValidPassword = await bcrypt.compare(oldPassword, fullUser.passwordHash);

    if (!isValidPassword) {
      return jsonError("旧密码错误。", 401);
    }

    // 更新密码
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12)
      }
    });

    return jsonOk({ message: "密码修改成功。" });
  } catch (error) {
    return routeError(error);
  }
}
