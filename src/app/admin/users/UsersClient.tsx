"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminStatusToast, Button, Card, Input, SecondaryButton } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { PasswordInput } from "@/components/PasswordInput";
import { Users, Plus, PencilLine, Trash2, Gift, History } from "@/components/icons";

type User = {
  id: string;
  username: string;
  role: string;
  credits: number;
  status: string;
  maxConversations: number | null;
  maxMessagesPerConversation: number | null;
  createdAt: string;
};

type Model = {
  id: string;
  name: string;
  provider: {
    id: string;
    name: string;
  };
};

type CreditLog = {
  id: string;
  amount: number;
  type: string;
  modelName: string | null;
  description: string | null;
  createdAt: string;
};

const LOGS_PAGE_SIZE = 20;

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

function StatusBadge({ status }: { status: string }) {
  const colors = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    suspended: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    banned: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300"
  };

  const labels = {
    active: "正常",
    suspended: "暂停",
    banned: "封禁"
  };

  return (
    <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${colors[status as keyof typeof colors] || colors.active}`}>
      {labels[status as keyof typeof labels] || status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "ADMIN" || role === "admin";
  return (
    <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${isAdmin ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "bg-slate-100 text-slate-500 dark:bg-sidebar dark:text-muted"}`}>
      {isAdmin ? "管理员" : "用户"}
    </span>
  );
}

