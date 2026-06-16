"use client";

import { clsx } from "clsx";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "@/components/icons";
import { SecondaryButton } from "@/components/ui";

type ConfirmTone = "default" | "danger";

export type ConfirmOptions = {
  /** 标题，简明说明将要发生什么 */
  title: string;
  /** 补充说明，例如「此操作不可撤销」 */
  description?: ReactNode;
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string;
  /** danger 用于删除等不可逆操作，确认按钮显示为红色 */
  tone?: ConfirmTone;
};

type ConfirmState = ConfirmOptions & { open: boolean };

const CLOSED_STATE: ConfirmState = { open: false, title: "" };

/**
 * 以 Promise 形式调用的确认弹窗，替代原生 window.confirm，风格与项目统一。
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: "删除会话", tone: "danger" }))) return;
 *   // ...
 *   return (<main>{页面内容}{confirmDialog}</main>);
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(CLOSED_STATE);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState((current) => ({ ...current, open: false }));
  }, []);

  const confirmDialog = <ConfirmDialog state={state} onConfirm={() => settle(true)} onCancel={() => settle(false)} />;

  return { confirm, confirmDialog };
}

function ConfirmDialog({ state, onConfirm, onCancel }: { state: ConfirmState; onConfirm: () => void; onCancel: () => void }) {
  const [mounted, setMounted] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!state.open) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => confirmRef.current?.focus(), 20);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [state.open, onCancel]);

  if (!mounted || !state.open) {
    return null;
  }

  const danger = state.tone === "danger";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="关闭"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-lift animate-scale-in">
        <div className="flex items-start gap-3.5">
          <div
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              danger ? "bg-red-500/10 text-red-500 dark:text-red-400" : "bg-accent/10 text-accent"
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-base font-semibold text-ink">{state.title}</h2>
            {state.description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{state.description}</p> : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <SecondaryButton type="button" onClick={onCancel}>
            {state.cancelText || "取消"}
          </SecondaryButton>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={clsx(
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:shadow active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              danger
                ? "bg-red-500 text-white hover:bg-red-500/90 focus-visible:ring-red-500/40"
                : "bg-accent text-accent-ink hover:bg-accent/90 focus-visible:ring-accent/40"
            )}
          >
            {state.confirmText || "确定"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
