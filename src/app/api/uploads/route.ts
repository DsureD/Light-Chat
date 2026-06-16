import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedImageMime, saveImageBuffer } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 与前端限制保持一致：5MB

// POST /api/uploads - 上传聊天图片附件，落盘到 public/uploads，返回相对 URL。
// 消息中只存这个 URL，避免 base64 撑大数据库并随上下文反复重发。
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const rateLimitResult = checkRateLimit(user.id, "upload");
    if (!rateLimitResult.allowed) {
      return jsonError(`上传过于频繁，请在 ${rateLimitResult.retryAfter} 秒后重试。`, 429);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("请通过 multipart/form-data 的 file 字段上传文件。", 400);
    }

    if (!isAllowedImageMime(file.type)) {
      return jsonError("仅支持 PNG、JPEG、WebP、GIF 图片。", 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError("图片大小不能超过 5MB。", 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await saveImageBuffer(buffer, file.type);

    return jsonOk({ url });
  } catch (error) {
    return routeError(error);
  }
}
