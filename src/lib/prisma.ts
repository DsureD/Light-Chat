import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const client = new PrismaClient();

  // SQLite 优化：WAL 模式下读写互不阻塞，避免并发写入时 database is locked；
  // busy_timeout 让短暂的锁竞争自动等待重试而不是立刻报错。
  client
    .$queryRawUnsafe("PRAGMA journal_mode=WAL;")
    .then(() => client.$queryRawUnsafe("PRAGMA busy_timeout=5000;"))
    .catch(() => {
      // 非 SQLite 数据库会失败，静默忽略
    });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
