import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

// 图片上传目录：public/uploads，会被静态服务直接暴露为 /uploads/xxx
// 注意（standalone 部署）：构建产物 standalone 不会自动包含 public 目录，
// 部署时需将 public 一并拷贝到 server 同级，并确保 public/uploads 可写。
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const PUBLIC_PREFIX = "/uploads";

// content-type 到扩展名的简单映射
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

// 扩展名反查 content-type（用于把落盘文件读回为 data URL）
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif"
};

/** 判断 MIME 类型是否为允许上传的图片类型 */
export function isAllowedImageMime(mime: string): boolean {
  return Boolean(EXT_BY_MIME[mime.toLowerCase()]);
}

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

function randomFileName(ext: string) {
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
}

/**
 * 将二进制数据保存到 public/uploads，返回可公开访问的相对 URL（/uploads/xxx）。
 */
export async function saveImageBuffer(buffer: Buffer, mime = "image/png"): Promise<string> {
  await ensureUploadDir();
  const ext = EXT_BY_MIME[mime.toLowerCase()] || "png";
  const fileName = randomFileName(ext);
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), buffer);
  return `${PUBLIC_PREFIX}/${fileName}`;
}

/**
 * 保存 base64 字符串（不含 data: 前缀）为图片文件，返回相对 URL。
 */
export async function saveBase64Image(base64: string, mime = "image/png"): Promise<string> {
  return saveImageBuffer(Buffer.from(base64, "base64"), mime);
}

/**
 * 下载远程图片 URL 并落地到本地，返回相对 URL。
 * 第三方接口（如 DALL·E）返回的 URL 通常有有效期，落地后可长期访问。
 * 下载失败时抛错，由调用方决定降级处理。
 */
export async function saveImageFromUrl(remoteUrl: string): Promise<string> {
  const response = await fetch(remoteUrl);

  if (!response.ok) {
    throw new Error(`下载远程图片失败：${response.status}`);
  }

  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  return saveImageBuffer(Buffer.from(arrayBuffer), mime);
}

/**
 * 把本地上传文件的相对 URL（/uploads/xxx）读回为 data URL，
 * 用于在调用上游模型时内联图片内容（上游无法访问本站相对路径）。
 * URL 不合法、含路径穿越或文件不存在时返回 null。
 */
export async function readUploadAsDataUrl(publicUrl: string): Promise<string | null> {
  if (!publicUrl.startsWith(`${PUBLIC_PREFIX}/`)) {
    return null;
  }

  const fileName = publicUrl.slice(PUBLIC_PREFIX.length + 1);

  // 仅允许纯文件名，拒绝任何形式的路径穿越
  if (!/^[A-Za-z0-9._-]+$/.test(fileName) || fileName.includes("..")) {
    return null;
  }

  try {
    const buffer = await fs.readFile(path.join(UPLOAD_DIR, fileName));
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const mime = MIME_BY_EXT[ext] || "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
