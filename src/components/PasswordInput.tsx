"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "@/components/icons";
import { Input } from "@/components/ui";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  visibilityLabel?: string;
};

export function PasswordInput({ className, visibilityLabel = "密码", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const action = visible ? "隐藏" : "显示";

  return (
    <div className="relative w-full">
      <Input className={className ? `${className} pr-12` : "pr-12"} type={visible ? "text" : "password"} {...props} />
      <button
        type="button"
        aria-label={`${action}${visibilityLabel}`}
        title={`${action}${visibilityLabel}`}
        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-ink/10"
        disabled={props.disabled}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
