import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function LoginPage() {
  // findFirst 代替 count：只需判断"是否有用户"，O(1) 而非全表扫描
  const hasUsers = await prisma.user.findFirst({ select: { id: true } });

  // 系统中还没有任何用户时，引导到注册页（第一个注册的用户将成为管理员）
  if (!hasUsers) {
    redirect("/register");
  }

  const user = await getSessionUser();

  if (user) {
    redirect("/chat");
  }

  return <LoginClient />;
}
