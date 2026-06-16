import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminLayout } from "./AdminLayout";

export default async function AdminPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/chat");
  }

  return <AdminLayout username={user.username} />;
}
