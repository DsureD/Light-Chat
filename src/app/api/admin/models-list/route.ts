import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await verifySessionFromRequest(request);

    if (!session || (session.role !== "ADMIN" && session.role !== "admin")) {
      return NextResponse.json({ error: "需要管理员权限。" }, { status: 403 });
    }

    const models = await prisma.model.findMany({
      where: { enabled: true },
      include: {
        provider: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { provider: { name: "asc" } },
        { name: "asc" }
      ]
    });

    return NextResponse.json({ models });
  } catch (error) {
    console.error("获取模型列表失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取模型列表失败。" },
      { status: 500 }
    );
  }
}
