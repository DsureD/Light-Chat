"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, Database, KeyRound, Layers3, PencilLine, Plus, RefreshCcw, Trash2 } from "@/components/icons";
import { Button, Card, Input, SecondaryButton } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import type { PublicModel, PublicProvider } from "@/lib/types";

type ProviderWithModels = PublicProvider & { models: PublicModel[] };

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return payload.error || "请求失败。";
  } catch {
    return "请求失败。";
  }
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-sidebar dark:text-muted"}`}>
      {enabled ? "启用" : "停用"}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const className =
    type === "image"
      ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
      : type === "vision"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
        : "bg-slate-100 text-slate-700 dark:bg-sidebar dark:text-muted";

  return <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${className}`}>{type}</span>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AdminClient({ username }: { username: string }) {
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);
  const [providerMode, setProviderMode] = useState<"create" | "edit">("create");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [manualProviderId, setManualProviderId] = useState("");
  const [manualModelName, setManualModelName] = useState("");
  const [manualModelType, setManualModelType] = useState("chat");
  const [manualCapabilities, setManualCapabilities] = useState("chat");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const allModels = useMemo(() => providers.reduce<PublicModel[]>((models, provider) => models.concat(provider.models), []), [providers]);
  const enabledProviders = useMemo(() => providers.filter((provider) => provider.enabled).length, [providers]);
  const enabledModels = useMemo(() => allModels.filter((model) => model.enabled).length, [allModels]);

  const loadProviders = useCallback(async () => {
    const response = await fetch("/api/admin/providers", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const payload = await response.json();
    const nextProviders = (payload.providers || []) as ProviderWithModels[];
    setProviders(nextProviders);
    setManualProviderId((currentProviderId) =>
      nextProviders.some((provider) => provider.id === currentProviderId) ? currentProviderId : nextProviders[0]?.id || ""
    );
  }, []);

  useEffect(() => {
    loadProviders().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "加载失败。"));
  }, [loadProviders]);

  function resetProviderForm() {
    setProviderMode("create");
    setEditingProviderId("");
    setProviderName("");
    setBaseUrl("");
    setApiKey("");
  }

  function startEditProvider(provider: ProviderWithModels) {
    setProviderMode("edit");
    setEditingProviderId(provider.id);
    setProviderName(provider.name);
    setBaseUrl(provider.baseUrl);
    setApiKey("");
    setNotice("");
    setError("");
    window.scrollTo({ top: 0 });
  }

  async function runAction(action: () => Promise<string | void>) {
    setError("");
    setNotice("");

    try {
      const message = await action();
      await loadProviders();
      setNotice(message || "操作成功。");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败。");
    } finally {
      setLoadingMessage("");
    }
  }

  async function submitProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isEditing = providerMode === "edit" && Boolean(editingProviderId);
    setLoadingMessage(isEditing ? "正在更新服务商..." : "正在保存服务商...");

    await runAction(async () => {
      if (!providerName.trim() || !baseUrl.trim()) {
        throw new Error("服务商名称和 Base URL 不能为空。");
      }

      if (!isEditing && !apiKey.trim()) {
        throw new Error("新增服务商需要填写 API Key。");
      }

      const response = await fetch(isEditing ? `/api/admin/providers/${editingProviderId}` : "/api/admin/providers", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: providerName,
          baseUrl,
          ...(apiKey.trim() ? { apiKey } : {})
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      resetProviderForm();
      return isEditing ? "服务商已更新。" : "服务商已保存。";
    });
  }

  async function syncModels(providerId: string) {
    setLoadingMessage("正在查询并导入模型...");
    await runAction(async () => {
      const response = await fetch(`/api/admin/providers/${providerId}/sync-models`, { method: "POST" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = await response.json();
      return `已导入/更新 ${payload.count || 0} 个模型。`;
    });
  }

  async function toggleProvider(provider: ProviderWithModels) {
    setLoadingMessage("正在更新服务商状态...");
    await runAction(async () => {
      const response = await fetch(`/api/admin/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !provider.enabled })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }
    });
  }

  async function deleteProvider(providerId: string) {
    const confirmed = await confirm({
      title: "删除服务商",
      description: "将同时删除该服务商下的所有模型，此操作不可撤销。",
      confirmText: "删除",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    setLoadingMessage("正在删除服务商...");
    await runAction(async () => {
      const response = await fetch(`/api/admin/providers/${providerId}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      if (editingProviderId === providerId) {
        resetProviderForm();
      }
    });
  }

  async function createManualModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingMessage("正在保存模型...");

    await runAction(async () => {
      const response = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: manualProviderId,
          name: manualModelName,
          type: manualModelType,
          capabilities: manualCapabilities
        })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setManualModelName("");
      return "模型已保存。";
    });
  }

  async function toggleModel(model: PublicModel) {
    setLoadingMessage("正在更新模型状态...");
    await runAction(async () => {
      const response = await fetch(`/api/admin/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !model.enabled })
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }
    });
  }

  async function deleteModel(modelId: string) {
    const confirmed = await confirm({
      title: "删除模型",
      description: "该模型将从列表中移除，此操作不可撤销。",
      confirmText: "删除",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    setLoadingMessage("正在删除模型...");
    await runAction(async () => {
      const response = await fetch(`/api/admin/models/${modelId}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }
    });
  }

  return (
    <>
      <Card className="p-6 dark:bg-card dark:border-line">
        <div className="mb-6">
          <h2 className="text-xl font-semibold dark:text-ink">统计概览</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-muted">服务商和模型的整体情况</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-line dark:bg-sidebar">
            <Database className="h-5 w-5 text-slate-500 dark:text-muted" />
            <div>
              <p className="text-2xl font-semibold dark:text-ink">{providers.length}</p>
              <p className="text-xs text-slate-500 dark:text-muted">服务商 · {enabledProviders} 个启用</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-line dark:bg-sidebar">
            <Bot className="h-5 w-5 text-slate-500 dark:text-muted" />
            <div>
              <p className="text-2xl font-semibold dark:text-ink">{allModels.length}</p>
              <p className="text-xs text-slate-500 dark:text-muted">模型总数</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-line dark:bg-sidebar">
            <Layers3 className="h-5 w-5 text-slate-500 dark:text-muted" />
            <div>
              <p className="text-2xl font-semibold dark:text-ink">{enabledModels}</p>
              <p className="text-xs text-slate-500 dark:text-muted">前台可选模型</p>
            </div>
          </div>
        </div>
      </Card>

        {(notice || error || loadingMessage) && (
          <div className="grid gap-2">
            {loadingMessage ? <p className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">{loadingMessage}</p> : null}
            {notice ? <p className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</p> : null}
            {error ? <p className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <Card className="overflow-hidden p-6 dark:bg-card dark:border-line">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-sidebar dark:text-muted">
                  <KeyRound className="h-3.5 w-3.5" /> {providerMode === "edit" ? "编辑服务商" : "新增服务商"}
                </div>
                <h2 className="text-xl font-semibold dark:text-ink">{providerMode === "edit" ? "修改服务商配置" : "连接新的模型服务商"}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-muted">Base URL 支持带或不带 `/v1`，API Key 仅加密保存在服务端。</p>
              </div>
              {providerMode === "edit" ? (
                <SecondaryButton onClick={resetProviderForm} type="button">
                  取消编辑
                </SecondaryButton>
              ) : null}
            </div>

            <form className="space-y-4" onSubmit={submitProvider}>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>服务商名称</span>
                <Input value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="OpenAI / SiliconFlow / 自建中转" />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>Base URL</span>
                <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>{providerMode === "edit" ? "API Key（留空则不修改）" : "API Key"}</span>
                <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={providerMode === "edit" ? "需要更换时再填写" : "sk-..."} />
              </label>
              <Button className="w-full py-3" disabled={Boolean(loadingMessage)} type="submit">
                {providerMode === "edit" ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {providerMode === "edit" ? "保存修改" : "保存服务商"}
              </Button>
            </form>
          </Card>

          <Card className="p-6 dark:bg-card dark:border-line">
            <div className="mb-6">
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-sidebar dark:text-muted">
                <Bot className="h-3.5 w-3.5" /> 手动模型
              </div>
              <h2 className="text-xl font-semibold dark:text-ink">手动添加或覆盖模型</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-muted">服务商不支持 `/v1/models` 时，可在这里添加模型。</p>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={createManualModel}>
              <label className="block space-y-2 text-sm font-medium dark:text-ink md:col-span-2">
                <span>服务商</span>
                <select className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-line dark:bg-card dark:text-ink dark:focus:border-accent/60 dark:focus:ring-accent/10" value={manualProviderId} onChange={(event) => setManualProviderId(event.target.value)}>
                  <option value="">请选择服务商</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink md:col-span-2">
                <span>模型名称</span>
                <Input value={manualModelName} onChange={(event) => setManualModelName(event.target.value)} placeholder="gpt-4o-mini" />
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>类型</span>
                <select
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:border-line dark:bg-card dark:text-ink dark:focus:border-accent/60 dark:focus:ring-accent/10"
                  value={manualModelType}
                  onChange={(event) => {
                    setManualModelType(event.target.value);
                    setManualCapabilities(event.target.value === "image" ? "image" : event.target.value === "vision" ? "chat,vision" : "chat");
                  }}
                >
                  <option value="chat">chat</option>
                  <option value="vision">vision</option>
                  <option value="image">image</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium dark:text-ink">
                <span>能力</span>
                <Input value={manualCapabilities} onChange={(event) => setManualCapabilities(event.target.value)} placeholder="chat,image,vision" />
              </label>
              <Button className="py-3 md:col-span-2" disabled={Boolean(loadingMessage) || !manualProviderId} type="submit">
                保存模型
              </Button>
            </form>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6 dark:bg-card dark:border-line">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold dark:text-ink">服务商配置</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-muted">可编辑名称、Base URL、API Key，并一键同步模型。</p>
              </div>
            </div>
            <div className="space-y-3">
              {providers.length === 0 ? <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-line dark:bg-sidebar dark:text-muted">暂无服务商，请先新增。</p> : null}
              {providers.map((provider) => (
                <div key={provider.id} className="group rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-line dark:bg-sidebar dark:hover:border-line dark:hover:bg-ink/5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-all text-base font-semibold dark:text-ink">{provider.name}</h3>
                        <StatusBadge enabled={provider.enabled} />
                      </div>
                      <p className="truncate text-sm text-slate-500 dark:text-muted">{provider.baseUrl}</p>
                      <p className="text-xs text-slate-400 dark:text-muted/70">已导入 {provider.models.length} 个模型 · API Key 已加密保存</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SecondaryButton disabled={Boolean(loadingMessage)} onClick={() => startEditProvider(provider)}>
                        <PencilLine className="h-4 w-4" /> 编辑
                      </SecondaryButton>
                      <SecondaryButton disabled={Boolean(loadingMessage)} onClick={() => syncModels(provider.id)}>
                        <RefreshCcw className="h-4 w-4" /> 查询导入
                      </SecondaryButton>
                      <SecondaryButton disabled={Boolean(loadingMessage)} onClick={() => toggleProvider(provider)}>
                        {provider.enabled ? "停用" : "启用"}
                      </SecondaryButton>
                      <SecondaryButton className="text-red-600 dark:text-red-400" disabled={Boolean(loadingMessage)} onClick={() => deleteProvider(provider.id)}>
                        <Trash2 className="h-4 w-4" /> 删除
                      </SecondaryButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 dark:bg-card dark:border-line">
            <div className="mb-5">
              <h2 className="text-xl font-semibold dark:text-ink">模型列表</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-muted">按服务商分组展示，共 {allModels.length} 个模型。</p>
            </div>
            <div className="max-h-[40rem] space-y-5 overflow-auto pr-1">
              {allModels.length === 0 ? <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-line dark:bg-sidebar dark:text-muted">暂无模型，请查询导入或手动添加。</p> : null}
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-md border border-slate-200 bg-white p-4 dark:border-line dark:bg-sidebar">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold dark:text-ink">{provider.name}</h3>
                      <p className="text-xs text-slate-400 dark:text-muted/70">{provider.models.length} 个模型</p>
                    </div>
                    <StatusBadge enabled={provider.enabled} />
                  </div>
                  <div className="space-y-2">
                    {provider.models.length === 0 ? <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500 dark:bg-card dark:text-muted">该服务商暂无模型。</p> : null}
                    {provider.models.map((model) => (
                      <div key={model.id} className="flex flex-col justify-between gap-3 rounded-md bg-slate-50 p-3 dark:bg-card md:flex-row md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="break-all text-sm font-semibold dark:text-ink">{model.name}</h4>
                            <TypeBadge type={model.type} />
                            <StatusBadge enabled={model.enabled} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-muted">能力：{model.capabilities}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <SecondaryButton className="px-3 py-1.5" disabled={Boolean(loadingMessage)} onClick={() => toggleModel(model)}>
                            {model.enabled ? "停用" : "启用"}
                          </SecondaryButton>
                          <SecondaryButton className="px-3 py-1.5 text-red-600 dark:text-red-400" disabled={Boolean(loadingMessage)} onClick={() => deleteModel(model.id)}>
                            删除
                          </SecondaryButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      {confirmDialog}
    </>
  );
}
