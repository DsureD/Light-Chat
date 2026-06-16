import { prisma } from "./prisma";

/**
 * 记录管理员操作
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await prisma.adminLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      details: details ? JSON.stringify(details) : null
    }
  });
}

/**
 * 获取管理员操作日志
 */
export async function getAdminLogs(limit: number = 100) {
  return prisma.adminLog.findMany({
    include: {
      admin: {
        select: {
          id: true,
          username: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
}

/**
 * 获取特定管理员的操作日志
 */
export async function getAdminLogsByAdmin(adminId: string, limit: number = 100) {
  return prisma.adminLog.findMany({
    where: { adminId },
    orderBy: { createdAt: "desc" },
    take: limit
  });
}

/**
 * 获取针对特定目标的操作日志
 */
export async function getAdminLogsByTarget(targetType: string, targetId: string, limit: number = 50) {
  return prisma.adminLog.findMany({
    where: { targetType, targetId },
    include: {
      admin: {
        select: {
          id: true,
          username: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
}
