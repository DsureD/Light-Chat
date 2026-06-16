import { NextRequest } from "next/server";

type SessionPayload = {
  userId: string;
  username: string;
  role: string;
  expiresAt: number;
};

function getSessionSecret() {
  const secret = process.env.APP_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("APP_SECRET must be at least 32 characters long.");
  }

  return secret;
}

async function signWithWebCrypto(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  // Convert ArrayBuffer to base64url
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// 常数时间比较，避免逐字符比较造成的时序侧信道（edge runtime 无 node:crypto，手动实现）
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  // Verify signature
  const expectedSignature = await signWithWebCrypto(body);
  if (!safeEqual(expectedSignature, signature)) {
    return null;
  }

  try {
    // Decode base64url
    const base64 = body.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const jsonString = atob(base64 + padding);

    const payload = JSON.parse(jsonString) as SessionPayload;

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function verifySessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get("light_chat_session")?.value;
  return verifySession(token);
}
