import { requireAdmin } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { jsonError, jsonOk, normalizeBaseUrl, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();

    const providers = await prisma.provider.findMany({
      orderBy: { updatedAt: "desc" },
      include: { models: { orderBy: { name: "asc" } } }
    });

    return jsonOk({
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        enabled: provider.enabled,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString(),
        models: provider.models.map((model) => ({
          id: model.id,
          providerId: model.providerId,
          providerName: provider.name,
          name: model.name,
          type: model.type,
          capabilities: model.capabilities,
          enabled: model.enabled
        }))
      }))
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const name = String(body.name || "").trim();
    const baseUrl = normalizeBaseUrl(String(body.baseUrl || ""));
    const apiKey = String(body.apiKey || "").trim();

    if (!name || !baseUrl || !apiKey) {
      return jsonError("服务商名称、Base URL 和 API Key 都不能为空。", 400);
    }

    const provider = await prisma.provider.create({
      data: {
        name,
        baseUrl,
        apiKeyEncrypted: encryptText(apiKey),
        enabled: Boolean(body.enabled ?? true)
      }
    });

    return jsonOk({
      provider: {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        enabled: provider.enabled,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return routeError(error);
  }
}
