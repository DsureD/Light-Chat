import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ modelId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { modelId } = await context.params;
    const body = await request.json();
    const data: Record<string, string | boolean> = {};

    if (typeof body.name === "string") {
      data.name = body.name.trim();
    }

    if (typeof body.type === "string") {
      data.type = body.type.trim();
    }

    if (typeof body.capabilities === "string") {
      data.capabilities = body.capabilities.trim();
    }

    if (typeof body.enabled === "boolean") {
      data.enabled = body.enabled;
    }

    if (Object.keys(data).length === 0) {
      return jsonError("没有可更新的字段。", 400);
    }

    const model = await prisma.model.update({ where: { id: modelId }, data });
    return jsonOk({ model });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { modelId } = await context.params;
    await prisma.model.delete({ where: { id: modelId } });
    return jsonOk({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
