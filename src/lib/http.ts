import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function routeError(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  // 未预期的错误只在服务端记录详情，对客户端返回通用文案，
  // 避免把 Prisma/内部错误细节（表名、查询等）泄露给前端。
  console.error("[RouteError]", error);
  return jsonError("服务器内部错误，请稍后重试。", 500);
}
