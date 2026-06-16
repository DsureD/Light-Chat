import { prisma } from "./prisma";

/**
 * 获取环境变量配置
 */
export function getDefaultUserCredits(): number {
  return parseInt(process.env.DEFAULT_USER_CREDITS || "1", 10);
}

export function getMaxConversationsPerUser(): number {
  return parseInt(process.env.MAX_CONVERSATIONS_PER_USER || "50", 10);
}

export function getMaxMessagesPerConversation(): number {
  return parseInt(process.env.MAX_MESSAGES_PER_CONVERSATION || "100", 10);
}

export function getMaxContextMessages(): number {
  return parseInt(process.env.MAX_CONTEXT_MESSAGES || "20", 10);
}

/** 单条消息内容的最大字符数（防止超大消息撑爆数据库和上游请求） */
export function getMaxMessageChars(): number {
  return parseInt(process.env.MAX_MESSAGE_CHARS || "100000", 10);
}

/** 单次请求携带上下文的总字符数上限（与 MAX_CONTEXT_MESSAGES 同时生效，先到为准） */
export function getMaxContextChars(): number {
  return parseInt(process.env.MAX_CONTEXT_CHARS || "200000", 10);
}

/** 单次请求携带上下文中最多包含的图片数量（图片按 base64 内联发给上游，体积大） */
export function getMaxContextImages(): number {
  return parseInt(process.env.MAX_CONTEXT_IMAGES || "4", 10);
}

export function getCreditPerChatMessage(): number {
  return parseInt(process.env.CREDIT_PER_CHAT_MESSAGE || "1", 10);
}

export function getCreditPerImageGeneration(): number {
  return parseInt(process.env.CREDIT_PER_IMAGE_GENERATION || "5", 10);
}

export function getRedeemCodeLength(): number {
  return parseInt(process.env.REDEEM_CODE_LENGTH || "8", 10);
}

export function isUserRegistrationAllowed(): boolean {
  return process.env.ALLOW_USER_REGISTRATION !== "false";
}

export function isInviteCodeRequired(): boolean {
  return process.env.REQUIRE_INVITE_CODE_ON_REGISTER === "true";
}

/**
 * 获取新用户的默认模型权限（模型ID列表）
 */
export function getDefaultModelIds(): string[] {
  const modelIds = process.env.DEFAULT_MODEL_IDS || "";
  return modelIds.split(",").map(id => id.trim()).filter(id => id.length > 0);
}
