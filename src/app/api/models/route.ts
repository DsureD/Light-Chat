import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getUserAvailableModels } from "@/lib/permissions";

function noStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return noStore(jsonError("Unauthorized", 401));
    }

    // 获取用户可用的模型列表
    const models = await getUserAvailableModels(user.id);

    const response = jsonOk({
      models: models.map((model) => ({
        id: model.id,
        providerId: model.providerId,
        providerName: model.provider.name,
        name: model.name,
        type: model.type,
        capabilities: model.capabilities,
        enabled: model.enabled
      }))
    });

    return noStore(response);
  } catch (error) {
    return routeError(error);
  }
}
