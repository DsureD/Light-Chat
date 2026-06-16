import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RedeemCodesClient } from "./RedeemCodesClient";
import { verifySession } from "@/lib/session";

export default async function RedeemCodesPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("light_chat_session");

  if (!sessionCookie) {
    redirect("/login");
  }

  const session = await verifySession(sessionCookie.value);

  if (!session || session.role !== "admin") {
    redirect("/chat");
  }

  return <RedeemCodesClient />;
}
