import { NextResponse } from "next/server";
import { isUserRegistrationAllowed, isInviteCodeRequired } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/auth/register/config - 获取注册配置（公开接口）
export async function GET() {
  // 系统中还没有任何用户时，首次注册不受限制，且该用户将成为管理员
  // findFirst 代替 count：只需判断"是否有用户"，O(1) 而非全表扫描
  const isFirstUser = (await prisma.user.findFirst({ select: { id: true } })) === null;

  return NextResponse.json({
    registrationAllowed: isFirstUser || isUserRegistrationAllowed(),
    inviteCodeRequired: isFirstUser ? false : isInviteCodeRequired(),
    isFirstUser
  });
}
