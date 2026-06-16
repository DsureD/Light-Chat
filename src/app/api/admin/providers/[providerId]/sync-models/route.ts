import { requireAdmin } from "@/lib/auth";
import { capabilitiesForType, fetchProviderModels, inferModelType } from "@/lib/openai";
import { jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ providerId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { providerId } = await context.params;
    const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    const modelNames = Array.from(new Set(await fetchProviderModels(provider)));

    // 一次查出已有模型，只对缺失的批量插入，
    // 避免上百条并行 upsert 把 SQLite 写锁打满
    const existing = await prisma.model.findMany({
      where: { providerId, name: { in: modelNames } },
      select: { name: true }
    });
    const existingNames = new Set(existing.map((model) => model.name));
    const newNames = modelNames.filter((name) => !existingNames.has(name));

    if (newNames.length > 0) {
      await prisma.model.createMany({
        data: newNames.map((name) => {
          const type = inferModelType(name);

          return {
            providerId,
            name,
            type,
            capabilities: capabilitiesForType(type),
            enabled: true
          };
        })
      });
    }

    const models = await prisma.model.findMany({
      where: { providerId, name: { in: modelNames } },
      orderBy: { name: "asc" }
    });

    return jsonOk({
      count: models.length,
      models: models.map((model) => ({
        id: model.id,
        providerId: model.providerId,
        name: model.name,
        type: model.type,
        capabilities: model.capabilities,
        enabled: model.enabled
      }))
    });
  } catch (error) {
    return routeError(error);
  }
}
