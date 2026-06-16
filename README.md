<div align="center">

# ✨ Light Chat

**轻量级 AI 聊天平台 | 开箱即用的多用户管理系统**

[![Next.js](https://img.shields.io/badge/Next.js-15.0-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[功能特性](#-核心特性) · [快速开始](#-快速开始) · [生产部署](#-生产部署standalone) · [配置详解](#️-配置详解) · [API 端点](#-api-端点)

</div>

---

## 🎯 项目简介

Light Chat 是一个**轻量级、生产可用**的 AI 聊天平台，专为需要**多用户管理、积分控制、权限管理**的场景设计。基于 Next.js 15（App Router）和 Prisma ORM，对接任意 OpenAI 兼容的服务商，易于部署和维护。

### 为什么选择 Light Chat？

- ✅ **轻量自包含** — SQLite 数据库（WAL 模式，并发读写不互锁），单机即可运行，备份只需复制文件
- ✅ **完整权限体系** — 用户级模型权限、积分系统、兑换码管理
- ✅ **生产级安全** — API Key 加密存储、Session 签名、越权防护、CSP、操作审计日志
- ✅ **现代化 UI** — 深色模式、流式输出、Markdown 渲染、自定义 Agent
- ✅ **灵活扩展** — 兼容任何 OpenAI 风格 API 服务商

---

## 🌟 核心特性

### 💰 积分系统
- 精细计费：聊天、图片生成分别计费，数量可配置
- 多种充值：兑换码、管理员充值、注册赠送
- 完整流水：每笔积分变动都有 `CreditLog` 记录，所有扣费在数据库事务中完成

### 👥 用户管理
- 批量操作：批量充值、状态修改、删除
- 三态控制：正常 / 暂停 / 封禁
- 使用限制：会话数、消息数、上下文长度可按用户覆盖
- 软删除：保留审计数据
- 注册控制：开关注册、邀请码注册

### 🔐 权限控制
- 模型级权限：为每个用户单独分配可用模型
- 默认权限：新用户自动获得管理员配置的默认模型
- 管理员全权限：自动拥有所有模型

### 🎫 兑换码 / 邀请码
- 自定义长度、一次性 / 多次 / 无限使用、可设有效期
- 并发安全：兑换与注册抢用在事务内原子完成，杜绝超发

### 🚀 使用体验
- 流式输出（SSE），支持中断（中断时服务端同步取消上游请求，不再白白计费）
- Markdown 渲染、代码块一键复制；流式渲染经 memo + 节流优化，长回复不卡顿
- 自定义 Agent（系统提示词预设，按用户隔离，最多 10 个）
- 图片附件：上传/粘贴图片与 AI 对话（vision），附件落盘存储，消息中只引用 URL
- 图片生成：结果落地到本地，长期可访问
- 会话管理：新建 / 删除 / 自动标题 / 游标分页加载更多
- 深色模式

### ⚡ 性能设计
- **SQLite WAL 模式** + busy_timeout，并发读写不互锁
- **复合索引**覆盖会话列表、上下文查询、积分流水等高频查询
- **上下文预算**：条数、总字符数、图片数量三重上限，杜绝超大请求打爆上游
- **批量写入**：兑换码批量创建、模型同步均为一次批量 SQL
- 聊天首 token 前的校验查询并行化，降低响应延迟

### 🔒 安全设计
- **API Key 加密**：AES-256-GCM 存储，密钥由 `APP_SECRET` 经 SHA-256 派生
- **Session**：HMAC-SHA256 签名的无状态 Token（常数时间比较），HttpOnly + 可选 Secure Cookie
- **封禁即时生效**：被封禁用户的已有登录态在所有接口统一失效
- **越权防护**：所有会话 / Agent 资源操作均校验归属（防 IDOR）
- **输入校验**：服务端消息长度上限、上传文件类型白名单 + 大小限制、路径穿越防护
- **限流**：登录 / 注册 / 兑换 / 聊天 / 图片 / 上传等按动作分级限流（基于 IP 或用户）
- **错误收敛**：未预期错误只返回通用文案，内部细节仅记录在服务端日志
- **安全响应头**：CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、HSTS（生产 HTTPS）
- **审计日志**：记录管理员所有操作

---

## 🛠️ 技术栈

| 技术 | 说明 |
|------|------|
| **框架** | Next.js 15（App Router）+ React 19 |
| **语言** | TypeScript 5.6 |
| **样式** | Tailwind CSS 3.4 |
| **数据库** | SQLite + Prisma ORM 5.22 |
| **认证** | 自定义无状态 Session Cookie（HMAC-SHA256） |
| **加密** | AES-256-GCM（API Key） |
| **密码** | bcryptjs（成本因子 12） |
| **流式输出** | Server-Sent Events (SSE) |
| **Markdown** | react-markdown + remark-gfm |
| **打包模式** | `output: 'standalone'` |

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm

### 1. 克隆与安装

```bash
git clone https://github.com/your-username/light-chat.git
cd light-chat
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，**必须修改 `APP_SECRET`**（至少 32 位随机字符串，用于加密 API Key 和签名 Session）：

```env
APP_SECRET="your-random-secret-key-at-least-32-chars"
DATABASE_URL="file:./dev.db"
```

> ⚠️ `APP_SECRET` 一旦用于加密了 API Key，后续就不能再更改，否则已存储的密钥将无法解密。

### 3. 初始化数据库

```bash
npm run prisma:generate
npm run prisma:push
```

### 4. 启动（开发）

```bash
npm run dev
```

### 5. 创建管理员

浏览器访问 `http://localhost:3000`，系统没有任何用户时会自动跳转到 `/register` 注册页面，**第一个注册的用户将自动成为管理员**（不受"关闭注册/邀请码必填"配置限制）。之后注册的用户均为普通用户。

### 6. 配置服务商

1. 登录后进入 `/admin`
2. 添加服务商：填写名称、API Base URL、API Key
3. 点击「查询导入」自动拉取该服务商的模型列表；不支持列表接口的可手动添加

---

## 📦 生产部署（standalone）

本项目在 `next.config.mjs` 中启用了 `output: 'standalone'`。这种模式会在 `npm run build` 后生成一个**自包含、最小化**的运行目录 `.next/standalone/`，里面带有裁剪过的 `node_modules` 和入口 `server.js`，可以脱离源码和完整依赖独立运行。

### ⚠️ 关键：static 和 public 不会被自动包含

这是 standalone 模式最容易踩的坑。`next build` **不会**把以下两个目录拷进 `.next/standalone/`，需要你**手动复制**，否则线上会出现 **CSS/JS 全部 404、页面裸奔、上传图片打不开**：

| 源路径 | 必须拷贝到的目标路径 | 内容 |
|--------|---------------------|------|
| `.next/static` | `.next/standalone/.next/static` | JS / CSS 等带 hash 的静态资源 |
| `public` | `.next/standalone/public` | 站点静态文件 + **用户生成的图片** `public/uploads` |

### 完整部署步骤

```bash
# 1. 安装依赖
npm install

# 2. 生成 Prisma Client（必须在 build 之前！）
#    standalone 靠 build 时的文件追踪把 .prisma / @prisma/client 打进产物，
#    若此时 Client 未生成，产物会缺失 Prisma，运行时直接报错。
npm run prisma:generate

# 3. 初始化 / 更新数据库表结构（首次部署或 schema 变更时）
npm run prisma:push

# 4. 构建（生成 .next/standalone）
npm run build

# 5. 手动拷贝 static 与 public（关键！）
cp -r .next/static   .next/standalone/.next/static
cp -r public         .next/standalone/public

# 6. 数据库文件与 .env 也要让运行目录能访问到
#    DATABASE_URL 用相对路径时，是相对于 server.js 的工作目录
cp .env       .next/standalone/.env
cp -r prisma  .next/standalone/prisma   # 含 schema 与（如有）dev.db

# 7. 启动 standalone 服务（默认 3000 端口）
node .next/standalone/server.js
```

> 📌 standalone 的入口是 `node .next/standalone/server.js`，**不是** `npm start`。
> `npm start`（即 `next start`）需要完整的 `.next` 与源码依赖，适合「在项目原目录直接起服务」的场景；若你要把产物单独拷到服务器，请用 `server.js`。

### 自定义端口与监听地址

standalone 的 `server.js` 读取标准环境变量 `PORT` 和 `HOSTNAME`，**无需改动任何代码**：

```bash
# 自定义端口（例如 8080）
PORT=8080 node .next/standalone/server.js

# 同时指定监听地址（仅监听本地回环，前面挂 Nginx 时常用）
PORT=8080 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务监听端口 |
| `HOSTNAME` | `0.0.0.0` | 监听地址；设为 `127.0.0.1` 则只允许本机/反代访问 |

> 也可把 `PORT` 写进 `.env`，由 `server.js` 一并读取，省去每次手动指定。
> 若用 `next start` 模式（非 standalone），改用 `npm start -- -p 8080` 传参。

### 目录结构示意（部署后）

```
.next/standalone/
├── server.js            ← 启动入口
├── .env                 ← 手动拷入
├── node_modules/        ← 构建已自动裁剪生成
├── prisma/              ← 手动拷入（schema + sqlite 文件）
├── public/              ← 手动拷入（含 uploads，需可写）
│   └── uploads/         ← 生成的图片落地于此
└── .next/
    └── static/          ← 手动拷入
```

### 图片存储说明

**图片生成的结果**和**聊天上传的图片附件**都会落地到 `public/uploads/`，数据库只保存相对 URL（`/uploads/xxx.png`），避免 base64 撑大数据库、随上下文反复重发。部署时务必：

1. 确保 `public/uploads` 目录存在且**运行进程对其有写权限**；
2. 该目录已加入 `.gitignore`，用户生成的图不会进仓库；
3. 升级重新部署时，**保留** `public/uploads` 内已有图片，避免历史图片丢失（聊天中的图片附件也存在这里，丢失后旧会话的图片将无法显示）。

### 使用 PM2 守护

```bash
# 默认 3000 端口
pm2 start .next/standalone/server.js --name light-chat

# 自定义端口
PORT=8080 pm2 start .next/standalone/server.js --name light-chat

pm2 save && pm2 startup
```

### Docker 部署（多阶段，推荐）

```dockerfile
# ---------- 构建阶段 ----------
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

# ---------- 运行阶段 ----------
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 拷贝 standalone 产物 + 手动补齐 static/public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public           ./public
COPY --from=builder /app/prisma           ./prisma

EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
# 构建镜像
docker build -t light-chat .

# 运行：把宿主机 8080 映射到容器内 3000
docker run -d --name light-chat -p 8080:3000 \
  -v $(pwd)/data/uploads:/app/public/uploads \
  -v $(pwd)/data/db:/app/prisma \
  light-chat

# 或改容器内监听端口（同时调整 -p 映射）
docker run -d --name light-chat -e PORT=8080 -p 8080:8080 light-chat
```

> 容器化时建议把 `public/uploads` 与 sqlite 数据库文件挂载为数据卷（volume），否则容器重建会丢数据。
> 端口有两种改法：**映射宿主端口**（`-p 8080:3000`，容器内仍是 3000，最常用）或**改容器内监听**（`-e PORT=8080` 并相应改 `-p`）。

### Nginx 反向代理

```nginx
server {
  listen 80;
  server_name chat.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $http_host;

    # SSE 流式输出必需
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
  }
}
```

> ⚠️ 不要缓存页面 HTML，否则发版后可能出现 `Loading chunk failed`。带 hash 的 `/_next/static/` 资源可放心长期缓存（文件名变化即失效）。
> ⚠️ 反代层数会影响真实 IP 识别，请配合 `TRUSTED_PROXY_HOPS`（见下）。

---

## ⚙️ 配置详解

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `APP_SECRET` | *必填* | 加密 / 签名密钥，至少 32 字符，**启用后不可更改** |
| `DATABASE_URL` | `file:./dev.db` | SQLite 数据库文件路径（相对路径相对于运行目录） |
| `COOKIE_SECURE` | `""`（自动） | Cookie Secure 标志，详见下方说明；**纯 HTTP 部署必须设 `false`**，否则登录态丢失 |
| `CORS_ORIGINS` | `""` | 允许的跨域来源，逗号分隔；`*` 表示全部 |
| `TRUSTED_PROXY_HOPS` | `1` | **可信反代层数**。限流取真实 IP 时从 `X-Forwarded-For` 链最右往左数第 N 跳。单层 Nginx 用 `1`；无反代直连用 `0`；多层代理按实际层数设置。配错会导致限流被伪造 IP 绕过 |
| `ALLOW_USER_REGISTRATION` | `true` | 是否允许用户注册 |
| `REQUIRE_INVITE_CODE_ON_REGISTER` | `false` | 注册是否需要邀请码 |
| `DEFAULT_USER_CREDITS` | `1` | 新用户初始积分 |
| `DEFAULT_MODEL_IDS` | `""` | 新用户默认模型权限（逗号分隔的模型 ID） |
| `CREDIT_PER_CHAT_MESSAGE` | `1` | 每次聊天消耗积分 |
| `CREDIT_PER_IMAGE_GENERATION` | `5` | 每次图片生成消耗积分 |
| `MAX_CONVERSATIONS_PER_USER` | `50` | 每用户最大会话数 |
| `MAX_MESSAGES_PER_CONVERSATION` | `100` | 每会话最大消息数 |
| `MAX_CONTEXT_MESSAGES` | `20` | 单次请求最大上下文消息数 |
| `MAX_MESSAGE_CHARS` | `100000` | 单条消息内容最大字符数（服务端校验） |
| `MAX_CONTEXT_CHARS` | `200000` | 单次请求上下文总字符数上限（与条数上限同时生效，先到为准） |
| `MAX_CONTEXT_IMAGES` | `4` | 单次请求上下文最多携带的图片数（优先保留最新；图片按 base64 内联发给上游，体积大） |
| `REDEEM_CODE_LENGTH` | `8` | 兑换码长度 |

> Cloudflare 环境下会优先使用不可伪造的 `cf-connecting-ip`，此时 `TRUSTED_PROXY_HOPS` 不参与判断。

#### 关于 `COOKIE_SECURE`

它控制 session cookie 是否带 `Secure` 标志（带了之后浏览器**只在 HTTPS 下才发送该 cookie**，防止明文链路窃取）。取值有三种：

| 值 | 行为 |
|------|------|
| `"true"` | 强制开启 Secure |
| `"false"` | 强制关闭 Secure |
| `""`（空）/ 不设 | **自动**：`NODE_ENV=production` 时视为 `true`，否则 `false` |

⚠️ **部署关键点**：自动判断只看 `NODE_ENV`，**不看你实际是否 HTTPS**。生产环境若用**纯 HTTP**（内网、未配 SSL 等），自动会把 Secure 置为 `true`，于是浏览器在 HTTP 下根本不发送 session cookie，表现为「登录后立刻又跳回登录页」。

- **HTTPS 部署** → 留空或设 `"true"`
- **纯 HTTP 部署** → **必须显式设 `COOKIE_SECURE="false"`**

> 该变量还联动 HSTS 响应头：仅当 `COOKIE_SECURE !== "false"` 时才下发 `Strict-Transport-Security`。纯 HTTP 站点设为 `"false"` 可避免错误下发 HSTS（HSTS 会强制浏览器后续只走 HTTPS，纯 HTTP 站会因此打不开）。

### 系统设置（管理后台）

部分配置可在「后台 → 系统设置」中通过 Web 界面修改，保存后写入 `.env.local`，**需要重启应用生效**。

---

## 📡 API 端点

### 认证
- `POST /api/auth/register` — 注册
- `POST /api/auth/login` — 登录
- `POST /api/auth/logout` — 退出
- `POST /api/auth/change-password` — 修改密码
- `GET /api/auth/me` — 当前用户信息

### 用户端
- `GET /api/models` — 可用模型列表
- `GET /api/user/credits` — 积分余额
- `POST /api/redeem` — 使用兑换码
- `POST /api/uploads` — 上传聊天图片附件（multipart/form-data，5MB 上限，返回 `/uploads/xx` URL）
- `GET /api/conversations` — 会话列表（游标分页：`?limit=30&cursor=<id>`）
- `GET /api/conversations/[id]` — 会话详情
- `PATCH /api/conversations/[id]` — 重命名会话
- `DELETE /api/conversations/[id]` — 删除会话
- `POST /api/chat/stream` — 聊天（SSE 流式）
- `POST /api/images/generate` — 图片生成
- `GET /api/agents` · `POST /api/agents` · `PUT /api/agents/[id]` · `DELETE /api/agents/[id]` — 自定义 Agent

### 管理员
- `GET /api/admin/statistics` — 统计信息
- `GET /api/admin/users` · `POST /api/admin/users` — 用户列表 / 创建
- `PATCH /api/admin/users/[id]` · `DELETE /api/admin/users/[id]` — 更新 / 删除用户
- `POST /api/admin/users/bulk` — 批量操作
- `POST /api/admin/users/[id]/grant-credits` — 充值积分
- `GET /api/admin/redeem-codes` · `POST /api/admin/redeem-codes` — 兑换码
- `GET /api/admin/providers` · `POST /api/admin/providers/[id]/sync-models` — 服务商 / 同步模型
- `GET /api/admin/settings` · `PATCH /api/admin/settings` — 系统设置

---

## 🔄 从旧版本升级

1. **数据库结构有变更**（新增复合索引等）时，部署前执行：
   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```
2. WAL 模式在应用启动时自动启用，无需手动迁移；首次启用后数据库同目录会出现 `*-wal` / `*-shm` 文件，属正常现象（备份时一并保留，或先停服再备份）。
3. 历史会话中以 base64 内嵌的旧图片消息仍可正常显示；新发送的图片附件一律落盘到 `public/uploads/`。

---

## 🐛 故障排查

### CSS/JS 全部失效，页面无样式
standalone 部署时漏拷 `.next/static` 或 `public`。参见[生产部署](#-生产部署standalone)，确认两个目录已复制到 `.next/standalone/` 对应位置。

### 上传 / 生成的图片 404
`public/uploads` 没被拷进运行目录，或目录不可写。确认 `public` 已拷贝且进程有写权限；容器部署建议挂载为数据卷。

### Loading chunk failed
反代缓存了旧版本 HTML。确保 Nginx 不缓存页面 HTML，仅缓存带 hash 的 `/_next/static/`。

### 登录状态丢失 / 表单跳转到 localhost
- HTTP 站点未设 `COOKIE_SECURE="false"`，或多设备访问了不同域名 → 统一域名 + 协议
- 反代未传 `Host` / `X-Forwarded-Host` / `X-Forwarded-Proto`，或把 `Host` 传成了上游地址（如 `localhost:51733`）。Nginx 建议使用 `proxy_set_header Host $http_host;` 和 `proxy_set_header X-Forwarded-Host $http_host;`

### 限流被绕过 / 误伤
`TRUSTED_PROXY_HOPS` 与实际反代层数不一致。单层反代设 `1`，直连设 `0`，多层按实际层数设置。

### 流式输出不工作
Nginx 未关闭缓冲。确保 location 内含 `proxy_buffering off; proxy_cache off; chunked_transfer_encoding on;`。

---

## 🤝 贡献指南

欢迎 Issue 和 PR。提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```bash
feat:  新功能
fix:   Bug 修复
docs:  文档更新
perf:  性能优化
refactor: 重构
```

开发流程：Fork → 新建分支 → 提交 → 推送 → 开 PR。

---

## 📄 License

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🙏 致谢

- [Next.js](https://nextjs.org/) · [Prisma](https://www.prisma.io/) · [Tailwind CSS](https://tailwindcss.com/) · [react-markdown](https://github.com/remarkjs/react-markdown)

---

<div align="center">

**[⬆ 回到顶部](#-light-chat)**

</div>
