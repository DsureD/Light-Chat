"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Card, Input, SecondaryButton } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { Ticket, Plus, Trash2, History, Copy, Check } from "@/components/icons";

type RedeemCode = {
  id: string;
  code: string;
  credits: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  status: string;
  description: string | null;
  createdAt: string;
};

type RedeemLog = {
  id: string;
  userId: string;
  username: string;
  credits: number;
  redeemedAt: string;
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

function StatusBadge({
  status,
  expiresAt,
  usedCount,
  maxUses
}: {
  status: string;
  expiresAt: string | null;
  usedCount: number;
  maxUses: number;
}) {
  const isDisabled = status === "disabled";
  const isExpired = !!expiresAt && new Date(expiresAt) < new Date();
  const isUsedUp = maxUses !== -1 && usedCount >= maxUses;

  // 优先级：禁用 > 已过期 > 已用完 > 有效
  let displayStatus: string;
  if (isDisabled) {
    displayStatus = "禁用";
  } else if (isExpired) {
    displayStatus = "已过期";
  } else if (isUsedUp) {
    displayStatus = "已用完";
  } else {
    displayStatus = "有效";
  }

  const isInactive = isDisabled || isExpired || isUsedUp;
  const color = isInactive
    ? "bg-slate-100 text-slate-500 dark:bg-sidebar dark:text-muted"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";

  return (
    <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${color}`}>
      {displayStatus}
    </span>
  );
}

export function RedeemCodesClient() {
  const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedCode, setSelectedCode] = useState<RedeemCode | null>(null);
  const [redeemLogs, setRedeemLogs] = useState<RedeemLog[]>([]);
  const [copiedCode, setCopiedCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // 分页
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 批量操作
  const [selectedCodeIds, setSelectedCodeIds] = useState<Set<string>>(new Set());

  // 创建表单
  const [createCredits, setCreateCredits] = useState("100");
  const [createMaxUses, setCreateMaxUses] = useState("1");
  const [createMaxUsesCustom, setCreateMaxUsesCustom] = useState("");
  const [createExpiresType, setCreateExpiresType] = useState("7days");
  const [createCustomExpires, setCreateCustomExpires] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPrefix, setCreatePrefix] = useState("");
  const [createCount, setCreateCount] = useState("1");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const { confirm, confirmDialog } = useConfirm();

  const loadRedeemCodes = useCallback(async (currentPage: number = 1) => {
    try {
      const params = new URLSearchParams();
      params.set("page", currentPage.toString());
      params.set("limit", "20");
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(`/api/admin/redeem-codes?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      setRedeemCodes(data.redeemCodes || []);
      if (data.pagination) {
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
      setSelectedCodeIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载兑换码列表失败。");
    }
  }, [statusFilter]);

  useEffect(() => {
    loadRedeemCodes(1);
  }, [loadRedeemCodes]);

  async function handleCreateCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const credits = parseInt(createCredits);
      const count = parseInt(createCount);
      const maxUses = createMaxUses === "custom"
        ? parseInt(createMaxUsesCustom)
        : parseInt(createMaxUses);

      if (isNaN(credits) || credits <= 0) {
        throw new Error("请输入有效的积分数量。");
      }

      if (isNaN(count) || count < 1 || count > 100) {
        throw new Error("生成数量必须在 1-100 之间。");
      }

      if (createMaxUses === "custom" && (isNaN(maxUses) || maxUses < -1 || maxUses === 0)) {
        throw new Error("使用次数必须为 -1（无限）或正整数。");
      }

      let expiresAt: string | null = null;

      if (createExpiresType === "7days") {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        expiresAt = date.toISOString();
      } else if (createExpiresType === "30days") {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        expiresAt = date.toISOString();
      } else if (createExpiresType === "custom" && createCustomExpires) {
        expiresAt = new Date(createCustomExpires).toISOString();
      }

      const response = await fetch("/api/admin/redeem-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits,
          maxUses,
          count,
          prefix: createPrefix || null,
          expiresAt,
          description: createDescription || null
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const result = await response.json();
      const codes = result.redeemCodes.map((c: { code: string }) => c.code).join(", ");
      setNotice(`成功生成 ${result.redeemCodes.length} 个兑换码：${codes}`);
      setShowCreateDialog(false);
      resetCreateForm();
      await loadRedeemCodes(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建兑换码失败。");
    } finally {
      setLoading(false);
    }
  }

  function resetCreateForm() {
    setCreateCredits("100");
    setCreateMaxUses("1");
    setCreateMaxUsesCustom("");
    setCreateExpiresType("7days");
    setCreateCustomExpires("");
    setCreateDescription("");
    setCreatePrefix("");
    setCreateCount("1");
  }

  async function handleToggleStatus(code: RedeemCode) {
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const newStatus = code.status === "active" ? "disabled" : "active";

      const response = await fetch(`/api/admin/redeem-codes/${code.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice(`兑换码已${newStatus === "active" ? "启用" : "禁用"}。`);
      await loadRedeemCodes(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新状态失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCode(code: RedeemCode) {
    const confirmed = await confirm({
      title: "删除兑换码",
      description: `确定要删除兑换码 "${code.code}" 吗？此操作不可撤销。`,
      confirmText: "删除",
      tone: "danger"
    });

    if (!confirmed) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/redeem-codes/${code.id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice("兑换码已删除。");
      await loadRedeemCodes(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除兑换码失败。");
    } finally {
      setLoading(false);
    }
  }

  // 批量操作函数
  function toggleSelectCode(codeId: string) {
    const newSet = new Set(selectedCodeIds);
    if (newSet.has(codeId)) {
      newSet.delete(codeId);
    } else {
      newSet.add(codeId);
    }
    setSelectedCodeIds(newSet);
  }

  function toggleSelectAll() {
    if (selectedCodeIds.size === redeemCodes.length) {
      setSelectedCodeIds(new Set());
    } else {
      setSelectedCodeIds(new Set(redeemCodes.map(c => c.id)));
    }
  }

  async function handleBulkAction(action: "delete" | "enable" | "disable") {
    if (selectedCodeIds.size === 0) return;

    const actionText = { delete: "删除", enable: "启用", disable: "禁用" }[action];
    const confirmed = await confirm({
      title: `批量${actionText}兑换码`,
      description: `确定要${actionText}选中的 ${selectedCodeIds.size} 个兑换码吗？`,
      confirmText: actionText,
      tone: action === "delete" ? "danger" : undefined
    });

    if (!confirmed) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/redeem-codes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          codeIds: Array.from(selectedCodeIds)
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice(`已成功${actionText} ${selectedCodeIds.size} 个兑换码。`);
      setSelectedCodeIds(new Set());
      await loadRedeemCodes(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : `批量${actionText}失败。`);
    } finally {
      setLoading(false);
    }
  }

  async function loadCodeLogs(code: RedeemCode) {
    setSelectedCode(code);
    setShowLogsDialog(true);
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/redeem-codes/${code.id}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      setRedeemLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载使用记录失败。");
    } finally {
      setLoading(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(""), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 dark:bg-card dark:border-line">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-sidebar dark:text-muted">
              <Ticket className="h-3.5 w-3.5" /> 兑换码管理
            </div>
            <h2 className="text-2xl font-semibold dark:text-ink">兑换码列表</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted">创建和管理积分兑换码</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> 生成兑换码
          </Button>
        </div>

        {(notice || error) && (
          <div className="mb-4 grid gap-2">
            {notice ? <p className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</p> : null}
            {error ? <p className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}
          </div>
        )}

        {/* 状态筛选 */}
        <div className="mb-4">
          <select
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-line dark:bg-card dark:text-ink dark:focus:border-accent/60 dark:focus:ring-accent/10"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="active">有效</option>
            <option value="disabled">禁用</option>
            <option value="expired">已过期</option>
            <option value="used_up">已用完</option>
          </select>
        </div>

        {/* 批量操作 */}
        {selectedCodeIds.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              已选择 {selectedCodeIds.size} 个兑换码
            </span>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={() => handleBulkAction("enable")} className="text-xs">
                批量启用
              </SecondaryButton>
              <SecondaryButton onClick={() => handleBulkAction("disable")} className="text-xs">
                批量禁用
              </SecondaryButton>
              <SecondaryButton onClick={() => handleBulkAction("delete")} className="text-xs text-red-600 dark:text-red-400">
                <Trash2 className="h-3.5 w-3.5" /> 批量删除
              </SecondaryButton>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 text-left text-sm dark:border-line">
              <tr>
                <th className="pb-3 pr-2 font-medium text-slate-600 dark:text-muted">
                  <input
                    type="checkbox"
                    checked={selectedCodeIds.size === redeemCodes.length && redeemCodes.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20"
                  />
                </th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">兑换码</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">积分</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">使用情况</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">过期时间</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">状态</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">描述</th>
                <th className="pb-3 font-medium text-slate-600 dark:text-muted">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {redeemCodes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-muted">
                    暂无兑换码
                  </td>
                </tr>
              ) : null}
              {redeemCodes.map((code) => (
                <tr key={code.id} className="border-b border-slate-100 last:border-0 dark:border-line/50">
                  <td className="py-3 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedCodeIds.has(code.id)}
                      onChange={() => toggleSelectCode(code.id)}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs dark:bg-sidebar dark:text-ink">
                        {code.code}
                      </code>
                      <button
                        onClick={() => copyCode(code.code)}
                        className="text-slate-400 transition hover:text-slate-600 dark:text-muted dark:hover:text-ink"
                      >
                        {copiedCode === code.code ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-medium dark:text-ink">{code.credits}</td>
                  <td className="py-3 pr-4 dark:text-ink">
                    {code.usedCount} / {code.maxUses === -1 ? "∞" : code.maxUses}
                  </td>
                  <td className="py-3 pr-4 text-slate-500 dark:text-muted">
                    {code.expiresAt ? formatDate(code.expiresAt) : "永久"}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge
                      status={code.status}
                      expiresAt={code.expiresAt}
                      usedCount={code.usedCount}
                      maxUses={code.maxUses}
                    />
                  </td>
                  <td className="py-3 pr-4 text-slate-500 dark:text-muted">
                    {code.description || "-"}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => loadCodeLogs(code)}>
                        <History className="h-3 w-3" /> 记录
                      </SecondaryButton>
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => handleToggleStatus(code)}>
                        {code.status === "active" ? "禁用" : "启用"}
                      </SecondaryButton>
                      <SecondaryButton className="px-2 py-1 text-xs text-red-600 dark:text-red-400" onClick={() => handleDeleteCode(code)}>
                        <Trash2 className="h-3 w-3" /> 删除
                      </SecondaryButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-line">
            <div className="text-sm text-slate-600 dark:text-muted">
              共 {total} 个兑换码，第 {page} / {totalPages} 页
            </div>
            <div className="flex gap-2">
              <SecondaryButton
                onClick={() => loadRedeemCodes(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 text-sm"
              >
                上一页
              </SecondaryButton>
              <SecondaryButton
                onClick={() => loadRedeemCodes(page + 1)}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm"
              >
                下一页
              </SecondaryButton>
            </div>
          </div>
        )}
      </Card>

      {/* 创建兑换码对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md p-6 dark:bg-card dark:border-line">
            <h3 className="mb-4 text-xl font-semibold dark:text-ink">生成兑换码</h3>
            <form onSubmit={handleCreateCode} className="space-y-4">
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>积分数量</span>
                <Input
                  type="number"
                  value={createCredits}
                  onChange={(e) => setCreateCredits(e.target.value)}
                  min="1"
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>兑换码前缀（可选）</span>
                <Input
                  value={createPrefix}
                  onChange={(e) => setCreatePrefix(e.target.value.toUpperCase())}
                  placeholder="如：VIP、NEW 等"
                  maxLength={6}
                />
                <p className="text-xs text-slate-500 dark:text-muted">前缀最多6个字符，留空则不使用前缀</p>
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>生成数量</span>
                <Input
                  type="number"
                  value={createCount}
                  onChange={(e) => setCreateCount(e.target.value)}
                  min="1"
                  max="100"
                  required
                />
                <p className="text-xs text-slate-500 dark:text-muted">一次最多生成100个兑换码</p>
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>使用次数</span>
                <select
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none dark:border-line dark:bg-card dark:text-ink"
                  value={createMaxUses}
                  onChange={(e) => setCreateMaxUses(e.target.value)}
                >
                  <option value="1">1 次</option>
                  <option value="5">5 次</option>
                  <option value="10">10 次</option>
                  <option value="50">50 次</option>
                  <option value="100">100 次</option>
                  <option value="-1">无限次</option>
                  <option value="custom">自定义...</option>
                </select>
              </label>
              {createMaxUses === "custom" && (
                <label className="block space-y-2 text-sm font-medium dark:text-ink">
                  <span>自定义使用次数</span>
                  <Input
                    type="number"
                    value={createMaxUsesCustom}
                    onChange={(e) => setCreateMaxUsesCustom(e.target.value)}
                    min="-1"
                    placeholder="输入使用次数，-1 表示无限"
                    required
                  />
                </label>
              )}
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>有效期</span>
                <select
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none dark:border-line dark:bg-card dark:text-ink"
                  value={createExpiresType}
                  onChange={(e) => setCreateExpiresType(e.target.value)}
                >
                  <option value="7days">7 天</option>
                  <option value="30days">30 天</option>
                  <option value="never">永久</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              {createExpiresType === "custom" && (
                <label className="block space-y-2 text-sm font-medium dark:text-ink">
                  <span>过期日期</span>
                  <Input
                    type="datetime-local"
                    value={createCustomExpires}
                    onChange={(e) => setCreateCustomExpires(e.target.value)}
                    required
                  />
                </label>
              )}
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>描述（可选）</span>
                <Input
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="如：新用户礼包"
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  生成
                </Button>
                <SecondaryButton type="button" onClick={() => setShowCreateDialog(false)} className="flex-1">
                  取消
                </SecondaryButton>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* 使用记录对话框 */}
      {showLogsDialog && selectedCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 dark:bg-card dark:border-line">
            <h3 className="mb-4 text-xl font-semibold dark:text-ink">使用记录：{selectedCode.code}</h3>
            <div className="mb-4 text-sm text-slate-500 dark:text-muted">
              <p>积分：{selectedCode.credits} · 已使用：{selectedCode.usedCount} / {selectedCode.maxUses === -1 ? "∞" : selectedCode.maxUses}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left dark:border-line">
                  <tr>
                    <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">使用时间</th>
                    <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">用户</th>
                    <th className="pb-3 font-medium text-slate-600 dark:text-muted">获得积分</th>
                  </tr>
                </thead>
                <tbody>
                  {redeemLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-500 dark:text-muted">
                        暂无使用记录
                      </td>
                    </tr>
                  ) : null}
                  {redeemLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 last:border-0 dark:border-line/50">
                      <td className="py-3 pr-4 text-slate-500 dark:text-muted">{formatDate(log.redeemedAt)}</td>
                      <td className="py-3 pr-4 dark:text-ink">{log.username}</td>
                      <td className="py-3 font-medium text-emerald-600 dark:text-emerald-400">+{log.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <SecondaryButton onClick={() => setShowLogsDialog(false)}>关闭</SecondaryButton>
            </div>
          </Card>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
