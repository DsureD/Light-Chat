"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type ClipboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Check, ChevronDown, Coins, Copy, FileText, ImageIcon, LogOut, MessageSquare, PanelLeftClose, PanelLeftOpen, Paperclip, PencilLine, Plus, RefreshCcw, Send, Settings, Sparkles, Square, Trash2, X } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useConfirm } from "@/components/ConfirmDialog";
import type { ChatMessageDto, ConversationDto, PublicModel } from "@/lib/types";

type LocalMessage = ChatMessageDto & { pending?: boolean };

type Attachment = {
  id: string;
  name: string;
  type: "text" | "image";
  content: string;
  size: number;
  preview?: string;
};

type Agent = {
  id: string;
  name: string;
  prompt: string;
};

type ImagePreviewPayload = {
  src: string;
  downloadSrc: string;
  alt: string;
};

type ImagePreviewState = ImagePreviewPayload & {
  isOpen: boolean;
};

type StreamEvent = {
  eventName: string;
  data: Record<string, unknown>;
};

type ModelGroup = {
  providerId: string;
  providerName: string;
  models: PublicModel[];
};

type SendMessageOptions = {
  skipAddingUserMessage?: boolean;
  regenerateMessageId?: string;
};

const USER_MESSAGE_COLLAPSE_LIMIT = 300;

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return payload.error || "请求失败。";
  } catch {
    return "请求失败。";
  }
}

function nowIsoString() {
  return new Date().toISOString();
}

function localMessage(role: string, content: string, modelName?: string | null): LocalMessage {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    modelName: modelName ?? null,
    createdAt: nowIsoString(),
    pending: true
  };
}

function parseStreamEvent(block: string): StreamEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return { eventName, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return { eventName, data: { content: dataLines.join("\n") } };
  }
}

function groupedModels(models: PublicModel[]) {
  const groups = new Map<string, ModelGroup>();

  for (const model of models) {
    const providerId = model.providerId;
    const providerName = model.providerName || "未命名服务商";
    const group = groups.get(providerId);

    if (group) {
      group.models.push(model);
    } else {
      groups.set(providerId, { providerId, providerName, models: [model] });
    }
  }

  return Array.from(groups.values());
}

function isImageGenerationModel(model: PublicModel | null) {
  if (!model) {
    return false;
  }

  const capabilities = model.capabilities.split(",").map((capability) => capability.trim());
  return model.type === "image" || capabilities.includes("image");
}

