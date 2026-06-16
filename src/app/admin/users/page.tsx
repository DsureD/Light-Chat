import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UsersClient } from "./UsersClient";
import { verifySession } from "@/lib/session";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("light_chat_session");

  if (!sessionCookie) {
    redirect("/login");
  }

  const session = await verifySession(sessionCookie.value);

  if (!session || session.role !== "admin") {
    redirect("/chat");
  }

  return <UsersClient />;
}
