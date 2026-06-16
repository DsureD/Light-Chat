import { requireAdmin } from "@/lib/auth";
import { jsonOk, routeError, jsonError } from "@/lib/http";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const ENV_FILE_PATH = path.join(process.cwd(), ".env.local");

// GET /api/admin/settings - 获取系统设置
export async function GET() {
  try {
    await requireAdmin();

    // 从环境变量读取当前设置
    const settings = {
      allowUserRegistration: process.env.ALLOW_USER_REGISTRATION !== "false",
      requireInviteCode: process.env.REQUIRE_INVITE_CODE_ON_REGISTER === "true",
      defaultUserCredits: parseInt(process.env.DEFAULT_USER_CREDITS || "1", 10),
      creditPerChatMessage: parseInt(process.env.CREDIT_PER_CHAT_MESSAGE || "1", 10),
      creditPerImageGeneration: parseInt(process.env.CREDIT_PER_IMAGE_GENERATION || "5", 10),
      maxConversationsPerUser: parseInt(process.env.MAX_CONVERSATIONS_PER_USER || "50", 10),
      maxMessagesPerConversation: parseInt(process.env.MAX_MESSAGES_PER_CONVERSATION || "100", 10),
      maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || "20", 10),
      redeemCodeLength: parseInt(process.env.REDEEM_CODE_LENGTH || "8", 10),
      defaultModelIds: (process.env.DEFAULT_MODEL_IDS || "").split(",").map(id => id.trim()).filter(id => id.length > 0)
    };

    return jsonOk({ settings });
  } catch (error) {
    return routeError(error);
  }
}

// PATCH /api/admin/settings - 更新系统设置
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();

    // 读取现有的 .env.local 文件
    let envContent = "";
    try {
      envContent = await readFile(ENV_FILE_PATH, "utf-8");
    } catch {
      // 文件不存在，创建新的
      envContent = "";
    }

    // 解析环境变量
    const envLines = envContent.split("\n");
    const envMap = new Map<string, string>();

    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key) {
          envMap.set(key.trim(), valueParts.join("=").trim());
        }
      }
    }

    // 更新设置
    if (typeof body.allowUserRegistration === "boolean") {
      envMap.set("ALLOW_USER_REGISTRATION", body.allowUserRegistration.toString());
    }

    if (typeof body.requireInviteCode === "boolean") {
      envMap.set("REQUIRE_INVITE_CODE_ON_REGISTER", body.requireInviteCode.toString());
    }

    if (typeof body.defaultUserCredits === "number" && body.defaultUserCredits >= 0) {
      envMap.set("DEFAULT_USER_CREDITS", body.defaultUserCredits.toString());
    }

    if (typeof body.creditPerChatMessage === "number" && body.creditPerChatMessage >= 0) {
      envMap.set("CREDIT_PER_CHAT_MESSAGE", body.creditPerChatMessage.toString());
    }

    if (typeof body.creditPerImageGeneration === "number" && body.creditPerImageGeneration >= 0) {
      envMap.set("CREDIT_PER_IMAGE_GENERATION", body.creditPerImageGeneration.toString());
    }

    if (typeof body.maxConversationsPerUser === "number" && body.maxConversationsPerUser > 0) {
      envMap.set("MAX_CONVERSATIONS_PER_USER", body.maxConversationsPerUser.toString());
    }

    if (typeof body.maxMessagesPerConversation === "number" && body.maxMessagesPerConversation > 0) {
      envMap.set("MAX_MESSAGES_PER_CONVERSATION", body.maxMessagesPerConversation.toString());
    }

    if (typeof body.maxContextMessages === "number" && body.maxContextMessages > 0) {
      envMap.set("MAX_CONTEXT_MESSAGES", body.maxContextMessages.toString());
    }

    if (typeof body.redeemCodeLength === "number" && body.redeemCodeLength >= 6 && body.redeemCodeLength <= 16) {
      envMap.set("REDEEM_CODE_LENGTH", body.redeemCodeLength.toString());
    }

    if (Array.isArray(body.defaultModelIds)) {
      // 将模型ID数组转换为逗号分隔的字符串
      envMap.set("DEFAULT_MODEL_IDS", body.defaultModelIds.join(","));
    }

    // 生成新的 .env.local 内容
    const newEnvContent = Array.from(envMap.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // 写入文件
    await writeFile(ENV_FILE_PATH, newEnvContent, "utf-8");

    return jsonOk({
      message: "设置已保存。请重启应用以使更改生效。",
      requireRestart: true
    });
  } catch (error) {
    return routeError(error);
  }
}
