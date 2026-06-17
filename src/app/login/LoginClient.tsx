"use client";

import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return payload.error || "请求失败。";
  } catch {
    return "请求失败。";
  }
}

export function LoginClient() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationAllowed, setRegistrationAllowed] = useState(false);

  useEffect(() => {
    // 获取注册配置
    async function loadConfig() {
      try {
        const response = await fetch("/api/auth/register/config");
        if (response.ok) {
          const data = await response.json();
          setRegistrationAllowed(data.registrationAllowed);
        }
      } catch (err) {
        console.error("加载注册配置失败:", err);
      }
    }
    loadConfig();
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("请输入用户名和密码。");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      // 登录成功后保持按钮禁用，直到 /chat 渲染完成跳转落地。
      // 不在 finally 里统一 setLoading(false)，否则跳转的空档按钮会变回可点，
      // 用户可能误触发起第二次登录请求。
      router.replace("/chat");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败。");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-medium text-slate-500">Light Chat</p>
          <h1 className="text-3xl font-semibold tracking-tight">用户登录</h1>
          <p className="text-sm text-slate-500">登录后开始使用 AI 聊天服务。</p>
        </div>

        <form className="space-y-4" onSubmit={submitLogin}>
          <label className="block space-y-2 text-sm font-medium">
            <span>用户名</span>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" disabled={loading} />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>密码</span>
            <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={loading} />
          </label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
          <Button className="w-full" disabled={loading || !username.trim() || !password.trim()} type="submit">
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>

        {registrationAllowed && (
          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            还没有账号？
            <Link href="/register" className="ml-1 font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
              立即注册
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
