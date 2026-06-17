"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
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

export function RegisterClient() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registrationAllowed, setRegistrationAllowed] = useState(true);
  const [inviteCodeRequired, setInviteCodeRequired] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    // 获取注册配置
    async function loadConfig() {
      try {
        const response = await fetch("/api/auth/register/config");
        if (response.ok) {
          const data = await response.json();
          setRegistrationAllowed(data.registrationAllowed);
          setInviteCodeRequired(data.inviteCodeRequired);
          setIsFirstUser(Boolean(data.isFirstUser));
        }
      } catch (err) {
        console.error("加载注册配置失败:", err);
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (username.trim().length <= 4) {
      setError("用户名长度必须大于 4 位。");
      return;
    }

    if (password.length < 8) {
      setError("密码长度至少为 8 位。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          inviteCode: inviteCode.trim()
        })
      });

      if (!response.ok) {
        const errorMsg = await readError(response);

        // 检查是否是注册关闭的错误
        if (errorMsg.includes("关闭用户注册")) {
          setRegistrationAllowed(false);
        }

        // 检查是否需要邀请码
        if (errorMsg.includes("需要邀请码")) {
          setInviteCodeRequired(true);
        }

        setError(errorMsg);
        return;
      }

      const data = await response.json();
      if (data.message) {
        setNotice(data.message);
      }

      // 延迟跳转，让用户看到成功消息；管理员进入后台
      const target = data.user?.role === "ADMIN" ? "/admin" : "/chat";
      setTimeout(() => {
        router.push(target);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败。");
    } finally {
      setLoading(false);
    }
  }

  if (configLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400">加载中...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!registrationAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">注册功能已关闭</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">管理员已关闭用户注册功能。</p>
            <Link href="/login">
              <Button className="w-full">返回登录</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">注册账号</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">创建您的账号开始使用</p>
        </div>

        {isFirstUser && (
          <div className="mb-4 rounded-md bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
            您是第一位注册的用户，注册后将自动成为管理员。
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              用户名
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="至少 5 位字符"
              disabled={loading}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              密码
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位字符"
              disabled={loading}
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              确认密码
            </label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              visibilityLabel="确认密码"
              disabled={loading}
              required
            />
          </div>

          <div>
            <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              邀请码 {inviteCodeRequired && <span className="text-red-500">*</span>}
              {!inviteCodeRequired && <span className="text-gray-500 text-xs">（可选）</span>}
            </label>
            <Input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder={inviteCodeRequired ? "请输入邀请码" : "有邀请码可获得额外积分"}
              disabled={loading}
              required={inviteCodeRequired}
            />
            {!inviteCodeRequired && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                使用邀请码注册可获得额外积分奖励
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-600 dark:text-green-400">
              {notice}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "注册中..." : "注册"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          已有账号？
          <Link href="/login" className="ml-1 font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
            立即登录
          </Link>
        </div>
      </Card>
    </div>
  );
}
