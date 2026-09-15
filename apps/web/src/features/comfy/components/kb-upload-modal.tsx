'use client'

/**
 * KB Upload Modal — Mode B 入口共享组件 (canvas / homepage / /knowledge
 * 三处都用)。三种 source：
 *   1. paste-text  — addKnowledgeSeed mutation
 *   2. import-url  — importKnowledgeUrl mutation
 *   3. upload-file — POST /kb/:kbId/import/file (要 task service 4001)
 *
 * 流程：
 *   - 进 modal → 拉 knowledgeBases(workspaceId) 列出已有 KB
 *   - 没 KB → "新建知识库" → createKnowledgeBase mutation
 *   - 选定 KB → 选 source → 提交 → 后台 ingest
 *   - 完成后 onAnalyze callback → 上层用 kbId 触发 startConversation
 */

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listAgents } from '../registries/agent-registry'
import { Database, FileText, Globe, Pencil, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { getGraphQLClient } from '@/shared/lib/graphql-client'

const KB_LIST = /* GraphQL */ `
  query KbList($workspaceId: ID!) {
    knowledgeBases(workspaceId: $workspaceId) {
      id workspaceId name description status sourceCount lastIngestAt
    }
  }
`

const KB_CREATE = /* GraphQL */ `
  mutation KbCreate($workspaceId: ID!, $visibility: String) {
    createKnowledgeBase(workspaceId: $workspaceId, visibility: $visibility) {
      id workspaceId name description status sourceCount visibility
    }
  }
`

const KB_ADD_SEED = /* GraphQL */ `
  mutation KbAddSeed($workspaceId: ID!, $kbId: ID!, $text: String!) {
    addKnowledgeSeed(workspaceId: $workspaceId, kbId: $kbId, text: $text) {
      id status
    }
  }
`

const KB_ADD_FILE = /* GraphQL */ `
  mutation KbAddFile(
    $workspaceId: ID!
    $kbId: ID!
    $fileName: String!
    $contentType: String!
    $content: String!
    $isBase64: Boolean
  ) {
    addKnowledgeFile(
      workspaceId: $workspaceId
      kbId: $kbId
      fileName: $fileName
      contentType: $contentType
      content: $content
      isBase64: $isBase64
    ) {
      id status payload error
    }
  }
`

const KB_LIST_DOCUMENTS = /* GraphQL */ `
  query KbDocuments($workspaceId: ID!, $kbId: ID!) {
    knowledgeBaseDocuments(workspaceId: $workspaceId, kbId: $kbId) {
      id title contentType sourceUrl sizeChars metadata createdAt updatedAt
    }
  }
`

const KB_DELETE_DOCUMENT = /* GraphQL */ `
  mutation KbDeleteDoc($workspaceId: ID!, $kbId: ID!, $docId: ID!) {
    deleteKnowledgeBaseDocument(workspaceId: $workspaceId, kbId: $kbId, docId: $docId)
  }
`

const KB_LIST_BINDINGS = /* GraphQL */ `
  query KbAgentBindings($workspaceId: ID!, $kbId: ID!) {
    knowledgeBaseAgentBindings(workspaceId: $workspaceId, kbId: $kbId) {
      id agentId autoSearch createdAt
    }
  }
`

const KB_BIND_AGENT = /* GraphQL */ `
  mutation KbBindAgent($workspaceId: ID!, $kbId: ID!, $agentId: String!, $autoSearch: Boolean) {
    bindKbToAgent(workspaceId: $workspaceId, kbId: $kbId, agentId: $agentId, autoSearch: $autoSearch) {
      id agentId autoSearch
    }
  }
`

const KB_UNBIND_AGENT = /* GraphQL */ `
  mutation KbUnbindAgent($workspaceId: ID!, $kbId: ID!, $agentId: String!) {
    unbindKbFromAgent(workspaceId: $workspaceId, kbId: $kbId, agentId: $agentId)
  }
`

const KB_IMPORT_URL = /* GraphQL */ `
  mutation KbImportUrl($workspaceId: ID!, $kbId: ID!, $url: String!) {
    importKnowledgeUrl(workspaceId: $workspaceId, kbId: $kbId, url: $url) {
      id status
    }
  }
`

type KnowledgeBase = {
  id: string
  workspaceId: string
  name: string
  description: string | null
  status: string
  sourceCount: number
  lastIngestAt: string | null
}

type SourceTab = 'text' | 'url' | 'file'

type Props = {
  open: boolean
  workspaceId: string
  onClose: () => void
  /** Called with the chosen KB id when user clicks "用此资料生成 BMC". */
  onAnalyze?: (kbId: string) => void
}

export function KbUploadModal({ open, workspaceId, onClose, onAnalyze }: Props) {
  const qc = useQueryClient()
  const [activeKbId, setActiveKbId] = useState<string | null>(null)
  const [sourceTab, setSourceTab] = useState<SourceTab>('text')
  const [textInput, setTextInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  // F4 · file import state. selectedFile is the File object from the
  // <input type="file"> change handler; cleared after successful submit
  // so users can upload the next file without manually re-clicking the
  // dropzone.
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [submittingSource, setSubmittingSource] = useState(false)
  const [submitNote, setSubmitNote] = useState<string | null>(null)

  const { data: kbs, isLoading: kbsLoading } = useQuery({
    queryKey: ['kbList', workspaceId],
    queryFn: async () => {
      const client = getGraphQLClient()
      const r = await client.request<{ knowledgeBases: KnowledgeBase[] }>(KB_LIST, { workspaceId })
      return r.knowledgeBases ?? []
    },
    enabled: open && !!workspaceId,
    staleTime: 10_000,
  })

  // Auto-select most-recent or first KB on open
  useEffect(() => {
    if (!open) {
      // Reset transient state on close so reopening with a different
      // workspace doesn't auto-select a stale KB.
      setSelectedFile(null)
      setSubmitNote(null)
      return
    }
    // If currently selected KB no longer exists in the loaded list
    // (e.g. workspace switched), drop it.
    if (activeKbId && kbs && !kbs.some((k) => k.id === activeKbId)) {
      setActiveKbId(null)
    }
    if (!activeKbId && kbs && kbs.length > 0) {
      setActiveKbId(kbs[0].id)
    }
  }, [open, kbs, activeKbId])

  // F1 · KB visibility selector. Defaults to 'workspace' (legacy
  // behaviour: shared with all members). Users uploading personal
  // documents can pick 'private' so other workspace members can't
  // search those chunks even when they share the workspace.
  const [newKbVisibility, setNewKbVisibility] = useState<'private' | 'workspace' | 'global'>('workspace')

  const createMutation = useMutation({
    mutationFn: async () => {
      const client = getGraphQLClient()
      const r = await client.request<{ createKnowledgeBase: KnowledgeBase }>(KB_CREATE, {
        workspaceId,
        visibility: newKbVisibility
      })
      return r.createKnowledgeBase
    },
    onSuccess: (kb) => {
      void qc.invalidateQueries({ queryKey: ['kbList', workspaceId] })
      setActiveKbId(kb.id)
      setSubmitNote(`已创建知识库 ${kb.id.slice(0, 8)}… · ${newKbVisibility === 'private' ? '私人' : newKbVisibility === 'global' ? '全局' : '工作区'}`)
    },
  })

  const handleSubmitSource = useCallback(async () => {
    if (!activeKbId || submittingSource) return
    setSubmittingSource(true)
    setSubmitNote(null)
    const client = getGraphQLClient()
    try {
      if (sourceTab === 'text') {
        if (!textInput.trim()) throw new Error('文本不能为空')
        await client.request(KB_ADD_SEED, { workspaceId, kbId: activeKbId, text: textInput.trim() })
        setTextInput('')
        setSubmitNote('文本已入库，agent 后台 chunk + embed 中…')
      } else if (sourceTab === 'url') {
        if (!urlInput.trim()) throw new Error('URL 不能为空')
        await client.request(KB_IMPORT_URL, { workspaceId, kbId: activeKbId, url: urlInput.trim() })
        setUrlInput('')
        setSubmitNote('URL 已提交抓取，agent 后台分析中…')
      } else if (sourceTab === 'file') {
        if (!selectedFile) throw new Error('请先选择一个文件')
        const fileName = selectedFile.name
        const lower = fileName.toLowerCase()
        // Detect binary formats. Raw .pdf / .docx / .xlsx → base64 path
        // through the binary extractor (pdf-parse / mammoth / xlsx).
        const isBinary =
          lower.endsWith('.pdf')
          || lower.endsWith('.docx')
          || lower.endsWith('.xlsx')
          || lower.endsWith('.xls')
          || selectedFile.type === 'application/pdf'
          || selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          || selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

        // Size limit: text 5 MiB raw, binary 6 MiB raw (~8 MiB base64).
        const limitBytes = isBinary ? 6 * 1024 * 1024 : 5 * 1024 * 1024
        if (selectedFile.size > limitBytes) {
          throw new Error(
            `文件过大（${(selectedFile.size / 1024 / 1024).toFixed(2)} MiB），上限 ${limitBytes / 1024 / 1024} MiB`
          )
        }

        // Resolve content-type from file metadata or extension.
        const contentType = selectedFile.type
          || (lower.endsWith('.md') ? 'text/markdown'
              : lower.endsWith('.html') || lower.endsWith('.htm') ? 'text/html'
              : lower.endsWith('.json') ? 'application/json'
              : lower.endsWith('.pdf') ? 'application/pdf'
              : lower.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : lower.endsWith('.xlsx') || lower.endsWith('.xls')
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'text/plain')

        let payload: string
        let isBase64 = false
        if (isBinary) {
          // Read as ArrayBuffer → base64. btoa() can't handle binary
          // strings directly; build the base64 chunk-by-chunk to avoid
          // String.fromCharCode stack overflow on large files.
          const buf = await selectedFile.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let binaryStr = ''
          const chunk = 0x8000
          for (let i = 0; i < bytes.length; i += chunk) {
            binaryStr += String.fromCharCode.apply(
              null,
              Array.from(bytes.subarray(i, i + chunk))
            )
          }
          payload = btoa(binaryStr)
          isBase64 = true
        } else {
          payload = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
            reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
            reader.readAsText(selectedFile)
          })
        }

        await client.request(KB_ADD_FILE, {
          workspaceId,
          kbId: activeKbId,
          fileName,
          contentType,
          content: payload,
          isBase64
        })
        setSelectedFile(null)
        const sizeNote = isBinary
          ? `${(selectedFile.size / 1024).toFixed(1)} KB · ${contentType.includes('pdf') ? 'PDF' : contentType.includes('word') ? 'DOCX' : contentType.includes('sheet') ? 'XLSX' : '二进制'}`
          : `${(payload.length / 1024).toFixed(1)} KB · 文本`
        setSubmitNote(`✓ ${fileName} 已入库（${sizeNote}），后台 chunk + embed 中…`)
      }
      void qc.invalidateQueries({ queryKey: ['kbList', workspaceId] })
      // F7 · also invalidate the doc list so the freshly-added file
      // appears in the panel without manual refresh.
      void qc.invalidateQueries({ queryKey: ['kbDocuments', workspaceId, activeKbId] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSubmitNote(`失败：${msg.slice(0, 200)}`)
    } finally {
      setSubmittingSource(false)
    }
  }, [activeKbId, submittingSource, sourceTab, textInput, urlInput, selectedFile, workspaceId, qc])

  if (!open) return null

  const activeKb = kbs?.find((k) => k.id === activeKbId) ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stratum-navy/40 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-label="KB 资料上传"
    >
      <article className="w-full max-w-[720px] rounded-2xl bg-white shadow-2xl border border-stratum-line overflow-hidden flex flex-col max-h-[85vh]">
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-stratum-line">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stratum-navy">
              <Database className="h-4 w-4 text-stratum-sky" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
                KNOWLEDGE BASE · 资料分析入口
              </p>
              <h2 className="mt-1 font-display font-[700] text-[20px] tracking-tight text-stratum-navy">
                上传资料 → AI 抽取 → 生成 BMC
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stratum-muted hover:bg-stratum-surface-low hover:text-stratum-navy transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* KB selector strip */}
          <section>
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted mb-2">
              选择知识库 · {kbs?.length ?? 0} 个
            </p>
            {kbsLoading ? (
              <p className="font-body text-[12px] text-stratum-muted">载入中…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(kbs ?? []).map((kb) => (
                  <button
                    key={kb.id}
                    type="button"
                    onClick={() => setActiveKbId(kb.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      activeKbId === kb.id
                        ? 'border-stratum-blue bg-stratum-blue/10 text-stratum-navy'
                        : 'border-stratum-line bg-stratum-surface-low text-stratum-ink hover:border-stratum-blue/40'
                    }`}
                  >
                    <Database className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="font-body text-[12px] font-medium">{kb.name || `KB ${kb.id.slice(0, 6)}`}</span>
                    <span className="font-body text-[10px] tabular-nums text-stratum-muted">
                      {kb.sourceCount} 项
                    </span>
                  </button>
                ))}
                <div className="flex items-center gap-2">
                  {/* F1 · Visibility selector — drives whether the new KB
                      is private to the caller, shared with the workspace,
                      or globally visible. Default 'workspace' matches the
                      legacy behaviour pre-isolation. */}
                  <select
                    value={newKbVisibility}
                    onChange={(e) => setNewKbVisibility(e.target.value as 'private' | 'workspace' | 'global')}
                    className="rounded-lg border border-stratum-line bg-white px-2 py-2 font-body text-[11px] text-stratum-ink focus:border-stratum-blue focus:outline-none"
                    disabled={createMutation.isPending}
                    aria-label="新建知识库的可见性"
                  >
                    <option value="private">🔒 私人 · 只我可搜</option>
                    <option value="workspace">👥 工作区 · 所有成员可搜</option>
                    <option value="global">🌐 全局 · 所有用户可搜</option>
                  </select>
                  {/* Solid navy CTA. Was a dashed-ghost button which read
                      as the same visual weight as the visibility selector
                      next to it — there's no clear "which one is the
                      action?" signal. Inverted ink-on-paper resolves the
                      hierarchy: dropdown chooses scope, button fires. */}
                  <button
                    type="button"
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-stratum-navy px-3 py-2 text-white hover:bg-stratum-navy-soft transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-stratum-navy"
                  >
                    <Plus className="h-3.5 w-3.5 text-stratum-sky" strokeWidth={2} />
                    <span className="font-body text-[12px] font-semibold">
                      {createMutation.isPending ? '创建中…' : '新建知识库'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Source tabs */}
          {activeKb ? (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
                  添加资料到 {activeKb.name || `KB ${activeKb.id.slice(0, 6)}`}
                </p>
                <span
                  className={`font-body text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    activeKb.status === 'published'
                      ? 'bg-stratum-ok-wash text-stratum-ok'
                      : 'bg-stratum-surface-low text-stratum-muted'
                  }`}
                >
                  {activeKb.status}
                </span>
              </div>
              {/* Segmented control: each tab is a sharp 1.5px box that flips
                  to inverted ink on activation. Replaces the previous
                  underlined nav-link pattern (which read as passive label
                  navigation, not a tactile mode switch). */}
              <nav role="tablist" className="flex items-stretch -mb-px mb-3 isolate">
                <SourceTabBtn id="text" current={sourceTab} setTab={setSourceTab} icon={Pencil} label="文本笔记" />
                <SourceTabBtn id="url"  current={sourceTab} setTab={setSourceTab} icon={Globe}  label="导入 URL" />
                <SourceTabBtn id="file" current={sourceTab} setTab={setSourceTab} icon={Upload} label="上传文件" />
              </nav>

              {sourceTab === 'text' ? (
                <div>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="贴入访谈纪录 / 竞品分析 / 市场报告片段…&#10;agent 会拆 chunk + embed 后存入 KB"
                    rows={6}
                    className="w-full resize-y rounded-lg border border-stratum-line bg-stratum-surface-low px-3 py-2.5 font-body text-[13px] leading-relaxed text-stratum-navy outline-none focus:border-stratum-blue focus:ring-2 focus:ring-stratum-blue/20"
                  />
                </div>
              ) : null}

              {sourceTab === 'url' ? (
                <div>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/article 或 PDF / 文档直链"
                    className="w-full rounded-lg border border-stratum-line bg-stratum-surface-low px-3 py-2.5 font-body text-[13px] text-stratum-navy outline-none focus:border-stratum-blue focus:ring-2 focus:ring-stratum-blue/20"
                  />
                  <p className="mt-2 font-body text-[11px] text-stratum-muted">
                    支持 http(s) 抓取 → 提取正文 → chunk → embed
                  </p>
                </div>
              ) : null}

              {sourceTab === 'file' ? (
                <div>
                  <label
                    htmlFor="kb-file-input"
                    className="block rounded-lg border-2 border-dashed border-stratum-line bg-stratum-surface-low p-6 text-center cursor-pointer hover:border-stratum-blue/60 transition-colors"
                  >
                    <Upload className="h-6 w-6 text-stratum-blue/60 mx-auto mb-2" strokeWidth={1.5} />
                    {selectedFile ? (
                      <p className="font-body text-[12px] text-stratum-navy font-semibold">
                        ✓ {selectedFile.name}
                        <span className="block mt-0.5 font-mono text-[10px] tabular-nums text-stratum-muted">
                          {(selectedFile.size / 1024).toFixed(1)} KB · {selectedFile.type || '未知类型'}
                        </span>
                      </p>
                    ) : (
                      <>
                        <p className="font-body text-[12px] text-stratum-muted leading-relaxed">
                          点击或拖拽文件到此处<br />
                          支持 <span className="font-mono">.txt · .md · .html · .json · .pdf · .docx · .xlsx</span>
                        </p>
                        <p className="mt-2 font-body text-[10px] text-stratum-muted">
                          文本 ≤ 5 MiB · PDF/DOCX/XLSX ≤ 6 MiB
                        </p>
                      </>
                    )}
                  </label>
                  <input
                    id="kb-file-input"
                    type="file"
                    accept=".txt,.md,.markdown,.html,.htm,.json,.csv,.log,.pdf,.docx,.xlsx,.xls,text/*,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setSelectedFile(f)
                      // Reset input so the same file can be re-selected
                      // after a failure.
                      e.target.value = ''
                    }}
                  />
                  {selectedFile ? (
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-stratum-muted hover:text-stratum-danger"
                    >
                      清除选择
                    </button>
                  ) : null}
                </div>
              ) : null}

              {submitNote ? (
                <p
                  className={`mt-2 font-body text-[11px] ${
                    submitNote.startsWith('失败') ? 'text-stratum-danger' : 'text-stratum-blue'
                  }`}
                >
                  {submitNote}
                </p>
              ) : null}

              {/* F7 · Document list panel — shows what's already in the
                  KB with size + delete affordance. Sits between the
                  source-add UI and the agent binding panel so users
                  see "what's already here" before adding more. */}
              {activeKbId ? (
                <KbDocumentListPanel workspaceId={workspaceId} kbId={activeKbId} />
              ) : null}

              {/* F4 · Agent binding panel — at the bottom of the source
                  section so users can assign the active KB to one or more
                  agents (e.g. "researcher always pulls from market-trends KB"). */}
              {activeKbId ? (
                <KbAgentBindingPanel workspaceId={workspaceId} kbId={activeKbId} />
              ) : null}
            </section>
          ) : (
            <section className="rounded-lg border border-dashed border-stratum-line bg-stratum-surface-low/50 p-6 text-center">
              <FileText className="h-6 w-6 text-stratum-blue/40 mx-auto mb-2" strokeWidth={1.5} />
              <p className="font-body text-[12px] text-stratum-muted">
                还没有知识库——点上面「新建知识库」开始
              </p>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-6 py-4 bg-stratum-surface-low border-t border-stratum-line">
          <button
            type="button"
            onClick={handleSubmitSource}
            disabled={
              !activeKbId
              || submittingSource
              || (sourceTab === 'file' && !selectedFile)
              || (sourceTab === 'text' && !textInput.trim())
              || (sourceTab === 'url' && !urlInput.trim())
            }
            className="rounded-full border border-stratum-line bg-white px-4 py-2 font-body text-[11px] font-semibold text-stratum-navy hover:border-stratum-blue/40 hover:text-stratum-blue transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submittingSource ? '提交中…' : '添加到 KB'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-2 font-body text-[11px] font-semibold text-stratum-muted hover:text-stratum-navy transition-colors"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeKbId && onAnalyze) {
                  onAnalyze(activeKbId)
                  onClose()
                }
              }}
              disabled={!activeKb || activeKb.sourceCount === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-stratum-navy px-4 py-2 font-body text-[11px] font-bold text-white hover:bg-stratum-navy-soft transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5 text-stratum-sky" strokeWidth={2} fill="#89CEFF" />
              基于此 KB 生成 BMC
            </button>
          </div>
        </footer>
      </article>
    </div>
  )
}

function SourceTabBtn({
  id,
  current,
  setTab,
  icon: Icon,
  label,
}: {
  id: SourceTab
  current: SourceTab
  setTab: (t: SourceTab) => void
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
}) {
  const isActive = current === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => setTab(id)}
      // Sharp segmented box — 1.5px borders share edges between siblings
      // via -ml-[1.5px] so the active state cleanly overlays without a
      // double-rule. Active flips to inverted ink (paper-on-ink) — gives
      // the tactile "tap a key" feedback the previous underline lacked.
      className={`relative -ml-[1.5px] flex items-center gap-1.5 px-3.5 py-2 border-[1.5px] font-body text-[12px] font-semibold transition-colors first:ml-0 first:rounded-l-md last:rounded-r-md ${
        isActive
          ? 'z-10 border-stratum-navy bg-stratum-navy text-white'
          : 'border-stratum-line bg-white text-stratum-muted hover:z-10 hover:border-stratum-navy/50 hover:text-stratum-navy'
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  )
}

// ============================================================================
// F4 · Agent binding panel
// ============================================================================

interface KbAgentBindingRow {
  id: string
  agentId: string
  autoSearch: boolean
  createdAt: string
}

function KbAgentBindingPanel({ workspaceId, kbId }: { workspaceId: string; kbId: string }) {
  const qc = useQueryClient()
  const { data: bindings, isLoading } = useQuery({
    queryKey: ['kbBindings', workspaceId, kbId],
    queryFn: async () => {
      const client = getGraphQLClient()
      const r = await client.request<{ knowledgeBaseAgentBindings: KbAgentBindingRow[] }>(
        KB_LIST_BINDINGS,
        { workspaceId, kbId }
      )
      return r.knowledgeBaseAgentBindings
    }
  })

  const [pickerAgent, setPickerAgent] = useState<string>('')
  const [autoSearch, setAutoSearch] = useState(true)

  const bindMutation = useMutation({
    mutationFn: async () => {
      if (!pickerAgent) return
      const client = getGraphQLClient()
      await client.request(KB_BIND_AGENT, {
        workspaceId,
        kbId,
        agentId: pickerAgent,
        autoSearch
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kbBindings', workspaceId, kbId] })
      setPickerAgent('')
    }
  })

  const unbindMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const client = getGraphQLClient()
      await client.request(KB_UNBIND_AGENT, { workspaceId, kbId, agentId })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kbBindings', workspaceId, kbId] })
    }
  })

  const allAgents = listAgents()
  const boundAgentIds = new Set(bindings?.map((b) => b.agentId) ?? [])
  const availableAgents = allAgents.filter((a) => !boundAgentIds.has(a.id))

  return (
    <div className="mt-4 pt-3 border-t border-stratum-line">
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
          AGENT 绑定 · 让 agent 自动检索此 KB
        </p>
        {bindings && bindings.length > 0 ? (
          <span className="font-mono text-[9px] tabular-nums text-stratum-muted">
            已绑 {bindings.length}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="font-body text-[11px] text-stratum-muted py-1">加载中…</p>
      ) : bindings && bindings.length > 0 ? (
        <ul className="space-y-1 mb-3">
          {bindings.map((b) => {
            const agent = allAgents.find((a) => a.id === b.agentId)
            return (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-stratum-surface-low/50 px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-stratum-navy shrink-0">
                    {agent?.glyph ?? '?'}
                  </span>
                  <span className="font-body text-[12px] font-medium text-stratum-ink truncate">
                    {agent?.displayName ?? b.agentId}
                  </span>
                  {b.autoSearch ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-stratum-blue">
                      AUTO
                    </span>
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-stratum-muted">
                      OPT-IN
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => unbindMutation.mutate(b.agentId)}
                  disabled={unbindMutation.isPending}
                  className="font-mono text-[9px] uppercase tracking-[0.14em] text-stratum-muted hover:text-stratum-danger transition-colors disabled:opacity-40"
                >
                  解除
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="font-body text-[11px] text-stratum-muted italic py-1">
          还未绑定任何 agent。绑定后该 agent 每次被调用都会自动检索此 KB。
        </p>
      )}

      {availableAgents.length > 0 ? (
        <div className="flex items-center gap-2">
          <select
            value={pickerAgent}
            onChange={(e) => setPickerAgent(e.target.value)}
            disabled={bindMutation.isPending}
            className="flex-1 rounded-lg border border-stratum-line bg-white px-2 py-1.5 font-body text-[11px] text-stratum-ink focus:border-stratum-blue focus:outline-none"
          >
            <option value="">选择要绑定的 agent…</option>
            {availableAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} · {a.shortDescription.slice(0, 30)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 font-body text-[10px] text-stratum-muted whitespace-nowrap">
            <input
              type="checkbox"
              checked={autoSearch}
              onChange={(e) => setAutoSearch(e.target.checked)}
              className="h-3 w-3"
            />
            自动检索
          </label>
          <button
            type="button"
            onClick={() => bindMutation.mutate()}
            disabled={!pickerAgent || bindMutation.isPending}
            className="rounded-lg bg-stratum-navy px-3 py-1.5 font-body text-[11px] font-semibold text-white hover:bg-stratum-navy-soft transition-colors disabled:opacity-40"
          >
            {bindMutation.isPending ? '绑定中…' : '绑定'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ============================================================================
// F7 · Document list panel
// ============================================================================

interface KbDocumentRow {
  id: string
  title: string
  contentType: string
  sourceUrl: string | null
  sizeChars: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function formatChars(n: number): string {
  if (n < 1000) return `${n} 字`
  if (n < 100_000) return `${(n / 1000).toFixed(1)}K 字`
  return `${(n / 1000).toFixed(0)}K 字`
}

function contentTypeBadge(ct: string): { label: string; color: string } {
  if (ct.includes('pdf')) return { label: 'PDF', color: 'bg-stratum-danger-wash text-stratum-danger' }
  if (ct.includes('word')) return { label: 'DOCX', color: 'bg-stratum-blue/10 text-stratum-blue' }
  if (ct.includes('sheet')) return { label: 'XLSX', color: 'bg-stratum-ok-wash text-stratum-ok' }
  if (ct.includes('markdown')) return { label: 'MD', color: 'bg-stratum-surface-low text-stratum-navy' }
  if (ct.includes('html')) return { label: 'HTML', color: 'bg-stratum-surface-low text-stratum-navy' }
  if (ct.includes('json')) return { label: 'JSON', color: 'bg-stratum-surface-low text-stratum-navy' }
  return { label: 'TXT', color: 'bg-stratum-surface-low text-stratum-muted' }
}

function KbDocumentListPanel({ workspaceId, kbId }: { workspaceId: string; kbId: string }) {
  const qc = useQueryClient()
  const { data: docs, isLoading } = useQuery({
    queryKey: ['kbDocuments', workspaceId, kbId],
    queryFn: async () => {
      const client = getGraphQLClient()
      const r = await client.request<{ knowledgeBaseDocuments: KbDocumentRow[] }>(
        KB_LIST_DOCUMENTS,
        { workspaceId, kbId }
      )
      return r.knowledgeBaseDocuments
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const client = getGraphQLClient()
      await client.request(KB_DELETE_DOCUMENT, { workspaceId, kbId, docId })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kbDocuments', workspaceId, kbId] })
    }
  })

  const handleDelete = (doc: KbDocumentRow) => {
    if (!window.confirm(`删除文档「${doc.title}」？此操作不可恢复（chunks 一并删除）。`)) return
    deleteMutation.mutate(doc.id)
  }

  return (
    <div className="mt-4 pt-3 border-t border-stratum-line">
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
          文档列表 · 已入库
        </p>
        {docs && docs.length > 0 ? (
          <span className="font-mono text-[9px] tabular-nums text-stratum-muted">
            {docs.length} 项
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="font-body text-[11px] text-stratum-muted py-1">加载中…</p>
      ) : !docs || docs.length === 0 ? (
        <p className="font-body text-[11px] text-stratum-muted italic py-1">
          KB 是空的——上面添加文本/URL/文件后会出现在这里。
        </p>
      ) : (
        <ul className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
          {docs.map((d) => {
            const badge = contentTypeBadge(d.contentType)
            return (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-stratum-surface-low/40 px-3 py-1.5 hover:bg-stratum-surface-low/70 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={`font-mono text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded shrink-0 ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                  <span
                    className="font-body text-[12px] text-stratum-ink truncate"
                    title={d.title}
                  >
                    {d.title}
                  </span>
                </div>
                <span className="font-mono text-[10px] tabular-nums text-stratum-muted shrink-0">
                  {formatChars(d.sizeChars)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(d)}
                  disabled={deleteMutation.isPending}
                  aria-label={`删除 ${d.title}`}
                  className="p-1 rounded text-stratum-muted hover:text-stratum-danger hover:bg-stratum-danger-wash/40 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
