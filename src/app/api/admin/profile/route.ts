import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-log";

// PATCH /api/admin/profile - 管理员修改自己的用户名和密码
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const username = body.username ? String(body.username).trim() : undefined;
    const currentPassword = body.currentPassword ? String(body.currentPassword) : undefined;
    const newPassword = body.newPassword ? String(body.newPassword) : undefined;

    const updateData: {
      username?: string;
      passwordHash?: string;
    } = {};

    // 修改用户名
    if (username) {
      if (username.length <= 4) {
        return jsonError("用户名长度必须大于 4 位。", 400);
      }

      // 检查用户名是否已被其他用户使用
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });

      if (existingUser && existingUser.id !== admin.id) {
        return jsonError("用户名已被使用。", 409);
      }

      updateData.username = username;
    }

    // 修改密码
    if (currentPassword && newPassword) {
      if (newPassword.length < 8) {
        return jsonError("新密码长度至少为 8 位。", 400);
      }

      // 获取完整用户信息
      const fullAdmin = await prisma.user.findUnique({
        where: { id: admin.id }
      });

      if (!fullAdmin) {
        return jsonError("用户不存在。", 404);
      }

      // 验证当前密码
      const isValidPassword = await bcrypt.compare(currentPassword, fullAdmin.passwordHash);

      if (!isValidPassword) {
        return jsonError("当前密码错误。", 401);
      }

      updateData.passwordHash = await bcrypt.hash(newPassword, 12);
    } else if (currentPassword || newPassword) {
      return jsonError("修改密码需要同时提供当前密码和新密码。", 400);
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError("没有需要更新的内容。", 400);
    }

    // 更新信息
    const updatedAdmin = await prisma.user.update({
      where: { id: admin.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        updatedAt: true
      }
    });

    // 记录管理员操作
    await logAdminAction(admin.id, "update_profile", "user", admin.id, {
      username: updateData.username,
      passwordChanged: !!updateData.passwordHash
    });

    return jsonOk({
      user: {
        id: updatedAdmin.id,
        username: updatedAdmin.username,
        role: updatedAdmin.role,
        updatedAt: updatedAdmin.updatedAt.toISOString()
      },
      message: "信息更新成功。"
    });
  } catch (error) {
    return routeError(error);
  }
}
