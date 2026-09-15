# 数据库迁移指南

## 推荐方式：使用迁移命令

在 `packages/server/.env` 配置 `DATABASE_URL` 后，从仓库根目录执行：

```bash
pnpm --filter @starlink/server db:migrate
```

该命令会按顺序执行 `packages/server/migrations/` 下的 `.sql` 文件和 `*/migration.sql`，并把已执行记录写入 `schema_migrations`。

## 手动方式：在 Supabase 中执行迁移

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 按文件名顺序执行 `packages/server/migrations/` 下的 SQL
5. 点击 **Run** 执行每个迁移

## 验证安装

运行以下 SQL 验证 pgvector 是否启用：

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

应该返回一行记录。

## 测试向量搜索

```sql
-- 插入测试数据（需要先获取 embedding，这里用随机向量演示）
INSERT INTO knowledge_documents (title, content, embedding)
VALUES (
  'Test Document',
  'This is a test document for RAG',
  array_fill(0, ARRAY[1536])::vector
);

-- 测试搜索函数
SELECT * FROM match_knowledge_documents(
  array_fill(0, ARRAY[1536])::vector,
  0.5,
  5
);
```

## 配置环境变量

确保 `.env` 或 `.env.local` 中配置了 Supabase 凭据：

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_KEY=eyJxxx...  # 服务端需要，用于绕过 RLS
```

## 数据表说明

### 1. `knowledge_documents`
存储完整文档及其向量表示
- `embedding`: 1536 维向量（OpenAI/Tongyi Embedding）
- `metadata`: 存储额外信息（如文档来源、作者、日期）

### 2. `knowledge_chunks`
存储文档切片（用于处理长文档）
- 每个文档会被切分为多个 chunk
- 每个 chunk 有独立的 embedding

### 3. `agent_messages`
记录 Agent 间的通信日志
- 用于调试和审计多智能体协作过程

### 4. `rag_retrieval_logs`
记录 RAG 检索历史
- 用于分析检索质量、优化查询策略

## 向量索引说明

- **HNSW (Hierarchical Navigable Small World)**:
  - 更高的检索精度
  - 适合中小规模数据集（< 100 万条）
  - 默认使用

- **IVFFlat** (可选):
  - 更快的构建速度
  - 适合超大规模数据集
  - 精度略低

切换索引类型：
```sql
DROP INDEX knowledge_documents_embedding_idx;
CREATE INDEX knowledge_documents_embedding_idx
  ON knowledge_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- lists 参数根据数据量调整
```

## 性能优化建议

1. **定期 VACUUM**:
   ```sql
   VACUUM ANALYZE knowledge_documents;
   ```

2. **监控索引使用**:
   ```sql
   SELECT * FROM pg_stat_user_indexes
   WHERE indexrelname LIKE '%embedding%';
   ```

3. **调整 work_mem**（如果检索慢）:
   ```sql
   SET work_mem = '256MB';
   ```

## 故障排查

### 错误：`extension "vector" does not exist`
**原因**: Supabase 项目未启用 pgvector 扩展
**解决**: 在 SQL Editor 中执行 `CREATE EXTENSION vector;`

### 错误：`operator does not exist: vector <=> vector`
**原因**: 向量维度不匹配
**解决**: 确保所有 embedding 都是 1536 维（或统一改为其他维度）

### 错误：`index method "hnsw" does not exist`
**原因**: pgvector 版本过低
**解决**: 升级到 pgvector 0.5.0+，或使用 IVFFlat 索引
