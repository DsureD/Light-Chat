"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

function isChunkLoadError(error: Error) {
  const message = error.message || "";
  return /loading chunk|chunkloaderror|_next\/static\/chunks/i.test(message);
}

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    console.error(error);
  }, [error]);

  function hardReload() {
    window.location.reload();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="max-w-lg bg-white p-6">
        <p className="text-sm font-medium text-red-600">页面加载异常</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{chunkError ? "静态资源版本不一致" : "客户端脚本执行失败"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {chunkError
            ? "浏览器缓存了旧页面，但服务器上的旧 JS chunk 已不存在，请强制刷新页面。"
            : "请先刷新页面。如果问题仍然存在，请把下面的错误信息发给管理员排查。"}
        </p>
        <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
          {error.message || "Unknown client error"}
          {error.digest ? `\nDigest: ${error.digest}` : ""}
        </pre>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={chunkError ? hardReload : reset}>
            重新加载
          </Button>
        </div>
      </Card>
    </main>
  );
}
