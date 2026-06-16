import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { jsonError, jsonOk, routeError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getDefaultUserCredits } from "@/lib/config";
import { setUserModelPermissions } from "@/lib/permissions";
import { logAdminAction } from "@/lib/admin-log";

// GET /api/admin/users - 获取用户列表
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    const where: {
      deletedAt: null;
      username?: { contains: string };
      status?: string;
    } = {
      deletedAt: null
    };

    if (search) {
      where.username = { contains: search };
    }

    if (status && ["active", "suspended", "banned"].includes(status)) {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
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
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    return jsonOk({
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        credits: user.credits,
        status: user.status,
        maxConversations: user.maxConversations,
        maxMessagesPerConversation: user.maxMessagesPerConversation,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return routeError(error);
  }
}

// POST /api/admin/users - 创建用户
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const credits = body.credits !== undefined ? parseInt(String(body.credits), 10) : getDefaultUserCredits();
    const modelIds = Array.isArray(body.modelIds) ? body.modelIds : [];

    // 验证用户名长度
    if (username.length <= 4) {
      return jsonError("用户名长度必须大于 4 位。", 400);
    }

    // 验证密码长度
    if (password.length < 8) {
      return jsonError("密码长度至少为 8 位。", 400);
    }

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return jsonError("用户名已被使用。", 409);
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        role: "USER",
        credits,
        status: "active"
      }
    });

    // 设置模型权限
    if (modelIds.length > 0) {
      await setUserModelPermissions(user.id, modelIds);
    }

    // 记录管理员操作
    await logAdminAction(admin.id, "create_user", "user", user.id, {
      username,
      credits,
      modelIds
    });

    return jsonOk({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        credits: user.credits,
        status: user.status,
        createdAt: user.createdAt.toISOString()
      }
    });
  } catch (error) {
    return routeError(error);
  }
}