export function UsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotal, setLogTotal] = useState(0);

  // 分页
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 批量操作
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // 创建用户表单
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createCredits, setCreateCredits] = useState("100");
  const [createModelIds, setCreateModelIds] = useState<string[]>([]);

  // 编辑用户表单
  const [editCredits, setEditCredits] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editMaxConversations, setEditMaxConversations] = useState("");
  const [editMaxMessages, setEditMaxMessages] = useState("");
  const [editModelIds, setEditModelIds] = useState<string[]>([]);

  // 充值表单
  const [grantAmount, setGrantAmount] = useState("");
  const [grantDescription, setGrantDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const { confirm, confirmDialog } = useConfirm();

  const loadUsers = useCallback(async (currentPage: number = 1) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("page", currentPage.toString());
      params.set("limit", "20");

      const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      setUsers(data.users || []);
      if (data.pagination) {
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
      setSelectedUserIds(new Set()); // 清空选择
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载用户列表失败。");
    }
  }, [search, statusFilter]);

  const loadModels = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/models-list", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      console.error("加载模型列表失败:", err);
    }
  }, []);

  useEffect(() => {
    loadUsers(1);
  }, [search, statusFilter]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      if (!createUsername.trim() || !createPassword.trim()) {
        throw new Error("用户名和密码不能为空。");
      }

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createUsername,
          password: createPassword,
          credits: parseInt(createCredits) || 0,
          modelIds: createModelIds
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice("用户创建成功。");
      setShowCreateDialog(false);
      setCreateUsername("");
      setCreatePassword("");
      setCreateCredits("100");
      setCreateModelIds([]);
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建用户失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleEditUser(event: FormEvent) {
    event.preventDefault();
    if (!selectedUser) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits: editCredits ? parseInt(editCredits) : undefined,
          status: editStatus || undefined,
          maxConversations: editMaxConversations ? parseInt(editMaxConversations) : undefined,
          maxMessagesPerConversation: editMaxMessages ? parseInt(editMaxMessages) : undefined,
          modelIds: editModelIds.length > 0 ? editModelIds : undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice("用户信息已更新。");
      setShowEditDialog(false);
      setSelectedUser(null);
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新用户失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleGrantCredits(event: FormEvent) {
    event.preventDefault();
    if (!selectedUser) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const amount = parseInt(grantAmount);
      if (isNaN(amount) || amount === 0) {
        throw new Error("请输入有效的积分数量。");
      }

      const response = await fetch(`/api/admin/users/${selectedUser.id}/grant-credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: grantDescription || "管理员充值"
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice(`已为用户 ${amount > 0 ? "充值" : "扣除"} ${Math.abs(amount)} 积分。`);
      setShowGrantDialog(false);
      setSelectedUser(null);
      setGrantAmount("");
      setGrantDescription("");
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "充值失败。");
    } finally {
      setLoading(false);
    }
  }

  // 批量操作函数
  function toggleSelectUser(userId: string) {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedUserIds(newSet);
  }

  function toggleSelectAll() {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map(u => u.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedUserIds.size === 0) return;

    const confirmed = await confirm({
      title: "批量删除用户",
      description: `确定要删除选中的 ${selectedUserIds.size} 个用户吗？此操作不可撤销。`,
      confirmText: "删除",
      tone: "danger"
    });

    if (!confirmed) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          userIds: Array.from(selectedUserIds)
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice(`已成功删除 ${selectedUserIds.size} 个用户。`);
      setSelectedUserIds(new Set());
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量删除失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkGrantCredits() {
    if (selectedUserIds.size === 0) return;

    const amount = prompt(`为选中的 ${selectedUserIds.size} 个用户充值积分（可输入负数扣除）：`);
    if (!amount) return;

    const credits = parseInt(amount);
    if (isNaN(credits) || credits === 0) {
      setError("请输入有效的积分数量。");
      return;
    }

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant_credits",
          userIds: Array.from(selectedUserIds),
          value: credits
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice(`已为 ${selectedUserIds.size} 个用户${credits > 0 ? "充值" : "扣除"} ${Math.abs(credits)} 积分。`);
      setSelectedUserIds(new Set());
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量充值失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkUpdateStatus(status: string) {
    if (selectedUserIds.size === 0) return;

    const statusText = { active: "激活", suspended: "暂停", banned: "封禁" }[status] || status;
    const confirmed = await confirm({
      title: "批量修改状态",
      description: `确定要将选中的 ${selectedUserIds.size} 个用户状态改为"${statusText}"吗？`,
      confirmText: "确定"
    });

    if (!confirmed) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          userIds: Array.from(selectedUserIds),
          value: status
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice(`已成功修改 ${selectedUserIds.size} 个用户的状态。`);
      setSelectedUserIds(new Set());
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量修改状态失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(user: User) {
    const confirmed = await confirm({
      title: "删除用户",
      description: `确定要删除用户 "${user.username}" 吗？此操作不可撤销。`,
      confirmText: "删除",
      tone: "danger"
    });

    if (!confirmed) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice("用户已删除。");
      await loadUsers(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除用户失败。");
    } finally {
      setLoading(false);
    }
  }

  async function loadUserLogs(user: User, currentPage: number = 1) {
    setSelectedUser(user);
    setShowLogsDialog(true);
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}/credit-logs?page=${currentPage}&limit=${LOGS_PAGE_SIZE}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      setCreditLogs(data.logs || []);
      if (data.pagination) {
        setLogPage(data.pagination.page);
        setLogTotalPages(data.pagination.totalPages);
        setLogTotal(data.pagination.total);
      } else {
        setLogPage(1);
        setLogTotalPages(1);
        setLogTotal(data.logs?.length || 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载日志失败。");
    } finally {
      setLoading(false);
    }
  }

  async function openEditDialog(user: User) {
    setSelectedUser(user);
    setEditCredits(user.credits.toString());
    setEditStatus(user.status);
    setEditMaxConversations(user.maxConversations?.toString() || "");
    setEditMaxMessages(user.maxMessagesPerConversation?.toString() || "");
    setShowEditDialog(true);

    // 异步加载用户的模型权限
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setEditModelIds(data.user.modelIds || []);
      } else {
        setEditModelIds([]);
      }
    } catch {
      setEditModelIds([]);
    }
  }

  function openGrantDialog(user: User) {
    setSelectedUser(user);
    setGrantAmount("");
    setGrantDescription("");
    setShowGrantDialog(true);
  }

  const filteredUsers = users.filter((user) => {
    const matchSearch = !search || user.username.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || user.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <AdminStatusToast
        loading={loading ? "正在处理..." : ""}
        notice={notice}
        error={error}
        onDismiss={() => {
          setNotice("");
          setError("");
        }}
      />

      <Card className="p-6 dark:bg-card dark:border-line">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-sidebar dark:text-muted">
              <Users className="h-3.5 w-3.5" /> 用户管理
            </div>
            <h2 className="text-2xl font-semibold dark:text-ink">用户列表</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-muted">管理用户账号、积分、权限和状态</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> 添加用户
          </Button>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <Input
            className="sm:w-64"
            placeholder="搜索用户名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-line dark:bg-card dark:text-ink dark:focus:border-accent/60 dark:focus:ring-accent/10"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="suspended">暂停</option>
            <option value="banned">封禁</option>
          </select>
        </div>

        {/* 批量操作 */}
        {selectedUserIds.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              已选择 {selectedUserIds.size} 个用户
            </span>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={handleBulkGrantCredits} className="text-xs">
                <Gift className="h-3.5 w-3.5" /> 批量充值
              </SecondaryButton>
              <SecondaryButton onClick={() => handleBulkUpdateStatus("active")} className="text-xs">
                激活
              </SecondaryButton>
              <SecondaryButton onClick={() => handleBulkUpdateStatus("suspended")} className="text-xs">
                暂停
              </SecondaryButton>
              <SecondaryButton onClick={() => handleBulkUpdateStatus("banned")} className="text-xs">
                封禁
              </SecondaryButton>
              <SecondaryButton onClick={handleBulkDelete} className="text-xs text-red-600 dark:text-red-400">
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
                    checked={selectedUserIds.size === users.length && users.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20"
                  />
                </th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">用户名</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">角色</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">积分</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">状态</th>
                <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">注册时间</th>
                <th className="pb-3 font-medium text-slate-600 dark:text-muted">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-muted">
                    暂无用户数据
                  </td>
                </tr>
              ) : null}
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0 dark:border-line/50">
                  <td className="py-3 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user.id)}
                      onChange={() => toggleSelectUser(user.id)}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </td>
                  <td className="py-3 pr-4 font-medium dark:text-ink">{user.username}</td>
                  <td className="py-3 pr-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="py-3 pr-4 dark:text-ink">{user.credits}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="py-3 pr-4 text-slate-500 dark:text-muted">{formatDate(user.createdAt)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => openEditDialog(user)}>
                        <PencilLine className="h-3 w-3" /> 编辑
                      </SecondaryButton>
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => openGrantDialog(user)}>
                        <Gift className="h-3 w-3" /> 充值
                      </SecondaryButton>
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => loadUserLogs(user)}>
                        <History className="h-3 w-3" /> 日志
                      </SecondaryButton>
                      {user.role !== "ADMIN" && user.role !== "admin" && (
                        <SecondaryButton className="px-2 py-1 text-xs text-red-600 dark:text-red-400" onClick={() => handleDeleteUser(user)}>
                          <Trash2 className="h-3 w-3" /> 删除
                        </SecondaryButton>
                      )}
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
              共 {total} 个用户，第 {page} / {totalPages} 页
            </div>
            <div className="flex gap-2">
              <SecondaryButton
                onClick={() => loadUsers(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 text-sm"
              >
                上一页
              </SecondaryButton>
              <SecondaryButton
                onClick={() => loadUsers(page + 1)}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm"
              >
                下一页
              </SecondaryButton>
            </div>
          </div>
        )}
      </Card>

      {/* 创建用户对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md p-6 dark:bg-card dark:border-line">
            <h3 className="mb-4 text-xl font-semibold dark:text-ink">添加用户</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>用户名</span>
                <Input
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="请输入用户名"
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>密码</span>
                <PasswordInput
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="至少8位字符"
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>初始积分</span>
                <Input
                  type="number"
                  value={createCredits}
                  onChange={(e) => setCreateCredits(e.target.value)}
                  min="0"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>模型权限（可选）</span>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-white px-3 py-2 dark:border-line dark:bg-card">
                  {models.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-muted">暂无可用模型</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(
                        models.reduce((acc, model) => {
                          const providerId = model.provider.id;
                          if (!acc[providerId]) {
                            acc[providerId] = {
                              name: model.provider.name,
                              models: []
                            };
                          }
                          acc[providerId].models.push(model);
                          return acc;
                        }, {} as Record<string, { name: string; models: Model[] }>)
                      ).map(([providerId, group]) => (
                        <div key={providerId}>
                          <div className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-muted">{group.name}</div>
                          <div className="space-y-1">
                            {group.models.map((model) => (
                              <label key={model.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-sidebar rounded px-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={createModelIds.includes(model.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setCreateModelIds([...createModelIds, model.id]);
                                    } else {
                                      setCreateModelIds(createModelIds.filter((id) => id !== model.id));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20 dark:border-line"
                                />
                                <span className="text-sm dark:text-ink">{model.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-muted">勾选用户可以使用的模型</p>
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  创建
                </Button>
                <SecondaryButton type="button" onClick={() => setShowCreateDialog(false)} className="flex-1">
                  取消
                </SecondaryButton>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* 编辑用户对话框 */}
      {showEditDialog && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto p-6 dark:bg-card dark:border-line">
            <h3 className="mb-4 text-xl font-semibold dark:text-ink">编辑用户：{selectedUser.username}</h3>
            <form onSubmit={handleEditUser} className="space-y-4">
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>积分余额</span>
                <Input
                  type="number"
                  value={editCredits}
                  onChange={(e) => setEditCredits(e.target.value)}
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>状态</span>
                <select
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none dark:border-line dark:bg-card dark:text-ink"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option value="active">正常</option>
                  <option value="suspended">暂停</option>
                  <option value="banned">封禁</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>最大会话数</span>
                <Input
                  type="number"
                  value={editMaxConversations}
                  onChange={(e) => setEditMaxConversations(e.target.value)}
                  placeholder="留空使用默认值"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>每会话最大消息数</span>
                <Input
                  type="number"
                  value={editMaxMessages}
                  onChange={(e) => setEditMaxMessages(e.target.value)}
                  placeholder="留空使用默认值"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>模型权限</span>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-white px-3 py-2 dark:border-line dark:bg-card">
                  {models.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-muted">暂无可用模型</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(
                        models.reduce((acc, model) => {
                          const providerId = model.provider.id;
                          if (!acc[providerId]) {
                            acc[providerId] = {
                              name: model.provider.name,
                              models: []
                            };
                          }
                          acc[providerId].models.push(model);
                          return acc;
                        }, {} as Record<string, { name: string; models: Model[] }>)
                      ).map(([providerId, group]) => (
                        <div key={providerId}>
                          <div className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-muted">{group.name}</div>
                          <div className="space-y-1">
                            {group.models.map((model) => (
                              <label key={model.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-sidebar rounded px-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={editModelIds.includes(model.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEditModelIds([...editModelIds, model.id]);
                                    } else {
                                      setEditModelIds(editModelIds.filter((id) => id !== model.id));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20 dark:border-line"
                                />
                                <span className="text-sm dark:text-ink">{model.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-muted">勾选用户可以使用的模型</p>
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  保存
                </Button>
                <SecondaryButton type="button" onClick={() => setShowEditDialog(false)} className="flex-1">
                  取消
                </SecondaryButton>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* 充值对话框 */}
      {showGrantDialog && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md p-6 dark:bg-card dark:border-line">
            <h3 className="mb-4 text-xl font-semibold dark:text-ink">充值积分：{selectedUser.username}</h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-muted">当前积分：{selectedUser.credits}</p>
            <form onSubmit={handleGrantCredits} className="space-y-4">
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>积分数量</span>
                <Input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  placeholder="正数充值，负数扣除"
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>备注</span>
                <Input
                  value={grantDescription}
                  onChange={(e) => setGrantDescription(e.target.value)}
                  placeholder="可选"
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  确认
                </Button>
                <SecondaryButton type="button" onClick={() => setShowGrantDialog(false)} className="flex-1">
                  取消
                </SecondaryButton>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* 日志对话框 */}
      {showLogsDialog && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 dark:bg-card dark:border-line">
            <h3 className="mb-4 text-xl font-semibold dark:text-ink">积分日志：{selectedUser.username}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left dark:border-line">
                  <tr>
                    <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">时间</th>
                    <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">类型</th>
                    <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">数量</th>
                    <th className="pb-3 pr-4 font-medium text-slate-600 dark:text-muted">模型</th>
                    <th className="pb-3 font-medium text-slate-600 dark:text-muted">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {creditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-muted">
                        暂无日志
                      </td>
                    </tr>
                  ) : null}
                  {creditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 last:border-0 dark:border-line/50">
                      <td className="py-3 pr-4 text-slate-500 dark:text-muted">{formatDate(log.createdAt)}</td>
                      <td className="py-3 pr-4 dark:text-ink">{log.type}</td>
                      <td className={`py-3 pr-4 font-medium ${log.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {log.amount > 0 ? "+" : ""}{log.amount}
                      </td>
                      <td className="py-3 pr-4 text-slate-500 dark:text-muted">{log.modelName || "-"}</td>
                      <td className="py-3 text-slate-500 dark:text-muted">{log.description || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logTotalPages > 1 && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-line sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600 dark:text-muted">
                  共 {logTotal} 条日志，第 {logPage} / {logTotalPages} 页
                </div>
                <div className="flex gap-2">
                  <SecondaryButton
                    onClick={() => loadUserLogs(selectedUser, logPage - 1)}
                    disabled={loading || logPage === 1}
                    className="px-3 py-1 text-sm"
                  >
                    上一页
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={() => loadUserLogs(selectedUser, logPage + 1)}
                    disabled={loading || logPage === logTotalPages}
                    className="px-3 py-1 text-sm"
                  >
                    下一页
                  </SecondaryButton>
                </div>
              </div>
            )}
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
