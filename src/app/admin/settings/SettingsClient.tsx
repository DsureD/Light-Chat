"use client";

import { useState, useEffect, FormEvent } from "react";
import { AdminStatusToast, Button, Card, Input, SecondaryButton } from "@/components/ui";
import { Settings } from "@/components/icons";

type SystemSettings = {
  allowUserRegistration: boolean;
  requireInviteCode: boolean;
  defaultUserCredits: number;
  creditPerChatMessage: number;
  creditPerImageGeneration: number;
  maxConversationsPerUser: number;
  maxMessagesPerConversation: number;
  maxContextMessages: number;
  redeemCodeLength: number;
  defaultModelIds: string[];
};

type Model = {
  id: string;
  name: string;
  provider: {
    id: string;
    name: string;
  };
};

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return payload.error || "请求失败。";
  } catch {
    return "请求失败。";
  }
}

export function SettingsClient() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // 表单状态
  const [allowUserRegistration, setAllowUserRegistration] = useState(true);
  const [requireInviteCode, setRequireInviteCode] = useState(false);
  const [defaultUserCredits, setDefaultUserCredits] = useState("1");
  const [creditPerChatMessage, setCreditPerChatMessage] = useState("1");
  const [creditPerImageGeneration, setCreditPerImageGeneration] = useState("5");
  const [maxConversationsPerUser, setMaxConversationsPerUser] = useState("50");
  const [maxMessagesPerConversation, setMaxMessagesPerConversation] = useState("100");
  const [maxContextMessages, setMaxContextMessages] = useState("20");
  const [redeemCodeLength, setRedeemCodeLength] = useState("8");
  const [defaultModelIds, setDefaultModelIds] = useState<string[]>([]);

  useEffect(() => {
    loadSettings();
    loadModels();
  }, []);

  async function loadModels() {
    try {
      const response = await fetch("/api/admin/models-list", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      console.error("加载模型列表失败:", err);
    }
  }

  async function loadSettings() {
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      const s = data.settings;
      setSettings(s);

      // 更新表单状态
      setAllowUserRegistration(s.allowUserRegistration);
      setRequireInviteCode(s.requireInviteCode);
      setDefaultUserCredits(s.defaultUserCredits.toString());
      setCreditPerChatMessage(s.creditPerChatMessage.toString());
      setCreditPerImageGeneration(s.creditPerImageGeneration.toString());
      setMaxConversationsPerUser(s.maxConversationsPerUser.toString());
      setMaxMessagesPerConversation(s.maxMessagesPerConversation.toString());
      setMaxContextMessages(s.maxContextMessages.toString());
      setRedeemCodeLength(s.redeemCodeLength.toString());
      setDefaultModelIds(s.defaultModelIds || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载设置失败。");
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowUserRegistration,
          requireInviteCode,
          defaultUserCredits: parseInt(defaultUserCredits),
          creditPerChatMessage: parseInt(creditPerChatMessage),
          creditPerImageGeneration: parseInt(creditPerImageGeneration),
          maxConversationsPerUser: parseInt(maxConversationsPerUser),
          maxMessagesPerConversation: parseInt(maxMessagesPerConversation),
          maxContextMessages: parseInt(maxContextMessages),
          redeemCodeLength: parseInt(redeemCodeLength),
          defaultModelIds
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const result = await response.json();
      setNotice(`${result.message || "设置已保存。"} 需要重启应用后生效。`);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存设置失败。");
    } finally {
      setLoading(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500 dark:text-muted">加载中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminStatusToast
        loading={loading ? "正在保存设置..." : ""}
        notice={notice}
        error={error}
        onDismiss={() => {
          setNotice("");
          setError("");
        }}
      />

      <Card className="p-6 dark:bg-card dark:border-line">
        <div className="mb-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-sidebar dark:text-muted">
            <Settings className="h-3.5 w-3.5" /> 系统设置
          </div>
          <h2 className="text-2xl font-semibold dark:text-ink">系统设置</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-muted">配置系统的全局行为和限制</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* 注册控制 */}
          <div className="rounded-lg border border-slate-200 dark:border-line p-4">
            <h3 className="mb-4 text-lg font-semibold dark:text-ink">用户注册</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowUserRegistration}
                  onChange={(e) => setAllowUserRegistration(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20 dark:border-line"
                />
                <div>
                  <div className="text-sm font-medium dark:text-ink">允许用户注册</div>
                  <div className="text-xs text-slate-500 dark:text-muted">关闭后，新用户无法注册账号</div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireInviteCode}
                  onChange={(e) => setRequireInviteCode(e.target.checked)}
                  disabled={!allowUserRegistration}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-2 focus:ring-accent/20 dark:border-line disabled:opacity-50"
                />
                <div>
                  <div className="text-sm font-medium dark:text-ink">强制使用邀请码</div>
                  <div className="text-xs text-slate-500 dark:text-muted">开启后，注册时必须填写有效的兑换码作为邀请码</div>
                </div>
              </label>

              <div className="space-y-2">
                <label className="block text-sm font-medium dark:text-ink">新用户默认模型权限</label>
                <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-line bg-white dark:bg-card px-3 py-2">
                  {models.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-muted">暂无可用模型，请先在后台添加服务商和模型</p>
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
                                  checked={defaultModelIds.includes(model.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setDefaultModelIds([...defaultModelIds, model.id]);
                                    } else {
                                      setDefaultModelIds(defaultModelIds.filter((id) => id !== model.id));
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
                <p className="text-xs text-slate-500 dark:text-muted">新用户注册后将自动获得这些模型的使用权限</p>
              </div>
            </div>
          </div>

          {/* 积分设置 */}
          <div className="rounded-lg border border-slate-200 dark:border-line p-4">
            <h3 className="mb-4 text-lg font-semibold dark:text-ink">积分设置</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>新用户初始积分</span>
                <Input
                  type="number"
                  value={defaultUserCredits}
                  onChange={(e) => setDefaultUserCredits(e.target.value)}
                  min="0"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>每次聊天消耗积分</span>
                <Input
                  type="number"
                  value={creditPerChatMessage}
                  onChange={(e) => setCreditPerChatMessage(e.target.value)}
                  min="0"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>每次图片生成消耗积分</span>
                <Input
                  type="number"
                  value={creditPerImageGeneration}
                  onChange={(e) => setCreditPerImageGeneration(e.target.value)}
                  min="0"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>兑换码长度</span>
                <Input
                  type="number"
                  value={redeemCodeLength}
                  onChange={(e) => setRedeemCodeLength(e.target.value)}
                  min="6"
                  max="16"
                  required
                />
                <p className="text-xs text-slate-500 dark:text-muted">6-16 位字符</p>
              </label>
            </div>
          </div>

          {/* 限制设置 */}
          <div className="rounded-lg border border-slate-200 dark:border-line p-4">
            <h3 className="mb-4 text-lg font-semibold dark:text-ink">使用限制</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>每用户最大会话数</span>
                <Input
                  type="number"
                  value={maxConversationsPerUser}
                  onChange={(e) => setMaxConversationsPerUser(e.target.value)}
                  min="1"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>每会话最大消息数</span>
                <Input
                  type="number"
                  value={maxMessagesPerConversation}
                  onChange={(e) => setMaxMessagesPerConversation(e.target.value)}
                  min="1"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>最大上下文消息数</span>
                <Input
                  type="number"
                  value={maxContextMessages}
                  onChange={(e) => setMaxContextMessages(e.target.value)}
                  min="1"
                  required
                />
                <p className="text-xs text-slate-500 dark:text-muted">每次请求携带的历史消息数</p>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存设置"}
            </Button>
            <SecondaryButton type="button" onClick={loadSettings}>
              重置
            </SecondaryButton>
          </div>

        </form>
      </Card>
    </div>
  );
}
