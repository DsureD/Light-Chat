import { prisma } from "./prisma";

/**
 * 检查用户是否有权使用该模型
 */
export async function checkModelPermission(userId: string, modelId: string): Promise<boolean> {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (!user) {
    return false;
  }

  // 管理员拥有所有模型权限
  if (user.role === "ADMIN") {
    return true;
  }

  // 检查普通用户的模型权限
  const permission = await prisma.userModelPermission.findUnique({
    where: {
      userId_modelId: {
        userId,
        modelId
      }
    }
  });

  return permission?.enabled ?? false;
}

/**
 * 设置用户的模型权限
 */
export async function setUserModelPermissions(userId: string, modelIds: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 删除用户现有的所有模型权限
    await tx.userModelPermission.deleteMany({
      where: { userId }
    });

    // 创建新的权限记录
    if (modelIds.length > 0) {
      await tx.userModelPermission.createMany({
        data: modelIds.map((modelId) => ({
          userId,
          modelId,
          enabled: true
        }))
      });
    }
  });
}

/**
 * 获取用户可用的模型列表
 */
export async function getUserAvailableModels(userId: string) {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (!user) {
    return [];
  }

  // 管理员返回所有启用的模型
  if (user.role === "ADMIN") {
    return prisma.model.findMany({
      where: { enabled: true, provider: { enabled: true } },
      include: { provider: true }
    });
  }

  // 普通用户返回有权限的模型
  const permissions = await prisma.userModelPermission.findMany({
    where: { userId, enabled: true },
    include: {
      model: {
        include: { provider: true }
      }
    }
  });

  return permissions
    .map((p) => p.model)
    .filter((model) => model.enabled && model.provider.enabled);
}

/**
 * 获取用户的模型权限列表（返回模型 ID 数组）
 */
export async function getUserModelPermissionIds(userId: string): Promise<string[]> {
  const permissions = await prisma.userModelPermission.findMany({
    where: { userId, enabled: true },
    select: { modelId: true }
  });

  return permissions.map((p) => p.modelId);
}

/**
 * 为用户添加单个模型权限
 */
export async function addModelPermission(userId: string, modelId: string): Promise<void> {
  await prisma.userModelPermission.upsert({
    where: {
      userId_modelId: {
        userId,
        modelId
      }
    },
    create: {
      userId,
      modelId,
      enabled: true
    },
    update: {
      enabled: true
    }
  });
}

/**
 * 为用户移除单个模型权限
 */
export async function removeModelPermission(userId: string, modelId: string): Promise<void> {
  await prisma.userModelPermission.delete({
    where: {
      userId_modelId: {
        userId,
        modelId
      }
    }
  });
}
