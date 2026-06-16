import { decryptText } from "./crypto";
import { normalizeBaseUrl } from "./http";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
};

export type ProviderConfig = {
  baseUrl: string;
  apiKeyEncrypted: string;
};

export function getProviderHeaders(provider: ProviderConfig) {
  return {
    Authorization: `Bearer ${decryptText(provider.apiKeyEncrypted)}`,
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
  const response = await fetch(providerUrl(provider, "/v1/models"), {
    method: "GET",
    headers: getProviderHeaders(provider),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`模型查询失败：${response.status} ${await response.text()}`);
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
