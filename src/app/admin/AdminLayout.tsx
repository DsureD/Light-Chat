"use client";

import Link from "next/link";
import { useState } from "react";
import { LogOut, Settings2, Database, Users, Ticket, Settings } from "@/components/icons";
import { SecondaryButton } from "@/components/ui";
import { AdminClient } from "./AdminClient";
import { UsersClient } from "./users/UsersClient";
import { RedeemCodesClient } from "./redeem-codes/RedeemCodesClient";
import { SettingsClient } from "./settings/SettingsClient";

type TabKey = "models" | "users" | "redeem-codes" | "settings";

export function AdminLayout({ username }: { username: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>("models");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main aria-label={`管理员：${username}`} className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 dark:bg-canvas dark:text-ink lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-line dark:bg-card">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-line dark:bg-sidebar dark:text-muted">
                <Settings2 className="h-3.5 w-3.5" /> 管理控制台
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">管理后台</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-muted">管理模型服务商、用户账号和兑换码。</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-line dark:bg-card dark:text-ink dark:hover:bg-ink/5" href="/chat">
                返回聊天
              </Link>
              <SecondaryButton onClick={logout}>
                <LogOut className="h-4 w-4" /> 退出登录
              </SecondaryButton>
            </div>
          </div>

          {/* 标签页导航 */}
          <div className="border-t border-slate-200 dark:border-line">
            <div className="flex gap-1 px-6">
              <button
                onClick={() => setActiveTab("models")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "models"
                    ? "border-accent text-accent dark:border-accent dark:text-accent"
                    : "border-transparent text-slate-600 hover:text-slate-900 dark:text-muted dark:hover:text-ink"
                }`}
              >
                <Database className="h-4 w-4" />
                模型管理
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "users"
                    ? "border-accent text-accent dark:border-accent dark:text-accent"
                    : "border-transparent text-slate-600 hover:text-slate-900 dark:text-muted dark:hover:text-ink"
                }`}
              >
                <Users className="h-4 w-4" />
                用户管理
              </button>
              <button
                onClick={() => setActiveTab("redeem-codes")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "redeem-codes"
                    ? "border-accent text-accent dark:border-accent dark:text-accent"
                    : "border-transparent text-slate-600 hover:text-slate-900 dark:text-muted dark:hover:text-ink"
                }`}
              >
                <Ticket className="h-4 w-4" />
                兑换码管理
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "settings"
                    ? "border-accent text-accent dark:border-accent dark:text-accent"
                    : "border-transparent text-slate-600 hover:text-slate-900 dark:text-muted dark:hover:text-ink"
                }`}
              >
                <Settings className="h-4 w-4" />
                系统设置
              </button>
            </div>
          </div>
        </header>

        {/* 标签页内容 */}
        {activeTab === "models" && <AdminClient username={username} />}
        {activeTab === "users" && <UsersClient />}
        {activeTab === "redeem-codes" && <RedeemCodesClient />}
        {activeTab === "settings" && <SettingsClient />}
      </div>
    </main>
  );
}
