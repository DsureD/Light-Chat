import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "./lib/session";

const CORS_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, X-Requested-With";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0"
};

function noStore(response: NextResponse) {
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

function configuredOrigins() {
  return (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const origins = configuredOrigins();

  if (!origin || origins.length === 0) {
    return null;
  }

  if (origins.includes("*")) {
    return "*";
  }

  return origins.includes(origin) ? origin : null;
}

function applyCorsHeaders(response: NextResponse, allowedOrigin: string | null) {
  if (!allowedOrigin) {
    return response;
  }

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");

  if (allowedOrigin !== "*") {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

function getSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get("light_chat_session")?.value;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeProtocol(value: string | null) {
  const protocol = value?.replace(/:$/, "").toLowerCase();
  return protocol === "http" || protocol === "https" ? protocol : null;
}

function redirectTo(request: NextRequest, pathname: string) {
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = normalizeProtocol(firstForwardedValue(request.headers.get("x-forwarded-proto")));

  if (forwardedHost) {
    const protocol = forwardedProto || normalizeProtocol(request.nextUrl.protocol) || "https";
    return NextResponse.redirect(new URL(pathname, `${protocol}://${forwardedHost}`));
  }

  return NextResponse.redirect(new URL(pathname, request.url));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 首页跳转交给 middleware 处理，避免被预渲染/CDN 当静态页缓存。
  // 仅判断登录态：有会话进 /chat，无会话进 /login；
  // 是否需要初始化（userCount===0）由 /login 页面负责再跳 /register。
  if (pathname === "/") {
    const session = await verifySession(getSessionToken(request));
    const target = session ? "/chat" : "/login";
    return noStore(redirectTo(request, target));
  }

  if (pathname === "/chat" || pathname === "/login") {
    return noStore(NextResponse.next());
  }

  const allowedOrigin = resolveCorsOrigin(request);
  const hasCorsConfig = configuredOrigins().length > 0;

  if (request.method === "OPTIONS") {
    if (hasCorsConfig && !allowedOrigin) {
      return new NextResponse(null, { status: 403 });
    }

    return applyCorsHeaders(new NextResponse(null, { status: 204 }), allowedOrigin);
  }

  // 权限检查
  const token = getSessionToken(request);
  const session = await verifySession(token);

  // 需要管理员权限的路由
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!session || session.role !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return applyCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), allowedOrigin);
      }
      return redirectTo(request, "/login");
    }
  }

  // 需要登录的路由
  if (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/api/user") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/images") ||
    pathname.startsWith("/api/conversations") ||
    pathname.startsWith("/api/models") ||
    pathname.startsWith("/api/redeem") ||
    pathname.startsWith("/api/uploads")
  ) {
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return applyCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), allowedOrigin);
      }
      return redirectTo(request, "/login");
    }
  }

  return applyCorsHeaders(NextResponse.next(), allowedOrigin);
}

export const config = {
  matcher: ["/", "/api/:path*", "/chat", "/login", "/admin/:path*", "/profile/:path*"]
};
