import { NextResponse } from "next/server";

export class PublicRouteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PublicRouteError";
    this.status = status;
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function normalizeBaseUrl(baseUrl: string) {
  const value = baseUrl.trim().replace(/\/+$/, "");

  if (!value) {
    return "";
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new PublicRouteError("Base URL 格式不正确，请填写完整地址，例如 https://api.example.com。", 400);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PublicRouteError("Base URL 只支持 http 或 https 地址。", 400);
  }

  return value;
}

export function routeError(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  if (error instanceof PublicRouteError) {
    return jsonError(error.message, error.status);
  }

  // 未预期的错误只在服务端记录详情，对客户端返回通用文案，
  // 避免把 Prisma/内部错误细节（表名、查询等）泄露给前端。
  console.error("[RouteError]", error);
  return jsonError("服务器内部错误，请稍后重试。", 500);
}
