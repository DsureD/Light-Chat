import { requireAdmin } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { jsonError, jsonOk, normalizeBaseUrl, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ providerId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { providerId } = await context.params;
    const body = await request.json();

    const data: Record<string, string | boolean> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();

      if (!name) {
        return jsonError("服务商名称不能为空。", 400);
      }

      data.name = name;
    }

    if (typeof body.baseUrl === "string") {
      const baseUrl = normalizeBaseUrl(body.baseUrl);

      if (!baseUrl) {
        return jsonError("Base URL 不能为空。", 400);
      }

      data.baseUrl = baseUrl;
    }

    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      data.apiKeyEncrypted = encryptText(body.apiKey.trim());
    }

    if (typeof body.enabled === "boolean") {
      data.enabled = body.enabled;
    }

    if (Object.keys(data).length === 0) {
      return jsonError("没有可更新的字段。", 400);
    }

    const provider = await prisma.provider.update({
      where: { id: providerId },
      data
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

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { providerId } = await context.params;

    await prisma.provider.delete({ where: { id: providerId } });
    return jsonOk({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
