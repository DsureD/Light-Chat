import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getDefaultUserCredits, isUserRegistrationAllowed, isInviteCodeRequired, getDefaultModelIds } from "@/lib/config";
import { validateRedeemCode } from "@/lib/redeem";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // 系统中还没有任何用户时，本次注册视为初始化：
    // 不受"关闭注册/邀请码必填"限制，并将该用户设为管理员（最终以事务内的判断为准）
    const isFirstUser = (await prisma.user.findFirst({ select: { id: true } })) === null;

    // 检查是否允许注册（首个用户除外）
    if (!isFirstUser && !isUserRegistrationAllowed()) {
      return jsonError("管理员已关闭用户注册功能。", 403);
    }

    // 获取客户端 IP 并检查频率限制
    const clientIp = getClientIp(request);
    const rateLimitResult = checkRateLimit(clientIp, "register");
    if (!rateLimitResult.allowed) {
      return jsonError(
        `注册请求过于频繁，请在 ${rateLimitResult.retryAfter} 秒后重试。`,
        429
      );
    }

    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const inviteCode = body.inviteCode ? String(body.inviteCode).trim() : "";

    // 验证用户名长度
    if (username.length <= 4 || username.length > 32) {
      return jsonError("用户名长度需为 5-32 位。", 400);
    }

    // 验证用户名字符：仅允许字母、数字、下划线、连字符，避免空格/特殊字符
    if (!/^[A-Za-z0-9_-]+$/.test(username)) {
      return jsonError("用户名只能包含字母、数字、下划线和连字符。", 400);
    }

    // 验证密码长度
    if (password.length < 8) {
      return jsonError("密码长度至少为 8 位。", 400);
    }

    // 检查是否需要邀请码（首个用户除外）
    if (!isFirstUser && isInviteCodeRequired() && !inviteCode) {
      return jsonError("注册需要邀请码，请输入邀请码。", 400);
    }

    // 预校验邀请码（仅用于尽早给出友好报错；真正的扣减在事务内原子完成）
    if (inviteCode) {
      try {
        await validateRedeemCode(inviteCode);
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : "邀请码无效。", 400);
      }
    }

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return jsonError("用户名已被使用。", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // 在事务中处理邀请码并创建用户
    const result = await prisma.$transaction(async (tx) => {
      let inviteCredits = 0;
      let redeemCodeId: string | undefined;

      // 邀请码：在事务内原子抢用，避免并发超额使用 / 超发积分
      if (inviteCode) {
        const upperCode = inviteCode.toUpperCase();
        const redeemCode = await tx.redeemCode.findUnique({
          where: { code: upperCode }
        });

        if (!redeemCode) {
          throw new Error("邀请码不存在");
        }

        if (redeemCode.status !== "active") {
          throw new Error("邀请码已被禁用");
        }

        if (redeemCode.expiresAt && redeemCode.expiresAt < new Date()) {
          throw new Error("邀请码已过期");
        }

        // 条件递增：仅当未达上限时才 +1，靠 count 判断是否抢用成功（防 TOCTOU）
        const claim = await tx.redeemCode.updateMany({
          where: {
            id: redeemCode.id,
            status: "active",
            OR: [
              { maxUses: -1 },
              { usedCount: { lt: redeemCode.maxUses } }
            ]
          },
          data: { usedCount: { increment: 1 } }
        });

        if (claim.count === 0) {
          throw new Error("邀请码已达到使用次数上限");
        }

        inviteCredits = redeemCode.credits;
        redeemCodeId = redeemCode.id;
      }

      // 在事务内重新确认是否为首个用户，避免并发注册时产生多个管理员
      const isAdmin = (await tx.user.findFirst({ select: { id: true } })) === null;

      // 创建用户：首个用户为管理员并赋予充足积分，其余为普通用户
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          role: isAdmin ? "ADMIN" : "USER",
          credits: isAdmin ? 999999 : getDefaultUserCredits() + inviteCredits,
          status: "active"
        },
        select: { id: true, username: true, role: true, credits: true }
      });

      // 为新用户分配默认模型权限
      const defaultModelIds = getDefaultModelIds();
      if (defaultModelIds.length > 0) {
        // 验证这些模型是否存在且启用
        const existingModels = await tx.model.findMany({
          where: {
            id: { in: defaultModelIds },
            enabled: true
          },
          select: { id: true }
        });

        // 只分配存在且启用的模型
        const validModelIds = existingModels.map(m => m.id);
        if (validModelIds.length > 0) {
          await tx.userModelPermission.createMany({
            data: validModelIds.map(modelId => ({
              userId: user.id,
              modelId,
              enabled: true
            }))
          });
        }
      }

      // 如果使用了邀请码，记录兑换日志和积分日志
      if (redeemCodeId && inviteCredits > 0) {
        await tx.redeemLog.create({
          data: {
            userId: user.id,
            redeemCodeId,
            credits: inviteCredits
          }
        });

        await tx.creditLog.create({
          data: {
            userId: user.id,
            amount: inviteCredits,
            type: "redeem",
            description: `注册使用邀请码：${inviteCode}`
          }
        });
      }

      return { user, inviteCredits };
    });

    // 创建 session
    const { user: createdUser, inviteCredits } = result;
    const message = createdUser.role === "ADMIN"
      ? "注册成功！您是第一位用户，已自动成为管理员。"
      : inviteCredits > 0
        ? `注册成功！使用邀请码获得 ${inviteCredits} 积分。`
        : "注册成功！";
    const response = NextResponse.json({
      user: createdUser,
      message
    });

    setSessionCookie(
      response,
      createSessionToken({
        userId: createdUser.id,
        username: createdUser.username,
        role: createdUser.role
      })
    );

    return response;
  } catch (error) {
    // 事务内抛出的邀请码相关错误属于客户端可纠正的输入问题，返回 400
    if (error instanceof Error && error.message.includes("邀请码")) {
      return jsonError(error.message, 400);
    }
    return routeError(error);
  }
}
