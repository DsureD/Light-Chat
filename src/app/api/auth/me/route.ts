import { getSessionUser } from "@/lib/auth";
import { jsonOk } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  return jsonOk({ user });
}
