# Agent 功能升级说明

## 更新内容

### 1. 数据库迁移
- Agent 数据从 localStorage 迁移到数据库存储
- 支持多用户独立管理自己的 Agent
- 数据持久化，不再受浏览器限制

### 2. UI 优化
- 将附件和 Agent 功能集成到输入框中
- 输入框内新增两个图标按钮：
  - 📎 附件按钮：点击添加文件/图片
  - 🤖 Agent 按钮：快速打开 Agent 管理弹窗
- 保留输入框上方的功能栏（文件、Agent 选择器）方便快速切换

### 3. API 接口

#### 获取用户的所有 Agent
```
GET /api/agents
```

响应：
```json
{
  "agents": [
    {
      "id": "xxx",
      "userId": "xxx",
      "name": "代码审查助手",
      "prompt": "你是一个专业的代码审查助手...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### 创建新 Agent
```
POST /api/agents
Content-Type: application/json

{
  "name": "代码审查助手",
  "prompt": "你是一个专业的代码审查助手..."
}
```

#### 更新 Agent
```
PUT /api/agents/[agentId]
Content-Type: application/json

{
  "name": "代码审查助手",
  "prompt": "你是一个专业的代码审查助手..."
}
```

#### 删除 Agent
```
DELETE /api/agents/[agentId]
```

## 部署步骤

1. **更新数据库 Schema**
   ```bash
   npx prisma migrate dev --name add_agent_table
   ```

2. **迁移旧数据（可选）**
   
   如果用户之前在 localStorage 中保存了 Agent，需要进行数据迁移：
   
   - 在浏览器中打开聊天页面
   - 按 F12 打开开发者工具
   - 在控制台中运行 `scripts/migrate-agents.ts` 中的脚本

3. **重启应用**
   ```bash
   npm run build
   npm start
   ```

## 数据库 Schema

新增 `Agent` 表：

```prisma
model Agent {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  prompt    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}
```

## 注意事项

1. **用户隔离**：每个用户只能看到和管理自己创建的 Agent
2. **数量限制**：每个用户最多创建 10 个 Agent
3. **级联删除**：删除用户时会自动删除其所有 Agent
4. **向后兼容**：旧的 localStorage 数据不会自动清除，需要手动迁移

## 优势

- ✅ 数据持久化，不受浏览器清理影响
- ✅ 支持多设备同步
- ✅ 用户数据隔离
- ✅ 便于管理和备份
- ✅ UI 更简洁，功能集成在输入框中