function normalizeImageUrl(url?: string | null) {
  if (!url) {
    return "";
  }

  const normalized = url.trim().replace(/\\/g, "/");
  if (normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("data:")) {
    return normalized;
  }

  const uploadMatch = normalized.match(/(?:^|\/)(?:public\/)?(?:uploads|uplaods)\/([^/?#]+)([?#].*)?$/i);

  if (uploadMatch) {
    return `/uploads/${uploadMatch[1]}${uploadMatch[2] || ""}`;
  }

  if (normalized.startsWith("/uplaods/")) {
    return normalized.replace(/^\/uplaods\//, "/uploads/");
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  return `/${normalized}`;
}

function scrollElementIntoView(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  element.scrollIntoView({ block: "end" });
}

// 提取消息的纯文本内容：带附件的用户消息 content 是 vision 格式的 JSON 字符串
function extractMessageText(content: string) {
  try {
    if (content.startsWith("[")) {
      const parts = JSON.parse(content);

      if (Array.isArray(parts)) {
        return parts
          .filter((part: { type: string }) => part.type === "text")
          .map((part: { text?: string }) => part.text || "")
          .join(" ")
          .trim();
      }
    }
  } catch {
    // 解析失败时按纯文本处理
  }

  return content;
}

function formatDateShort(dateString: string) {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

function Avatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
      <Sparkles className="h-[18px] w-[18px]" />
    </div>
  );
}

function ChatStatusMessages({ status, error, onDismissError }: { status: string; error: string; onDismissError: () => void }) {
  if (!status && !error) {
    return null;
  }

  return (
    <div className="space-y-2">
      {status ? (
        <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent">
          <span className="inline-block h-1.5 w-1.5 shrink-0 animate-blink rounded-full bg-accent" />
          <span className="min-w-0 break-words">{status}</span>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-sm text-red-600 dark:text-red-400" role="alert">
          <div className="flex items-center justify-between gap-3 border-b border-red-500/10 px-3 py-2">
            <span className="font-medium">请求失败</span>
            <button
              type="button"
              onClick={onDismissError}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-600/70 transition hover:bg-red-500/10 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 dark:text-red-400/80 dark:hover:text-red-300"
              title="关闭错误提示"
              aria-label="关闭错误提示"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 leading-6 sm:max-h-64">
            {error}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace(/language-/, "") || "";

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper group relative my-3">
      <div className="flex items-center justify-between rounded-t-lg bg-[#2d2d2d] px-3 py-1.5">
        <span className="text-xs text-gray-400">{language || "text"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition hover:bg-white/10 hover:text-gray-200"
          title="复制代码"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-pre !m-0 !rounded-t-none !rounded-b-lg !border-0">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function ImagePreviewOverlay({ preview, onClose }: { preview: ImagePreviewState; onClose: () => void }) {
  return (
    <div
      className={
        preview.isOpen
          ? "fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-6"
          : "pointer-events-none fixed inset-0 z-[1000] hidden"
      }
      onClick={preview.isOpen ? onClose : undefined}
      role={preview.isOpen ? "dialog" : undefined}
      aria-modal={preview.isOpen ? "true" : undefined}
      aria-hidden={preview.isOpen ? undefined : true}
      aria-label="图片预览"
    >
      <button
        type="button"
        className="fixed right-3 top-3 z-[1002] flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/75 text-white shadow-2xl transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:right-5 sm:top-5"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        title="关闭预览"
        aria-label="关闭预览"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain shadow-2xl"
        src={preview.src}
        alt={preview.alt}
        onClick={(event) => event.stopPropagation()}
      />
      {preview.downloadSrc ? (
        <a
          className="fixed bottom-4 left-1/2 z-[1002] -translate-x-1/2 rounded-xl border border-white/20 bg-white px-4 py-2 text-sm font-medium text-black shadow-2xl transition hover:bg-white/90"
          href={preview.downloadSrc}
          download="generated-image.png"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          下载图片
        </a>
      ) : null}
    </div>
  );
}

function MessageImageThumb({
  src,
  alt,
  onPreviewImage
}: {
  src: string;
  alt: string;
  onPreviewImage?: (preview: ImagePreviewPayload) => void;
}) {
  const [failed, setFailed] = useState(false);
  const normalizedSrc = useMemo(() => normalizeImageUrl(src), [src]);

  useEffect(() => {
    setFailed(false);
  }, [normalizedSrc]);

  if (!normalizedSrc || failed) {
    return (
      <a
        className="inline-flex min-h-20 w-32 items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-card/70 px-3 py-2 text-xs font-medium text-muted transition hover:bg-card hover:text-ink"
        href={normalizedSrc || undefined}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ImageIcon className="h-4 w-4 shrink-0" />
        <span>打开图片</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      className="block overflow-hidden rounded-lg border border-line/70 bg-card/60 transition hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      onClick={() => onPreviewImage?.({ src: normalizedSrc, downloadSrc: normalizedSrc, alt })}
      title="查看大图"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={normalizedSrc}
        alt={alt}
        className="max-h-32 max-w-48 object-contain"
        onError={() => setFailed(true)}
      />
    </button>
  );
}

// memo：流式期间每次 delta 都会更新消息数组，未变化的消息对象引用不变，
// 配合外层稳定的回调引用可跳过历史消息的重渲染（含 Markdown 重解析）
const MessageBubble = memo(function MessageBubble({
  message,
  onEdit,
  onRegenerate,
  onCopy,
  onPreviewImage
}: {
  message: LocalMessage;
  onEdit?: (messageId: string, content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  onPreviewImage?: (preview: ImagePreviewPayload) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(false);
  const isUser = message.role === "user";

  // 解析vision格式的消息
  const parsedContent: { text: string; images: string[] } = useMemo(() => {
    try {
      if (typeof message.content === "string" && message.content.startsWith("[") && message.content.includes('"type"')) {
        const visionParts = JSON.parse(message.content);
        if (Array.isArray(visionParts)) {
          return {
            text: visionParts.filter((p: { type: string }) => p.type === "text").map((p: { text?: string }) => p.text).join("\n"),
            images: visionParts.filter((p: { type: string }) => p.type === "image_url").map((p: { image_url?: { url: string } }) => p.image_url?.url || "")
          };
        }
      }
    } catch {
      // 解析失败，使用原始内容
    }
    return { text: message.content, images: [] };
  }, [message.content]);

  const normalizedImageUrl = normalizeImageUrl(message.imageUrl);
  const base64ImageSrc = message.imageBase64 ? `data:image/png;base64,${message.imageBase64}` : "";
  // 图片加载失败时降级到 base64；没有 base64 时保留可点击链接，避免静默只剩文本。
  const imageSrc = (!imgError && normalizedImageUrl) || base64ImageSrc;
  const downloadSrc = normalizedImageUrl || base64ImageSrc;
  const hasImage = Boolean(normalizedImageUrl || base64ImageSrc);
  const shouldCollapseUserMessage = isUser && parsedContent.text.length > USER_MESSAGE_COLLAPSE_LIMIT;
  const isUserMessageCollapsed = shouldCollapseUserMessage && !isUserMessageExpanded;

  useEffect(() => {
    setIsUserMessageExpanded(false);
  }, [message.id, message.content]);

  useEffect(() => {
    setImgError(false);
  }, [normalizedImageUrl, base64ImageSrc]);

  const handleEditSubmit = () => {
    const trimmed = editContent.trim();
    if (trimmed && onEdit) {
      onEdit(message.id, trimmed);
      setIsEditing(false);
    }
  };

  const handleCopy = () => {
    if (onCopy) {
      onCopy(parsedContent.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isUser) {
    return (
      <div className="group flex animate-fade-in-up justify-end">
        <div className="relative max-w-[82%]">
          {!isEditing ? (
            <>
              <div className="rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 text-[15px] leading-7 text-ink">
                {parsedContent.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {parsedContent.images.map((img, idx) => (
                      <MessageImageThumb key={`${img}-${idx}`} src={img} alt={`上传图片${idx + 1}`} onPreviewImage={onPreviewImage} />
                    ))}
                  </div>
                )}
                <div className="relative">
                  <div className={`prose-chat whitespace-pre-wrap break-words ${isUserMessageCollapsed ? "max-h-44 overflow-hidden" : ""}`}>
                    {parsedContent.text}
                  </div>
                  {isUserMessageCollapsed ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-bubble via-bubble/90 to-transparent" />
                  ) : null}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                {shouldCollapseUserMessage ? (
                  <button
                    type="button"
                    onClick={() => setIsUserMessageExpanded((expanded) => !expanded)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                  >
                    <span>{isUserMessageExpanded ? "Show less" : "Show more"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isUserMessageExpanded ? "rotate-180" : ""}`} />
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center justify-end gap-1 group-hover-show">
                  {!message.pending && onEdit ? (
                    <button
                      onClick={() => {
                        setEditContent(parsedContent.text);
                        setIsEditing(true);
                      }}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
                      title="编辑"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {!message.pending && onCopy ? (
                    <button
                      onClick={handleCopy}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
                      title={copied ? "已复制" : "复制"}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="w-[min(42rem,82vw)] max-w-full rounded-2xl border-2 border-accent/40 bg-card p-3">
              <textarea
                className="min-h-32 w-full resize-y border-0 bg-transparent text-[15px] leading-7 text-ink outline-none"
                rows={5}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleEditSubmit();
                  }
                  if (e.key === "Escape") {
                    setIsEditing(false);
                  }
                }}
                autoFocus
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleEditSubmit}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition hover:bg-accent/90"
                >
                  发送
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:bg-ink/[0.04]"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-fade-in-up gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {message.modelName ? (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent/60" />
            {message.modelName}
          </p>
        ) : null}
        {hasImage ? (
          <div className="mb-3 space-y-2">
            {imageSrc ? (
              <button
                type="button"
                onClick={() => onPreviewImage?.({ src: imageSrc, downloadSrc, alt: message.content || "generated image" })}
                className="block max-w-full rounded-2xl border border-line bg-card text-left transition hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                title="查看大图"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="max-h-[32rem] max-w-full rounded-2xl object-contain"
                  src={imageSrc}
                  alt={message.content || "generated image"}
                  onError={() => setImgError(true)}
                />
              </button>
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-card/70 px-4 py-3 text-sm text-muted">
                图片已生成，但当前页面未能加载预览。
              </div>
            )}
            {downloadSrc ? (
              <a
                className="inline-flex rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink/80 transition hover:bg-ink/[0.04]"
                href={downloadSrc}
                download="generated-image.png"
                target="_blank"
                rel="noopener noreferrer"
              >
                {imageSrc ? "下载图片" : "打开图片"}
              </a>
            ) : null}
          </div>
        ) : null}
        {message.content ? (
          <div className="prose-chat text-[15px] leading-7 text-ink/90">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
                  const { className, children } = props;
                  const content = String(children).replace(/\n$/, "");
                  // @ts-expect-error - inline is a custom prop from react-markdown
                  const inline = props.inline;

                  // 明确判断是否为内联代码
                  if (inline || !content.includes('\n')) {
                    return (
                      <code className={className}>
                        {children}
                      </code>
                    );
                  }

                  // 多行代码块
                  return <CodeBlock className={className}>{content}</CodeBlock>;
                },
                p(props) {
                  const { children } = props;
                  const node = props.node;
                  // 检查子元素中是否包含代码块，如果是则不使用 <p> 包裹
                  const hasCodeBlock = node?.children?.some(
                    (child) =>
                      child.type === 'element' &&
                      child.tagName === 'code' &&
                      child.properties?.className
                  );

                  if (hasCodeBlock) {
                    return <div className="my-2">{children}</div>;
                  }

                  return <p>{children}</p>;
                },
                table({ children }) {
                  return (
                    <div className="my-4 overflow-x-auto">
                      <table>{children}</table>
                    </div>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : null}
        {message.pending && !message.content ? (
          <span className="inline-flex items-center gap-2 text-muted">
            <span className="inline-block h-2 w-2 animate-blink rounded-full bg-accent/70" />
            正在思考...
          </span>
        ) : null}
        {!message.pending && message.content ? (
          <div className="mt-2 flex items-center gap-1">
            {onCopy ? (
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-ink/[0.04] hover:text-ink"
                title={copied ? "已复制" : "复制"}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>复制</span>
                  </>
                )}
              </button>
            ) : null}
            {onRegenerate ? (
              <button
                onClick={() => onRegenerate(message.id)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-ink/[0.04] hover:text-ink"
                title="重新生成"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                <span>重新生成</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function ChatClient({ username, role }: { username: string; role: string }) {
  const [models, setModels] = useState<PublicModel[]>([]);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [convCursor, setConvCursor] = useState<string | null>(null);
  const [convHasMore, setConvHasMore] = useState(false);
  const [loadingMoreConv, setLoadingMoreConv] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showInputMenu, setShowInputMenu] = useState(false);
  // 是否停留在消息列表底部：流式输出时只有停在底部才自动跟随滚动
  const [isAtBottom, setIsAtBottom] = useState(true);
  // 右侧消息导航当前所处的提问序号
  const [activeNavIndex, setActiveNavIndex] = useState(0);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // isAtBottom 的 ref 镜像，供流式回调、effect 读取，避免依赖 state 造成闭包过期
  const isAtBottomRef = useRef(true);
  // 点击导航跳转的平滑滚动进行中：短暂屏蔽底部跟随判定，避免流式输出把视图拉回底部
  const navJumpingRef = useRef(false);
  const navJumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 始终指向最新的 messages / sendChatMessage，让编辑、重新生成等回调保持稳定引用，
  // 配合 MessageBubble 的 memo 避免流式期间全列表重渲染
  const messagesRef = useRef<LocalMessage[]>([]);
  messagesRef.current = messages;
  const sendChatMessageRef = useRef<((prompt: string, options?: SendMessageOptions) => Promise<void>) | null>(null);
  const sendImageMessageRef = useRef<((prompt: string, options?: SendMessageOptions) => Promise<void>) | null>(null);
  // 重新生成需判断当前模型类型，用 ref 读取最新值，避免把 models/selectedModelId
  // 加进回调依赖而破坏 MessageBubble 的稳定引用约定
  const selectedModelRef = useRef<PublicModel | null>(null);

  const isAdmin = role === "ADMIN";

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId) || null, [models, selectedModelId]);
  selectedModelRef.current = selectedModel;
  const modelsByProvider = useMemo(() => groupedModels(models), [models]);

  const loadModels = useCallback(async () => {
    const response = await fetch("/api/models", { cache: "no-store" });

    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("登录状态已失效，请重新登录。");
    }

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const payload = await response.json();
    const nextModels = (payload.models || []) as PublicModel[];
    setModels(nextModels);
    setModelsError("");
    setSelectedModelId((currentModelId) => (nextModels.some((model) => model.id === currentModelId) ? currentModelId : nextModels[0]?.id || ""));
  }, []);

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const payload = await response.json();
    setConversations(payload.conversations || []);
    setConvCursor(payload.nextCursor ?? null);
    setConvHasMore(Boolean(payload.hasMore));
  }, []);

  const loadMoreConversations = useCallback(async () => {
    if (!convCursor || loadingMoreConv) {
      return;
    }

    setLoadingMoreConv(true);

    try {
      const response = await fetch(`/api/conversations?cursor=${encodeURIComponent(convCursor)}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = await response.json();
      const more: ConversationDto[] = payload.conversations || [];
      // 去重合并，避免游标边界出现重复项
      setConversations((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...more.filter((c) => !seen.has(c.id))];
      });
      setConvCursor(payload.nextCursor ?? null);
      setConvHasMore(Boolean(payload.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载更多会话失败。");
    } finally {
      setLoadingMoreConv(false);
    }
  }, [convCursor, loadingMoreConv]);

  const loadCredits = useCallback(async () => {
    try {
      const response = await fetch("/api/user/credits", { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setCredits(data.credits);
    } catch (err) {
      console.error("加载积分失败:", err);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const response = await fetch("/api/agents", { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setAgents(data.agents || []);
    } catch (err) {
      console.error("加载 Agent 失败:", err);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadModels(), loadConversations(), loadCredits(), loadAgents()]).catch((loadError) => {
      const message = loadError instanceof Error ? loadError.message : "初始化失败。";
      setError(message);
      setModelsError(message);
    });
  }, [loadModels, loadConversations, loadCredits, loadAgents]);

  useEffect(() => {
    // 只有用户停留在底部时才自动跟随最新消息，向上翻看时不打断阅读
    if (isAtBottomRef.current) {
      scrollElementIntoView(bottomRef.current);
    }
  }, [messages]);

  const userMessages = useMemo(() => messages.filter((message) => message.role === "user"), [messages]);

  // 滚动时更新"是否在底部"，并计算右侧导航当前所处的提问位置
  const handleMessagesScroll = useCallback(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    if (!navJumpingRef.current) {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      isAtBottomRef.current = nearBottom;
      setIsAtBottom(nearBottom);
    }

    const currentUserMessages = messagesRef.current.filter((message) => message.role === "user");

    if (currentUserMessages.length < 2) {
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + container.clientHeight * 0.35;
    let currentIndex = 0;

    for (let index = 0; index < currentUserMessages.length; index += 1) {
      const element = document.getElementById(`chat-msg-${currentUserMessages[index].id}`);

      if (!element) {
        continue;
      }

      if (element.getBoundingClientRect().top <= threshold) {
        currentIndex = index;
      } else {
        break;
      }
    }

    setActiveNavIndex(currentIndex);
  }, []);

  const jumpToUserMessage = useCallback((messageId: string) => {
    const target = document.getElementById(`chat-msg-${messageId}`);

    if (!target) {
      return;
    }

    isAtBottomRef.current = false;
    setIsAtBottom(false);
    navJumpingRef.current = true;

    if (navJumpTimerRef.current) {
      clearTimeout(navJumpTimerRef.current);
    }

    navJumpTimerRef.current = setTimeout(() => {
      navJumpingRef.current = false;
    }, 800);

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const jumpToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (!imagePreview?.isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImagePreview((currentPreview) => (currentPreview ? { ...currentPreview, isOpen: false } : currentPreview));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagePreview?.isOpen]);

  const resizeInputTextarea = useCallback((element?: HTMLTextAreaElement | null) => {
    const textarea = element ?? inputRef.current;

    if (!textarea) {
      return;
    }

    const maxHeight = 176;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeInputTextarea();
  }, [input, messages.length, resizeInputTextarea]);

  const openImagePreview = useCallback((preview: ImagePreviewPayload) => {
    setImagePreview((currentPreview) => {
      if (currentPreview?.src === preview.src) {
        return { ...currentPreview, ...preview, isOpen: true };
      }

      return { ...preview, isOpen: true };
    });
  }, []);

  const closeImagePreview = useCallback(() => {
    setImagePreview((currentPreview) => (currentPreview ? { ...currentPreview, isOpen: false } : currentPreview));
  }, []);

  async function loadConversation(conversationId: string) {
    setError("");
    setStatus("正在加载会话...");

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = await response.json();
      const conversation = payload.conversation as ConversationDto;
      setActiveConversationId(conversation.id);
      // 切换会话时总是定位到最新消息
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setMessages((conversation.messages || []) as LocalMessage[]);

      if (conversation.modelId) {
        setSelectedModelId(conversation.modelId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载会话失败。");
    } finally {
      setStatus("");
    }
  }

  function newConversation() {
    abortRef.current?.abort();
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setError("");
    setAttachments([]);
  }

  // 图片附件先上传落盘，消息中只引用相对 URL，
  // 避免 base64 撑大消息体并随上下文每轮重发给上游
  const uploadImageFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads", { method: "POST", body: formData });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const data = await response.json();
    return data.url as string;
  }, []);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        setError(`文件 ${file.name} 超过 5MB 限制`);
        continue;
      }

      const isImage = file.type.startsWith("image/");
      const isText = file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md");

      if (!isImage && !isText) {
        setError(`文件 ${file.name} 格式不支持，仅支持文本和图片`);
        continue;
      }

      try {
        const content = isImage
          ? await uploadImageFile(file)
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsText(file);
            });

        setAttachments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            type: isImage ? "image" : "text",
            content,
            size: file.size,
            preview: isImage ? content : undefined
          }
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : `读取文件 ${file.name} 失败`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > 5 * 1024 * 1024) {
          setError("粘贴的图片超过 5MB 限制");
          continue;
        }

        try {
          const content = await uploadImageFile(file);

          setAttachments((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random()}`,
              name: `粘贴图片-${new Date().toLocaleTimeString()}`,
              type: "image",
              content,
              size: file.size,
              preview: content
            }
          ]);
        } catch (err) {
          setError(err instanceof Error ? err.message : "读取粘贴图片失败");
        }
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const saveAgent = async (agent: Agent) => {
    const isEditing = agents.some((a) => a.id === agent.id);

    try {
      if (isEditing) {
        const response = await fetch(`/api/agents/${agent.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: agent.name, prompt: agent.prompt })
        });

        if (!response.ok) {
          const error = await readError(response);
          setError(error);
          return;
        }

        const data = await response.json();
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? data.agent : a)));
      } else {
        if (agents.length >= 10) {
          setError("最多只能添加 10 个 Agent");
          return;
        }

        const response = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: agent.name, prompt: agent.prompt })
        });

        if (!response.ok) {
          const error = await readError(response);
          setError(error);
          return;
        }

        const data = await response.json();
        setAgents((prev) => [...prev, data.agent]);
      }
      setEditingAgent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };


  const deleteAgent = async (id: string) => {
    const confirmed = await confirm({
      title: "删除 Agent",
      description: "确定要删除这个 Agent 吗？",
      confirmText: "删除",
      tone: "danger"
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/agents/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const error = await readError(response);
        setError(error);
        return;
      }

      setAgents((prev) => prev.filter((a) => a.id !== id));
      if (selectedAgentId === id) {
        setSelectedAgentId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  async function deleteConversation(conversationId: string) {
    const confirmed = await confirm({
      title: "删除会话",
      description: "该会话的所有消息将被永久删除，无法恢复。",
      confirmText: "删除",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });

    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    if (activeConversationId === conversationId) {
      newConversation();
    }

    await loadConversations();
  }

  function applyStreamEvent(streamEvent: StreamEvent, assistantMessageId: string) {
    if (streamEvent.eventName === "meta") {
      setActiveConversationId(typeof streamEvent.data.conversationId === "string" ? streamEvent.data.conversationId : null);
      const modelName = typeof streamEvent.data.modelName === "string" ? streamEvent.data.modelName : null;

      if (modelName) {
        setMessages((currentMessages) => currentMessages.map((message) => (message.id === assistantMessageId ? { ...message, modelName } : message)));
      }
    }

    if (streamEvent.eventName === "done") {
      const messageId = typeof streamEvent.data.messageId === "string" ? streamEvent.data.messageId : assistantMessageId;
      const content = typeof streamEvent.data.content === "string" ? streamEvent.data.content : undefined;
      const modelName = typeof streamEvent.data.modelName === "string" ? streamEvent.data.modelName : undefined;
      setMessages((currentMessages) =>
        currentMessages.map((message) => (message.id === assistantMessageId ? { ...message, id: messageId, content: content || message.content, modelName: modelName ?? message.modelName, pending: false } : message))
      );
    }

    if (streamEvent.eventName === "error") {
      throw new Error(typeof streamEvent.data.message === "string" ? streamEvent.data.message : "模型调用失败。");
    }
  }

  async function sendChatMessage(prompt: string, options: SendMessageOptions = {}) {
    const { skipAddingUserMessage = false, regenerateMessageId } = options;
    let messageContent: string | { type: string; text?: string; image_url?: { url: string } }[] = prompt;
    let systemPrompt = "";

    // 如果有Agent，获取系统提示词
    if (selectedAgentId) {
      const agent = agents.find((a) => a.id === selectedAgentId);
      if (agent) {
        systemPrompt = agent.prompt;
      }
    }

    // 如果有附件，使用OpenAI vision格式
    if (attachments.length > 0) {
      const contentParts: { type: string; text?: string; image_url?: { url: string } }[] = [];

      // 添加文本内容
      for (const att of attachments) {
        if (att.type === "text") {
          contentParts.push({
            type: "text",
            text: `[文件: ${att.name}]\n${att.content}`
          });
        }
      }

      // 添加用户文本
      contentParts.push({
        type: "text",
        text: prompt
      });

      // 添加图片
      for (const att of attachments) {
        if (att.type === "image") {
          contentParts.push({
            type: "image_url",
            image_url: {
              url: att.content
            }
          });
        }
      }

      messageContent = contentParts;
    }

    // 创建本地显示的用户消息
    const displayContent = typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent);
    const outgoingModelName = selectedModel?.name || null;
    const userMessage = localMessage("user", displayContent, outgoingModelName);
    const assistantMessage = localMessage("assistant", "", outgoingModelName);
    const controller = new AbortController();
    abortRef.current = controller;

    // SSE delta 节流合并：每 80ms 批量应用一次，
    // 避免每个 token 都触发一次消息列表更新与 Markdown 重解析
    let deltaBuffer = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushDelta = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      if (!deltaBuffer) {
        return;
      }

      const chunk = deltaBuffer;
      deltaBuffer = "";
      setMessages((currentMessages) => currentMessages.map((message) => (message.id === assistantMessage.id ? { ...message, content: `${message.content}${chunk}` } : message)));
    };

    const queueDelta = (delta: string) => {
      deltaBuffer += delta;

      if (!flushTimer) {
        flushTimer = setTimeout(flushDelta, 80);
      }
    };

    // 发送新消息时回到底部跟随输出
    isAtBottomRef.current = true;
    setIsAtBottom(true);

    if (skipAddingUserMessage) {
      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
    } else {
      setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    }

    setInput("");
    setAttachments([]);
    setError("");
    setStatus("正在连接模型...");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          modelId: selectedModelId,
          content: messageContent,
          systemPrompt: systemPrompt || undefined,
          regenerateMessageId
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(await readError(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      setStatus("正在生成回复...");

      while (!done) {
        const result = await reader.read();
        done = result.done;
        buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const streamEvent = parseStreamEvent(block);

          if (!streamEvent) {
            continue;
          }

          if (streamEvent.eventName === "delta") {
            queueDelta(typeof streamEvent.data.content === "string" ? streamEvent.data.content : "");
          } else {
            // done/error 前先冲刷缓冲，保证内容顺序正确
            flushDelta();
            applyStreamEvent(streamEvent, assistantMessage.id);
          }
        }
      }

      flushDelta();
      setMessages((currentMessages) => currentMessages.map((message) => (message.id === assistantMessage.id ? { ...message, pending: false } : message)));
      await loadConversations();
    } catch (chatError) {
      flushDelta();
      const aborted = controller.signal.aborted;
      const errorMessage = aborted ? "已停止生成。" : chatError instanceof Error ? chatError.message : "发送失败。";
      const assistantFallback = aborted ? errorMessage : "请求失败，错误详情已在下方显示。";
      setError(errorMessage);
      setMessages((currentMessages) => currentMessages.map((message) => (message.id === assistantMessage.id ? { ...message, content: message.content || assistantFallback, pending: false } : message)));
    } finally {
      setStatus("");
      setIsStreaming(false);
      abortRef.current = null;
      loadCredits(); // 刷新积分
      // 将用户消息标记为已发送
      setMessages((currentMessages) => currentMessages.map((message) => (message.id === userMessage.id ? { ...message, pending: false } : message)));
    }
  }

  // 通过 ref 暴露最新的 sendChatMessage / sendImageMessage，供下方稳定回调调用
  sendChatMessageRef.current = sendChatMessage;
  sendImageMessageRef.current = sendImageMessage;

  // 以下回调读取 messagesRef / sendChatMessageRef，引用永远稳定，
  // 使 MessageBubble 的 memo 在流式期间能跳过未变化消息的重渲染
  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    // 找到该消息的索引
    const messageIndex = messagesRef.current.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1) return;

    const currentModel = selectedModelRef.current;
    if (!currentModel) {
      setError(isAdmin ? "请先在后台添加并启用模型。" : "暂无可用模型，请联系管理员。");
      return;
    }

    // 删除该消息及之后的所有消息
    setMessages((currentMessages) => currentMessages.slice(0, messageIndex));

    // 以新内容重新发送。图片模型必须继续走生图接口，避免误发到文本流式接口。
    if (isImageGenerationModel(currentModel)) {
      await sendImageMessageRef.current?.(newContent);
    } else {
      await sendChatMessageRef.current?.(newContent);
    }
  }, [isAdmin]);

  const handleRegenerateMessage = useCallback(async (messageId: string) => {
    const currentMessages = messagesRef.current;
    // 找到该 AI 消息的索引
    const messageIndex = currentMessages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    // 找到上一条用户消息
    const previousUserMessage = currentMessages
      .slice(0, messageIndex)
      .reverse()
      .find((msg) => msg.role === "user");

    if (!previousUserMessage) return;

    // 删除当前 AI 消息及之后的所有消息（保留上一条用户消息）
    setMessages((current) => current.slice(0, messageIndex));

    // 图片会话需走生图接口（文本流式接口会拒绝图片模型）；
    // 文本会话用上一条用户消息重新生成，跳过重复添加用户消息。
    // 通过 ref 读取当前模型，保持回调引用稳定，不破坏 MessageBubble 的 memo
    if (isImageGenerationModel(selectedModelRef.current)) {
      await sendImageMessageRef.current?.(previousUserMessage.content, {
        skipAddingUserMessage: true,
        regenerateMessageId: messageId
      });
    } else {
      await sendChatMessageRef.current?.(previousUserMessage.content, {
        skipAddingUserMessage: true,
        regenerateMessageId: messageId
      });
    }
  }, []);

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {
      setError("复制失败，请手动选择复制。");
    });
  }, []);

  async function sendImageMessage(prompt: string, options: SendMessageOptions = {}) {
    const { skipAddingUserMessage = false, regenerateMessageId } = options;
    const outgoingModelName = selectedModel?.name || null;
    const userMessage = localMessage("user", prompt, outgoingModelName);
    const assistantMessage = localMessage("assistant", "正在生成图片...", outgoingModelName);
    const controller = new AbortController();
    abortRef.current = controller;

    // 发送新消息时回到底部跟随输出
    isAtBottomRef.current = true;
    setIsAtBottom(true);

    // 重新生成时（skipAddingUserMessage）列表里已保留上一条用户消息，
    // 只追加助手占位，避免用户消息重复
    if (skipAddingUserMessage) {
      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
    } else {
      setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    }
    setInput("");
    setAttachments([]);
    setError("");
    setStatus("正在生成图片...");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          modelId: selectedModelId,
          prompt,
          regenerateMessageId
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(await readError(response));
      }

      // 生图接口改为 SSE 流式：等待期间持续心跳保活，避免 Cloudflare 100s 回源超时（524）。
      // 这里解析 meta（占位会话）与 done（最终消息）事件，done 才携带落地后的图片消息。
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;
        buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const streamEvent = parseStreamEvent(block);

          if (!streamEvent) {
            continue;
          }

          if (streamEvent.eventName === "meta") {
            setActiveConversationId(typeof streamEvent.data.conversationId === "string" ? streamEvent.data.conversationId : null);
            const modelName = typeof streamEvent.data.modelName === "string" ? streamEvent.data.modelName : null;

            if (modelName) {
              setMessages((currentMessages) => currentMessages.map((message) => (message.id === assistantMessage.id ? { ...message, modelName } : message)));
            }
          } else if (streamEvent.eventName === "error") {
            throw new Error(typeof streamEvent.data.message === "string" ? streamEvent.data.message : "图片生成失败。");
          } else if (streamEvent.eventName === "done") {
            const payload = streamEvent.data as { conversation?: { id?: string }; messages?: LocalMessage[] };
            setActiveConversationId(payload.conversation?.id || null);
            const serverMessages = payload.messages || [];

            if (skipAddingUserMessage) {
              // 重新生成：列表里已保留上一条用户消息，只用服务器返回的助手消息替换占位，
              // 不再插入服务器新建的用户消息，避免出现重复的用户气泡
              const assistantFromServer = serverMessages.find((message) => message.role === "assistant");
              setMessages((currentMessages) =>
                currentMessages
                  .filter((message) => message.id !== userMessage.id)
                  .map((message) => (message.id === assistantMessage.id && assistantFromServer ? assistantFromServer : message))
              );
            } else {
              setMessages((currentMessages) => [...currentMessages.filter((message) => message.id !== userMessage.id && message.id !== assistantMessage.id), ...serverMessages]);
            }
          }
        }
      }

      await loadConversations();
    } catch (imageError) {
      const errorMessage = controller.signal.aborted ? "已停止生成。" : imageError instanceof Error ? imageError.message : "图片生成失败。";
      const assistantFallback = controller.signal.aborted ? errorMessage : "图片生成失败，错误详情已在下方显示。";
      setError(errorMessage);
      setMessages((currentMessages) => currentMessages.map((message) => (message.id === assistantMessage.id ? { ...message, content: assistantFallback, pending: false } : message)));
    } finally {
      setStatus("");
      setIsStreaming(false);
      abortRef.current = null;
      loadCredits(); // 刷新积分
      // 复位用户消息的 pending：否则生图失败（如超时）后用户消息会永久停留在
      // pending 状态，导致其编辑/复制按钮（渲染条件含 !pending）一直不显示
      setMessages((currentMessages) => currentMessages.map((message) => (message.id === userMessage.id ? { ...message, pending: false } : message)));
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();

    if (!prompt || isStreaming) {
      return;
    }

    if (!selectedModel) {
      setError(isAdmin ? "请先在后台添加并启用模型。" : "暂无可用模型，请联系管理员。");
      return;
    }

    if (isImageGenerationModel(selectedModel)) {
      await sendImageMessage(prompt);
      return;
    }

    await sendChatMessage(prompt);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className={`grid h-screen overflow-hidden bg-canvas text-ink transition-[grid-template-columns] duration-300 ${sidebarCollapsed ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]" : "lg:grid-cols-[17.5rem_minmax(0,1fr)]"}`}>
      {/* 全局文件输入 */}
      <input ref={fileInputRef} type="file" multiple accept="text/*,image/*" onChange={handleFileSelect} className="hidden" />

      {/* 移动端遮罩 */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex min-h-0 w-72 flex-col border-r border-line/70 bg-sidebar transition-transform duration-300 lg:static lg:z-auto lg:w-auto ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} lg:flex`}>
        <div className={`flex h-14 items-center px-3 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2 pl-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-display text-[17px] font-semibold tracking-tight text-ink">Light Chat</span>
            </div>
          ) : null}
          <button
            className="hidden h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink lg:flex"
            title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink lg:hidden"
            title="关闭侧边栏"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <PanelLeftClose className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="px-3 pb-1 pt-1">
          <button
            className={`group flex w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-medium text-ink shadow-sm transition-all hover:border-accent/40 hover:bg-accent/[0.05] active:scale-[0.99] ${sidebarCollapsed ? "justify-center px-0" : ""}`}
            onClick={newConversation}
            title="新建会话"
          >
            <Plus className="h-4 w-4 text-accent transition-transform group-hover:rotate-90" />
            {!sidebarCollapsed ? <span>新建会话</span> : null}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {conversations.length === 0 ? <p className="px-3 py-2 text-sm text-muted">暂无历史会话</p> : null}
            <div className="space-y-0.5">
              {conversations.map((conversation) => {
                const active = activeConversationId === conversation.id;

                return (
                  <div key={conversation.id} className={`group relative rounded-xl transition-colors ${active ? "bg-accent/10" : "hover:bg-ink/[0.04]"}`}>
                    <button className="block w-full px-3 py-2 pr-9 text-left" onClick={() => loadConversation(conversation.id)}>
                      <span className={`block truncate text-sm ${active ? "font-medium text-ink" : "text-ink/90"}`}>{conversation.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {formatDateShort(conversation.createdAt)} · {conversation.modelName || "未选择模型"}
                      </span>
                    </button>
                    <button
                      className="group-hover-show absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:bg-ink/[0.06] hover:text-red-500"
                      title="删除会话"
                      onClick={() => deleteConversation(conversation.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {convHasMore ? (
              <button
                className="mt-1 w-full rounded-xl px-3 py-2 text-center text-sm text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:opacity-60"
                onClick={loadMoreConversations}
                disabled={loadingMoreConv}
              >
                {loadingMoreConv ? "加载中..." : "加载更多"}
              </button>
            ) : null}
          </div>
        )}

        <div className="p-3">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-1">
              <Link className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink" href={isAdmin ? "/admin" : "/profile"} title={isAdmin ? "后台" : "个人中心"}>
                <Settings className="h-[18px] w-[18px]" />
              </Link>
              <ThemeToggle compact />
              <button className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink" onClick={logout} title="退出登录">
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl px-2 py-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                {(username[0] || "U").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{username}</p>
                <p className="text-xs text-muted">{isAdmin ? "管理员" : "用户"}</p>
              </div>
              <Link className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink" href={isAdmin ? "/admin" : "/profile"} title={isAdmin ? "后台" : "个人中心"}>
                <Settings className="h-[17px] w-[17px]" />
              </Link>
              <ThemeToggle compact className="!h-8 !w-8 shrink-0" />
              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-red-500" onClick={logout} title="退出登录">
                <LogOut className="h-[17px] w-[17px]" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col bg-canvas">
        <header className="sticky top-0 z-10 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-3 px-3 py-2.5 sm:px-4">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink lg:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              title="打开侧边栏"
            >
              <MessageSquare className="h-[18px] w-[18px]" />
            </button>
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <select
                className="w-full cursor-pointer appearance-none truncate rounded-xl border border-line bg-card py-2 pl-3.5 pr-9 text-sm font-medium text-ink outline-none transition hover:bg-ink/[0.02] focus:border-accent/60 focus:ring-4 focus:ring-accent/10 dark:bg-card"
                value={selectedModelId}
                onChange={(event) => setSelectedModelId(event.target.value)}
              >
                {models.length === 0 ? <option value="">暂无可用模型</option> : null}
                {modelsByProvider.map((group) => (
                  <optgroup key={group.providerId} label={group.providerName}>
                    {group.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} · {model.type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>
            {credits !== null && (
              <Link
                href="/profile"
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-medium text-ink/80 transition hover:bg-ink/[0.04]"
                title="个人中心"
              >
                <Coins className="h-4 w-4" />
                <span className="font-mono">{credits}</span>
              </Link>
            )}
            <button
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-medium text-ink/80 transition hover:bg-ink/[0.04] lg:hidden"
              onClick={newConversation}
              title="新建会话"
            >
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">新会话</span>
            </button>
          </div>
        </header>

        {messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-3 py-6 sm:px-4">
            <div className="mx-auto w-full max-w-3xl -mt-16">
              {models.length === 0 ? (
                <div className="mb-6 rounded-2xl border border-dashed border-line bg-card/60 px-4 py-3 text-sm text-muted">
                  {modelsError ? (
                    <span>模型加载失败：{modelsError}。请确认手机端已登录，并且访问的是与电脑端相同的域名。</span>
                  ) : (
                    <span>
                      {isAdmin ? (
                        <>
                          暂无可用模型。请先进入{" "}
                          <Link className="font-medium text-accent underline underline-offset-2" href="/admin">
                            后台
                          </Link>{" "}
                          添加服务商，并点击&ldquo;查询导入&rdquo;。
                        </>
                      ) : (
                        "暂无可用模型。请联系管理员分配模型权限。"
                      )}
                    </span>
                  )}
                </div>
              ) : null}

              <div className="mb-8 animate-fade-in text-center">
                <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-sm">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="font-display text-[28px] font-semibold tracking-tight text-ink">你好，{username}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">今天想聊点什么？选择模型后开始对话，图片模型会直接返回可预览图片。</p>
              </div>

              {(status || error) && (
                <div className="mb-4">
                  <ChatStatusMessages status={status} error={error} onDismissError={() => setError("")} />
                </div>
              )}

              {attachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div key={att.id} className="relative flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                      {att.type === "image" && att.preview ? (
                        <img src={normalizeImageUrl(att.preview)} alt={att.name} className="h-12 w-12 rounded object-cover" />
                      ) : att.type === "image" ? (
                        <ImageIcon className="h-4 w-4 text-muted" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted" />
                      )}
                      <span className="max-w-[150px] truncate text-ink/80">{att.name}</span>
                      <button onClick={() => removeAttachment(att.id)} className="text-muted hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form
                className="flex items-end gap-2 rounded-3xl border border-line bg-card p-2 pl-4 shadow-soft transition-all focus-within:border-accent/50 focus-within:shadow-lift"
                onSubmit={submitMessage}
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowInputMenu(!showInputMenu)}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${selectedAgentId ? "bg-accent/10 text-accent hover:bg-accent/20" : "text-muted hover:bg-ink/[0.05] hover:text-ink"}`}
                    title={selectedAgentId ? `当前: ${agents.find(a => a.id === selectedAgentId)?.name}` : "添加"}
                  >
                    {selectedAgentId ? <Bot className="h-[18px] w-[18px]" /> : <Plus className="h-[18px] w-[18px]" />}
                  </button>
                  {showInputMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowInputMenu(false)} />
                      <div className="absolute bottom-full left-0 z-20 mb-2 w-48 rounded-xl border border-line bg-card shadow-lg">
                        <button
                          type="button"
                          onClick={() => { fileInputRef.current?.click(); setShowInputMenu(false); }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink transition hover:bg-ink/[0.04]"
                        >
                          <Paperclip className="h-4 w-4 text-muted" />
                          <span>添加文件</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingAgent(null); setShowAgentDialog(true); setShowInputMenu(false); }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink transition hover:bg-ink/[0.04]"
                        >
                          <Bot className="h-4 w-4 text-muted" />
                          <span>{selectedAgentId ? "切换 Agent" : "选择 Agent"}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <textarea
                  ref={inputRef}
                  className="max-h-44 min-h-[44px] flex-1 resize-none border-0 bg-transparent py-2.5 text-[15px] leading-7 text-ink outline-none placeholder:text-muted/70 focus:ring-0"
                  disabled={models.length === 0}
                  placeholder={selectedModel?.type === "image" ? "输入图片提示词..." : "输入消息，Enter 发送，Shift + Enter 换行..."}
                  rows={1}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    resizeInputTextarea(event.currentTarget);
                  }}
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      const form = event.currentTarget.form;
                      form?.requestSubmit();
                    }
                  }}
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    title="停止生成"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink/70 transition hover:bg-ink/[0.05] active:scale-95"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || !selectedModelId || models.length === 0}
                    title="发送"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-sm transition-all hover:bg-accent/90 hover:shadow active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <Send className="h-[18px] w-[18px]" />
                  </button>
                )}
              </form>
              <p className="mt-3 text-center text-xs text-muted/80">内容由 AI 生成，请自行核实重要信息。</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative min-h-0 flex-1">
              <div ref={scrollContainerRef} onScroll={handleMessagesScroll} className="h-full overflow-y-auto px-3 py-6 sm:px-4">
                <div className="mx-auto w-full max-w-3xl">
                  {models.length === 0 ? (
                    <div className="mb-4 rounded-2xl border border-dashed border-line bg-card/60 px-4 py-3 text-sm text-muted">
                      {modelsError ? (
                        <span>模型加载失败：{modelsError}。请确认手机端已登录，并且访问的是与电脑端相同的域名。</span>
                      ) : (
                        <span>
                          {isAdmin ? (
                            <>
                              暂无可用模型。请先进入{" "}
                              <Link className="font-medium text-accent underline underline-offset-2" href="/admin">
                                后台
                              </Link>{" "}
                              添加服务商，并点击&ldquo;查询导入&rdquo;。
                            </>
                          ) : (
                            "暂无可用模型。请联系管理员分配模型权限。"
                          )}
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="space-y-6">
                    {messages.map((message) => (
                      <div key={message.id} id={`chat-msg-${message.id}`} className="scroll-mt-6">
                        <MessageBubble
                          message={message}
                          onEdit={message.role === "user" && !isStreaming ? handleEditMessage : undefined}
                          onRegenerate={message.role === "assistant" && !isStreaming ? handleRegenerateMessage : undefined}
                          onCopy={!isStreaming ? handleCopyMessage : undefined}
                          onPreviewImage={openImagePreview}
                        />
                      </div>
                    ))}
                  </div>
                  <div ref={bottomRef} className="h-4" />
                </div>
              </div>

              {/* 右侧消息导航：每条提问一个小横条，悬停预览内容，点击跳转 */}
              {userMessages.length >= 2 ? (
                <nav aria-label="会话消息导航" className="absolute right-2.5 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-end sm:flex">
                  {userMessages.map((message, index) => (
                    <button
                      key={message.id}
                      type="button"
                      aria-label={`跳转到第 ${index + 1} 条提问`}
                      className="group relative flex items-center justify-end py-1 focus-visible:outline-none"
                      onClick={() => jumpToUserMessage(message.id)}
                    >
                      <span className="pointer-events-none absolute right-full mr-2 hidden max-w-[18rem] truncate whitespace-nowrap rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-ink shadow-lift group-hover:block">
                        {extractMessageText(message.content).slice(0, 60) || "图片 / 附件消息"}
                      </span>
                      <span
                        className={`block h-1 rounded-full transition-all ${
                          index === activeNavIndex ? "w-7 bg-accent" : "w-4 bg-ink/20 group-hover:w-6 group-hover:bg-ink/50"
                        }`}
                      />
                    </button>
                  ))}
                </nav>
              ) : null}

              {/* 不在底部时显示回到底部按钮 */}
              {!isAtBottom ? (
                <button
                  type="button"
                  title="回到底部"
                  onClick={jumpToBottom}
                  className="absolute bottom-4 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-card text-muted shadow-lift transition hover:text-ink active:scale-95"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <footer className="bg-canvas px-3 pb-4 pt-1 sm:px-4">
              <div className="mx-auto w-full max-w-3xl">
                {(status || error) && (
                  <div className="mb-2">
                    <ChatStatusMessages status={status} error={error} onDismissError={() => setError("")} />
                  </div>
                )}

                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((att) => (
                      <div key={att.id} className="relative flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                        {att.type === "image" && att.preview ? (
                          <img src={normalizeImageUrl(att.preview)} alt={att.name} className="h-12 w-12 rounded object-cover" />
                        ) : att.type === "image" ? (
                          <ImageIcon className="h-4 w-4 text-muted" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted" />
                        )}
                        <span className="max-w-[150px] truncate text-ink/80">{att.name}</span>
                        <button onClick={() => removeAttachment(att.id)} className="text-muted hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  className="flex items-end gap-2 rounded-3xl border border-line bg-card p-2 pl-4 shadow-soft transition-all focus-within:border-accent/50 focus-within:shadow-lift"
                  onSubmit={submitMessage}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowInputMenu(!showInputMenu)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${selectedAgentId ? "bg-accent/10 text-accent hover:bg-accent/20" : "text-muted hover:bg-ink/[0.05] hover:text-ink"}`}
                      title={selectedAgentId ? `当前: ${agents.find(a => a.id === selectedAgentId)?.name}` : "添加"}
                    >
                      {selectedAgentId ? <Bot className="h-[18px] w-[18px]" /> : <Plus className="h-[18px] w-[18px]" />}
                    </button>
                    {showInputMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowInputMenu(false)} />
                        <div className="absolute bottom-full left-0 z-20 mb-2 w-48 rounded-xl border border-line bg-card shadow-lg">
                          <button
                            type="button"
                            onClick={() => { fileInputRef.current?.click(); setShowInputMenu(false); }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink transition hover:bg-ink/[0.04]"
                          >
                            <Paperclip className="h-4 w-4 text-muted" />
                            <span>添加文件</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingAgent(null); setShowAgentDialog(true); setShowInputMenu(false); }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink transition hover:bg-ink/[0.04]"
                          >
                            <Bot className="h-4 w-4 text-muted" />
                            <span>{selectedAgentId ? "切换 Agent" : "选择 Agent"}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <textarea
                    ref={inputRef}
                    className="max-h-44 min-h-[44px] flex-1 resize-none border-0 bg-transparent py-2.5 text-[15px] leading-7 text-ink outline-none placeholder:text-muted/70 focus:ring-0"
                    disabled={models.length === 0}
                    placeholder={selectedModel?.type === "image" ? "输入图片提示词..." : "输入消息，Enter 发送，Shift + Enter 换行..."}
                    rows={1}
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value);
                      resizeInputTextarea(event.currentTarget);
                    }}
                    onPaste={handlePaste}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        const form = event.currentTarget.form;
                        form?.requestSubmit();
                      }
                    }}
                  />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={() => abortRef.current?.abort()}
                      title="停止生成"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink/70 transition hover:bg-ink/[0.05] active:scale-95"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() || !selectedModelId || models.length === 0}
                      title="发送"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-sm transition-all hover:bg-accent/90 hover:shadow active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                    >
                      <Send className="h-[18px] w-[18px]" />
                    </button>
                  )}
                </form>
                <p className="mt-2 text-center text-xs text-muted/80">内容由 AI 生成，请自行核实重要信息。</p>
              </div>
            </footer>
          </>
        )}
      </section>
      {imagePreview ? <ImagePreviewOverlay preview={imagePreview} onClose={closeImagePreview} /> : null}
      {confirmDialog}
      {showAgentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm" onClick={() => setShowAgentDialog(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-line bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-xl font-semibold text-ink">管理 Agent</h3>

            <div className="mb-4 space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className={`flex items-center gap-3 rounded-lg border p-3 transition ${selectedAgentId === agent.id ? "border-accent bg-accent/5" : "border-line bg-canvas"}`}>
                  <button
                    onClick={() => setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)}
                    className="flex-1 text-left"
                    type="button"
                  >
                    <p className="font-medium text-ink">{agent.name}</p>
                    <p className="text-sm text-muted line-clamp-1">{agent.prompt}</p>
                  </button>
                  <button
                    onClick={() => { setEditingAgent(agent); }}
                    className="rounded-lg p-2 text-muted transition hover:bg-ink/[0.06] hover:text-ink"
                    title="编辑"
                    type="button"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteAgent(agent.id)}
                    className="rounded-lg p-2 text-muted transition hover:bg-ink/[0.06] hover:text-red-500"
                    title="删除"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {agents.length === 0 && (
                <p className="py-8 text-center text-sm text-muted">暂无 Agent，点击下方按钮添加</p>
              )}
            </div>

            {editingAgent && (
              <AgentForm
                agent={editingAgent}
                onSave={saveAgent}
                onCancel={() => setEditingAgent(null)}
              />
            )}

            {!editingAgent && (
              <button
                onClick={() => setEditingAgent({ id: `temp-${Date.now()}`, name: "", prompt: "" })}
                disabled={agents.length >= 10}
                className="w-full rounded-lg border border-dashed border-line bg-canvas px-4 py-2 text-sm font-medium text-ink/80 transition hover:bg-ink/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="inline h-4 w-4" /> 添加 Agent（{agents.length}/10）
              </button>
            )}

            <button
              onClick={() => setShowAgentDialog(false)}
              className="mt-4 w-full rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink transition hover:bg-accent/90"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function AgentForm({ agent, onSave, onCancel }: { agent: Agent; onSave: (agent: Agent) => void; onCancel: () => void }) {
  const [name, setName] = useState(agent.name);
  const [prompt, setPrompt] = useState(agent.prompt);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;
    onSave({ ...agent, name: name.trim(), prompt: prompt.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 space-y-3 rounded-lg border border-accent/40 bg-accent/[0.05] p-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">名称</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：代码审查助手"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
          maxLength={50}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">系统提示词</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例如：你是一个专业的代码审查助手，请帮我审查代码并提出改进建议..."
          className="w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
          rows={4}
          required
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent/90"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink/70 transition hover:bg-ink/[0.04]"
        >
          取消
        </button>
      </div>
    </form>
  );
}
