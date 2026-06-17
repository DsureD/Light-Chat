import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { X } from "@/components/icons";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink shadow-sm transition-all hover:bg-accent/90 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        className
      )}
      {...props}
    />
  );
}

export function SecondaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-medium text-ink/80 transition-all hover:bg-ink/[0.04] hover:text-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-accent/60 focus:ring-4 focus:ring-accent/10",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-accent/60 focus:ring-4 focus:ring-accent/10",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-2xl border border-line bg-card shadow-soft", className)} {...props} />;
}

type AdminStatusToastProps = {
  loading?: string;
  notice?: string;
  error?: string;
  onDismiss?: () => void;
};

export function AdminStatusToast({ loading, notice, error, onDismiss }: AdminStatusToastProps) {
  if (!loading && !notice && !error) {
    return null;
  }

  const dismissible = Boolean(onDismiss && (notice || error));
  const itemClassName = "flex min-w-0 items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg shadow-slate-950/10 backdrop-blur";
  const messageClassName = "max-h-48 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words leading-6";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div className="pointer-events-auto grid w-full max-w-2xl gap-2">
        {loading ? (
          <div className={`${itemClassName} border-blue-200 bg-blue-50/95 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/90 dark:text-blue-300`}>
            <p className={messageClassName}>{loading}</p>
          </div>
        ) : null}
        {notice ? (
          <div className={`${itemClassName} border-emerald-200 bg-emerald-50/95 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/90 dark:text-emerald-300`}>
            <p className={messageClassName}>{notice}</p>
            {dismissible ? (
              <button
                type="button"
                aria-label="关闭提示"
                title="关闭提示"
                className="shrink-0 rounded-lg p-1 text-current opacity-70 transition hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className={`${itemClassName} border-red-200 bg-red-50/95 text-red-700 dark:border-red-900/50 dark:bg-red-950/90 dark:text-red-300`}>
            <p className={messageClassName}>{error}</p>
            {dismissible ? (
              <button
                type="button"
                aria-label="关闭提示"
                title="关闭提示"
                className="shrink-0 rounded-lg p-1 text-current opacity-70 transition hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
