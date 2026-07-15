import { requireAdmin } from "@/lib/auth";
import { capabilitiesForType, fetchProviderModels, inferModelType } from "@/lib/openai";
import { jsonOk, PublicRouteError, routeError } from "@/lib/http";
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

    // 接口返回空列表多半是服务商侧异常，直接终止，避免下面的清理逻辑把模型全部删光
    if (modelNames.length === 0) {
      throw new PublicRouteError("服务商未返回任何模型，已取消同步以免误删现有模型。", 502);
    }

    // 一次查出已有模型，只对缺失的批量插入，
    // 避免上百条并行 upsert 把 SQLite 写锁打满
    const existing = await prisma.model.findMany({
      where: { providerId, name: { in: modelNames } },
      select: { name: true }
    });
    const existingNames = new Set(existing.map((model) => model.name));
    const newNames = modelNames.filter((name) => !existingNames.has(name));

    // 清理已不在服务商列表中的模型（连带级联删除对应的用户模型授权）
    const removed = await prisma.model.deleteMany({
      where: { providerId, name: { notIn: modelNames } }
    });

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
      where: { providerId },
      orderBy: { name: "asc" }
    });

    return jsonOk({
      count: models.length,
      added: newNames.length,
      removed: removed.count,
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
