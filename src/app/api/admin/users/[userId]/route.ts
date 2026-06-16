import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setUserModelPermissions, getUserModelPermissionIds } from "@/lib/permissions";
import { logAdminAction } from "@/lib/admin-log";

// GET /api/admin/users/[userId] - 获取用户详情
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        role: true,
        credits: true,
        status: true,
        maxConversations: true,
        maxMessagesPerConversation: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return jsonError("用户不存在。", 404);
    }

    // 获取用户的模型权限
    const modelIds = await getUserModelPermissionIds(userId);

    return jsonOk({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        credits: user.credits,
        status: user.status,
        maxConversations: user.maxConversations,
        maxMessagesPerConversation: user.maxMessagesPerConversation,
        modelIds,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

// PATCH /api/admin/users/[userId] - 更新用户信息
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;
    const body = await request.json();

    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null }
    });

    if (!user) {
      return jsonError("用户不存在。", 404);
    }

    // 不允许修改管理员账号
    if (user.role === "ADMIN") {
      return jsonError("不能修改管理员账号。", 403);
    }

    const updateData: {
      credits?: number;
      status?: string;
      maxConversations?: number | null;
      maxMessagesPerConversation?: number | null;
    } = {};

    if (body.credits !== undefined) {
      const credits = parseInt(String(body.credits), 10);
      if (credits < 0) {
        return jsonError("积分不能为负数。", 400);
      }
      updateData.credits = credits;
    }

    if (body.status) {
      const status = String(body.status);
      if (!["active", "suspended", "banned"].includes(status)) {
        return jsonError("状态必须为 active、suspended 或 banned。", 400);
      }
      updateData.status = status;
    }

    if (body.maxConversations !== undefined) {
      updateData.maxConversations = body.maxConversations === null ? null : parseInt(String(body.maxConversations), 10);
    }

    if (body.maxMessagesPerConversation !== undefined) {
      updateData.maxMessagesPerConversation = body.maxMessagesPerConversation === null ? null : parseInt(String(body.maxMessagesPerConversation), 10);
    }

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    // 设置模型权限
    if (Array.isArray(body.modelIds)) {
      await setUserModelPermissions(userId, body.modelIds);
    }

    // 记录管理员操作
    await logAdminAction(admin.id, "update_user", "user", userId, {
      ...updateData,
      modelIds: body.modelIds
    });

    return jsonOk({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        credits: updatedUser.credits,
        status: updatedUser.status,
        maxConversations: updatedUser.maxConversations,
        maxMessagesPerConversation: updatedUser.maxMessagesPerConversation,
        updatedAt: updatedUser.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

// DELETE /api/admin/users/[userId] - 删除用户（软删除）
export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { role: true, username: true }
    });

    if (!user) {
      return jsonError("用户不存在。", 404);
    }

    // 不允许删除管理员账号
    if (user.role === "ADMIN") {
      return jsonError("不能删除管理员账号。", 403);
    }

    // 软删除用户
    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() }
    });

    // 记录管理员操作
    await logAdminAction(admin.id, "delete_user", "user", userId, {
      username: user.username
    });

    return jsonOk({ message: "用户已删除。" });
  } catch (error) {
    return routeError(error);
  }
}
