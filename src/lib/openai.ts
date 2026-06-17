import { decryptText } from "./crypto";
import { normalizeBaseUrl, PublicRouteError } from "./http";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
};

export type ProviderConfig = {
  baseUrl: string;
  apiKeyEncrypted: string;
};

function assertHeaderSafe(value: string, fieldName: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (code > 255 || code === 10 || code === 13 || code === 0) {
      throw new PublicRouteError(`${fieldName} 包含不能放入 HTTP Header 的字符，请重新粘贴纯 API Key，不要带中文说明、换行或全角符号。`, 400);
    }
  }
}

export function normalizeProviderApiKey(apiKey: string) {
  const value = apiKey.trim();

  if (!value) {
    throw new PublicRouteError("API Key 不能为空。", 400);
  }

  assertHeaderSafe(value, "API Key");
  return value;
}

export function getProviderHeaders(provider: ProviderConfig) {
  const apiKey = normalizeProviderApiKey(decryptText(provider.apiKeyEncrypted));

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

export function providerUrl(provider: Pick<ProviderConfig, "baseUrl">, path: string) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const apiPath = path.startsWith("/") ? path : `/${path}`;

  if (baseUrl.toLowerCase().endsWith("/v1") && apiPath.startsWith("/v1/")) {
    return `${baseUrl}${apiPath.slice(3)}`;
  }

  return `${baseUrl}${apiPath}`;
}

export async function fetchProviderModels(provider: ProviderConfig): Promise<string[]> {
  let response: Response;

  try {
    response = await fetch(providerUrl(provider, "/v1/models"), {
      method: "GET",
      headers: getProviderHeaders(provider),
      cache: "no-store"
    });
  } catch (error) {
    if (error instanceof PublicRouteError) {
      throw error;
    }

    throw new PublicRouteError("模型查询失败：无法连接服务商，请检查 Base URL 是否正确，或服务商网络是否可达。", 502);
  }

  if (!response.ok) {
    throw new PublicRouteError(`模型查询失败：${response.status} ${await response.text()}`, 502);
  }

  const payload = await response.json();
  const data: Array<{ id?: unknown; name?: unknown }> = Array.isArray(payload?.data) ? payload.data : [];

  return data
    .map((item: { id?: unknown; name?: unknown }) => String(item.id || item.name || "").trim())
    .filter(Boolean);
}

export function inferModelType(modelName: string) {
  const lowerName = modelName.toLowerCase();

  if (["dall-e", "image", "flux", "sd", "stable-diffusion", "midjourney"].some((keyword) => lowerName.includes(keyword))) {
    return "image";
  }

  if (["vision", "vl", "gpt-4o", "qwen-vl", "gemini"].some((keyword) => lowerName.includes(keyword))) {
    return "vision";
  }

  return "chat";
}

export function capabilitiesForType(type: string) {
  if (type === "image") {
    return "image";
  }

  if (type === "vision") {
    return "chat,vision";
  }

  return "chat";
}
