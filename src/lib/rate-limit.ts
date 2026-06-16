/**
 * 基于内存的请求频率限制
 * 适用于单实例部署，生产环境建议使用 Redis 实现
 */

interface RateLimitConfig {
  maxAttempts: number; // 时间窗口内最大请求次数
  windowMs: number; // 时间窗口（毫秒）
  blockDurationMs?: number; // 超限后的阻止时长（可选）
}

type RateLimitRecord = {
  count: number;
  resetAt: number; // 窗口重置时间
  blockedUntil?: number; // 阻止到期时间
};

// 存储速率限制记录 Map<identifier, Map<action, record>>
const rateLimitStore = new Map<string, Map<string, RateLimitRecord>>();

// 清理过期记录的定时器
let cleanupTimer: NodeJS.Timeout | null = null;

// 预定义的速率限制配置
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 分钟
    blockDurationMs: 15 * 60 * 1000, // 超限后阻止 15 分钟
  },
  register: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 小时
    blockDurationMs: 60 * 60 * 1000, // 超限后阻止 1 小时
  },
  redeem: {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 小时
    blockDurationMs: 30 * 60 * 1000, // 超限后阻止 30 分钟
  },
  chat: {
    maxAttempts: 60,
    windowMs: 60 * 1000, // 1 分钟
  },
  imageGeneration: {
    maxAttempts: 10,
    windowMs: 60 * 1000, // 1 分钟
  },
  upload: {
    maxAttempts: 20,
    windowMs: 60 * 1000, // 1 分钟
  },
  passwordChange: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 小时
  },
};

export type RateLimitAction = keyof typeof RATE_LIMIT_CONFIGS;

/**
 * 检查并记录请求频率限制
 * @param identifier 标识符（通常是 IP 地址或用户 ID）
 * @param action 操作类型
 * @returns 是否允许请求
 */
export function checkRateLimit(
  identifier: string,
  action: RateLimitAction
): {
  allowed: boolean;
  retryAfter?: number; // 秒数
  remaining?: number; // 剩余次数
} {
  const config = RATE_LIMIT_CONFIGS[action];
  const now = Date.now();

  // 获取或创建该标识符的记录
  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, new Map());
  }

  const userRecords = rateLimitStore.get(identifier)!;
  let record = userRecords.get(action);

  // 检查是否在阻止期内
  if (record?.blockedUntil && record.blockedUntil > now) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // 如果没有记录或窗口已过期，创建新记录
  if (!record || now >= record.resetAt) {
    record = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    userRecords.set(action, record);
    return { allowed: true, remaining: config.maxAttempts - 1 };
  }

  // 增加计数
  record.count++;

  // 检查是否超限
  if (record.count > config.maxAttempts) {
    // 设置阻止时间
    if (config.blockDurationMs) {
      record.blockedUntil = now + config.blockDurationMs;
    }
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  const remaining = config.maxAttempts - record.count;
  return { allowed: true, remaining };
}

/**
 * 重置指定标识符的速率限制（用于登录成功后重置）
 * @param identifier 标识符
 * @param action 操作类型
 */
export function resetRateLimit(identifier: string, action: RateLimitAction): void {
  const userRecords = rateLimitStore.get(identifier);
  if (userRecords) {
    userRecords.delete(action);
    if (userRecords.size === 0) {
      rateLimitStore.delete(identifier);
    }
  }
}

/**
 * 获取客户端 IP 地址
 *
 * 安全说明：X-Forwarded-For 可被客户端伪造。攻击者在最左侧塞入任意 IP
 * 即可绕过基于 IP 的限流。生产环境应只信任「自己反代追加的那一跳」。
 * 通过 TRUSTED_PROXY_HOPS 配置可信代理层数（你的反代数量），
 * 从 XFF 链最右侧往左数第 N 跳作为真实客户端 IP。
 * 默认 1（典型单层 Nginx/反代）。若直连无反代，应设为 0 并依赖 x-real-ip。
 * @param request Request 对象
 * @returns IP 地址
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  // Cloudflare 专用头不可被终端用户伪造（由 CF 边缘覆盖写入），优先采用
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const trustedHops = Math.max(
    0,
    parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 0
  );

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);

    if (ips.length > 0) {
      // 从右往左数第 trustedHops 跳：最右是离我们最近的可信代理写入的，
      // 越往左越不可信（可能是客户端伪造的）。
      // trustedHops=1 取倒数第 1 个，=2 取倒数第 2 个，以此类推。
      const idx = ips.length - trustedHops;
      // 若伪造的链比预期短，钳制到第 0 个，避免越界拿到伪造值时仍取最左
      const safeIdx = Math.min(Math.max(idx, 0), ips.length - 1);
      return ips[safeIdx];
    }
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  // 默认返回未知
  return "unknown";
}

/**
 * 清理过期的速率限制记录
 */
function cleanupExpiredRecords(): void {
  const now = Date.now();
  let totalRecords = 0;
  let expiredRecords = 0;

  for (const [identifier, userRecords] of rateLimitStore.entries()) {
    for (const [action, record] of userRecords.entries()) {
      totalRecords++;

      // 如果窗口已过期且没有阻止时间，或者阻止时间也已过期
      const windowExpired = now >= record.resetAt;
      const blockExpired = !record.blockedUntil || now >= record.blockedUntil;

      if (windowExpired && blockExpired) {
        userRecords.delete(action);
        expiredRecords++;
      }
    }

    // 如果用户没有任何记录，删除用户
    if (userRecords.size === 0) {
      rateLimitStore.delete(identifier);
    }
  }

  if (expiredRecords > 0) {
    console.log(
      `[RateLimit] Cleaned up ${expiredRecords}/${totalRecords} expired records. Current store size: ${rateLimitStore.size}`
    );
  }
}

/**
 * 启动定期清理任务（每 5 分钟清理一次）
 */
export function startCleanupTask(): void {
  if (cleanupTimer) return; // 已经启动

  cleanupTimer = setInterval(() => {
    cleanupExpiredRecords();
  }, 5 * 60 * 1000); // 5 分钟

  // 防止定时器阻止 Node.js 进程退出
  cleanupTimer.unref();

  console.log("[RateLimit] Cleanup task started");
}

/**
 * 停止清理任务
 */
export function stopCleanupTask(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    console.log("[RateLimit] Cleanup task stopped");
  }
}

/**
 * 获取速率限制统计信息（用于监控）
 */
export function getRateLimitStats(): {
  totalIdentifiers: number;
  totalRecords: number;
  blockedIdentifiers: number;
} {
  const now = Date.now();
  let totalRecords = 0;
  let blockedIdentifiers = 0;

  for (const [, userRecords] of rateLimitStore.entries()) {
    let isBlocked = false;

    for (const [, record] of userRecords.entries()) {
      totalRecords++;
      if (record.blockedUntil && record.blockedUntil > now) {
        isBlocked = true;
      }
    }

    if (isBlocked) {
      blockedIdentifiers++;
    }
  }

  return {
    totalIdentifiers: rateLimitStore.size,
    totalRecords,
    blockedIdentifiers,
  };
}

// 应用启动时启动清理任务
if (typeof window === "undefined") {
  // 只在服务端启动
  startCleanupTask();
}
