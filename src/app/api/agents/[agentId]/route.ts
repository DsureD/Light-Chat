import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function PUT(request: Request, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();
  const { name, prompt } = body;

  if (!name?.trim() || !prompt?.trim()) {
    return NextResponse.json({ error: "名称和提示词不能为空" }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: params.agentId }
  });

  if (!agent || agent.userId !== user.id) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  const updated = await prisma.agent.update({
    where: { id: params.agentId },
    data: {
      name: name.trim(),
      prompt: prompt.trim()
    }
  });

  return NextResponse.json({ agent: updated });
}

export async function DELETE(_request: Request, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: params.agentId }
  });

  if (!agent || agent.userId !== user.id) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  await prisma.agent.delete({
    where: { id: params.agentId }
  });

  return NextResponse.json({ success: true });
}
