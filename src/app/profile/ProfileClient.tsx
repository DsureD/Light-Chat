"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Card, Input, SecondaryButton } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { ArrowLeft, Gift, History, Key } from "@/components/icons";

type CreditLog = {
  id: string;
  amount: number;
  type: string;
  modelName: string | null;
  description: string | null;
  createdAt: string;
};

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return payload.error || "请求失败。";
  } catch {
    return "请求失败。";
  }
}

function formatDate(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    chat: "聊天",
    image: "图片生成",
    redeem: "兑换",
    admin_grant: "管理员充值",
    admin_adjust: "管理员调整"
  };
  return labels[type] || type;
}

export function ProfileClient() {
  const [credits, setCredits] = useState(0);
  const [logs, setLogs] = useState<CreditLog[]>([]);
  const [redeemCode, setRedeemCode] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadCreditsAndLogs = useCallback(async (currentPage: number = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/user/credits?page=${currentPage}&limit=20`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      setCredits(data.credits);
      setLogs(data.logs || []);
      if (data.pagination) {
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCreditsAndLogs();
  }, [loadCreditsAndLogs]);

  async function handleRedeem(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!redeemCode.trim()) {
      setError("请输入兑换码。");
      return;
    }

    setRedeemLoading(true);

    try {
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: redeemCode.trim() })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      setNotice(data.message || `兑换成功！获得 ${data.credits} 积分。`);
      setRedeemCode("");

      // 重新加载积分和日志
      await loadCreditsAndLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "兑换失败。");
    } finally {
      setRedeemLoading(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("请填写所有密码字段。");
      return;
    }

    if (newPassword.length < 8) {
      setError("新密码长度至少为 8 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice("密码修改成功。");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "密码修改失败。");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/chat" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回聊天
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">个人中心</h1>

        {/* 错误和成功提示 */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-6 rounded-md bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-600 dark:text-green-400">
            {notice}
          </div>
        )}

        {/* 积分余额卡片 */}
        <Card className="mb-6 p-6">
          <div className="text-center py-8">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">当前积分</p>
            <p className="text-5xl font-bold text-blue-600 dark:text-blue-400">{credits}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">1 积分 = 1 次聊天 / 5 积分 = 1 次图片生成</p>
          </div>
        </Card>

        {/* 兑换码输入 */}
        <Card className="mb-6 p-6">
          <div className="flex items-center mb-4">
            <Gift className="h-5 w-5 text-gray-700 dark:text-gray-300 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">兑换积分</h2>
          </div>

          <form onSubmit={handleRedeem}>
            <div className="flex gap-2">
              <Input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="请输入兑换码"
                disabled={redeemLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={redeemLoading || !redeemCode.trim()}>
                {redeemLoading ? "兑换中..." : "兑换"}
              </Button>
            </div>
          </form>
        </Card>

        {/* 修改密码 */}
        <Card className="mb-6 p-6">
          <div className="flex items-center mb-4">
            <Key className="h-5 w-5 text-gray-700 dark:text-gray-300 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">修改密码</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">当前密码</label>
              <PasswordInput
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入当前密码"
                visibilityLabel="当前密码"
                disabled={passwordLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">新密码</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 8 位字符"
                visibilityLabel="新密码"
                disabled={passwordLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">确认新密码</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                visibilityLabel="确认新密码"
                disabled={passwordLoading}
              />
            </div>
            <Button type="submit" disabled={passwordLoading || !oldPassword || !newPassword || !confirmPassword}>
              {passwordLoading ? "修改中..." : "修改密码"}
            </Button>
          </form>
        </Card>

        {/* 使用记录 */}
        <Card className="p-6">
          <div className="flex items-center mb-4">
            <History className="h-5 w-5 text-gray-700 dark:text-gray-300 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">使用记录</h2>
          </div>

          {loading ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">加载中...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无记录</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b dark:border-gray-700">
                    <tr className="text-left text-gray-600 dark:text-gray-400">
                      <th className="pb-3 font-medium">时间</th>
                      <th className="pb-3 font-medium">类型</th>
                      <th className="pb-3 font-medium">积分变动</th>
                      <th className="pb-3 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {logs.map((log) => (
                      <tr key={log.id} className="text-gray-900 dark:text-gray-100">
                        <td className="py-3 text-xs">{formatDate(log.createdAt)}</td>
                        <td className="py-3">{getTypeLabel(log.type)}</td>
                        <td className={`py-3 font-medium ${log.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {log.amount > 0 ? "+" : ""}
                          {log.amount}
                        </td>
                        <td className="py-3 text-xs text-gray-600 dark:text-gray-400">
                          {log.description || log.modelName || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页控件 */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between border-t dark:border-gray-700 pt-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    共 {total} 条记录，第 {page} / {totalPages} 页
                  </div>
                  <div className="flex gap-2">
                    <SecondaryButton
                      onClick={() => loadCreditsAndLogs(page - 1)}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm"
                    >
                      上一页
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() => loadCreditsAndLogs(page + 1)}
                      disabled={page === totalPages}
                      className="px-3 py-1 text-sm"
                    >
                      下一页
                    </SecondaryButton>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
