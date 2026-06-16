import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const agents = await prisma.agent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({ agents });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();
  const { name, prompt } = body;

  if (!name?.trim() || !prompt?.trim()) {
    return NextResponse.json({ error: "名称和提示词不能为空" }, { status: 400 });
  }

  const count = await prisma.agent.count({ where: { userId: user.id } });
  if (count >= 10) {
    return NextResponse.json({ error: "最多只能创建 10 个 Agent" }, { status: 400 });
  }

  const agent = await prisma.agent.create({
    data: {
      userId: user.id,
      name: name.trim(),
      prompt: prompt.trim()
    }
  });

  return NextResponse.json({ agent });
}
