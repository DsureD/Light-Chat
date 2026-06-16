import { requireAdmin } from "@/lib/auth";
import { capabilitiesForType } from "@/lib/openai";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const providerId = String(body.providerId || "");
    const name = String(body.name || "").trim();
    const type = String(body.type || "chat").trim();
    const capabilities = String(body.capabilities || capabilitiesForType(type)).trim();

    if (!providerId || !name) {
      return jsonError("服务商和模型名称不能为空。", 400);
    }

    const model = await prisma.model.upsert({
      where: { providerId_name: { providerId, name } },
      create: {
        providerId,
        name,
        type,
        capabilities,
        enabled: Boolean(body.enabled ?? true)
      },
      update: {
        type,
        capabilities,
        enabled: Boolean(body.enabled ?? true)
      }
    });

    return jsonOk({ model });
  } catch (error) {
    return routeError(error);
  }
}
