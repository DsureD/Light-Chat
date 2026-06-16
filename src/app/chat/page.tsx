import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ChatClient } from "./ChatClient";

export default async function ChatPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <ChatClient username={user.username} role={user.role} />;
}
