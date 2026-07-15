import { decryptText, encryptText } from "./crypto";
import { normalizeBaseUrl, PublicRouteError } from "./http";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
};

export type ProviderConfig = {
  baseUrl: string;
  apiKeyEncrypted: string;
  customHeadersEncrypted?: string | null;
};

export type CustomHeader = { name: string; value: string };

const RESERVED_HEADERS = new Set(["authorization", "content-type", "host", "content-length", "connection", "transfer-encoding"]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MAX_CUSTOM_HEADERS = 30;

export function validateCustomHeaders(headers: CustomHeader[]) {
  if (headers.length > MAX_CUSTOM_HEADERS) {
    throw new PublicRouteError(`自定义请求头最多允许 ${MAX_CUSTOM_HEADERS} 个。`, 400);
  }

  const seen = new Set<string>();
  return headers.map((header) => {
    const name = String(header.name || "").trim();
    const value = String(header.value ?? "");
    const normalizedName = name.toLowerCase();

    if (!name || !HEADER_NAME_PATTERN.test(name) || name.length > 128) {
      throw new PublicRouteError(`请求头名称“${name || "（空）"}”不合法。`, 400);
    }
    if (RESERVED_HEADERS.has(normalizedName)) {
      throw new PublicRouteError(`请求头 ${name} 由系统管理，不能自定义。`, 400);
    }
    if (seen.has(normalizedName)) {
      throw new PublicRouteError(`请求头 ${name} 重复，请保留一项。`, 400);
    }
    if (!value || value.length > 8192) {
      throw new PublicRouteError(`请求头 ${name} 的值不能为空且不能超过 8192 个字符。`, 400);
    }

    assertHeaderSafe(value, `请求头 ${name}`);
    seen.add(normalizedName);
    return { name, value };
  });
}

export function readCustomHeaders(provider: Pick<ProviderConfig, "customHeadersEncrypted">): CustomHeader[] {
  if (!provider.customHeadersEncrypted) return [];
  const parsed = JSON.parse(decryptText(provider.customHeadersEncrypted));
  if (!Array.isArray(parsed)) throw new PublicRouteError("服务商自定义请求头配置损坏。", 500);
  return validateCustomHeaders(parsed);
}

export function encryptCustomHeaders(headers: CustomHeader[]) {
  const validated = validateCustomHeaders(headers);
  return validated.length ? encryptText(JSON.stringify(validated)) : null;
}

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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  for (const header of readCustomHeaders(provider)) headers[header.name] = header.value;
  return headers;
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
