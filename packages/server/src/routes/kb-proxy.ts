/**
 * P11.18 · KB upload route — direct in-process via KbStore.
 *
 * History: previously this proxied to a separate "task service" at
 * port 4001 (DEFAULT_TASK_SERVICE_BASE_URL). That service was
 * deprecated when KbStore moved in-process; the proxy was left
 * dangling, returning 502 on every upload attempt. Frontend showed
 * "教练响应失败 / 上传失败" when users tried to add a KB document.
 *
 * Fix: handle the file upload directly here. multer parses multipart,
 * we stream the buffer into KbStore.addDocument which extracts text +
 * chunks + embeds + persists. Same end result, no extra hop.
 *
 * Endpoints:
 *   POST /kb/:kbId/import/file  · multipart/form-data { file }
 *   POST /kb/:kbId/import/text  · application/json    { title, content, contentType? }
 *   POST /kb/:kbId/import/url   · application/json    { url, title? }
 */

import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { getKbStore } from '../application/kb-store.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  // 50MB cap — protects the worker from giant uploads. Adjust via env if you
  // need bigger documents (DOCX with embedded images can hit ~30MB).
  limits: { fileSize: Number(process.env.KB_MAX_UPLOAD_BYTES) || 50 * 1024 * 1024 }
})

function getWorkspaceId(req: Request): string | null {
  const wid = typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() : ''
  return wid.length > 0 ? wid : null
}

router.post('/:kbId/import/file', upload.single('file'), async (req, res) => {
  const { kbId } = req.params
  const workspaceId = getWorkspaceId(req)
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (!workspaceId) {
    return res.status(400).json({
      ok: false,
      error: { code: 'MISSING_WORKSPACE', message: 'workspaceId query param is required' }
    })
  }
  if (!file) {
    return res.status(400).json({
      ok: false,
      error: { code: 'MISSING_FILE', message: 'multipart/form-data with `file` field is required' }
    })
  }
  try {
    const store = getKbStore()
    const result = await store.addDocument({
      kbId,
      workspaceId,
      title: file.originalname || 'Untitled document',
      content: file.buffer,
      contentType: file.mimetype || 'application/octet-stream',
      fileName: file.originalname,
      metadata: { uploadedAt: new Date().toISOString(), sizeBytes: file.size }
    })
    return res.status(200).json({
      ok: true,
      docId: result.docId,
      chunkCount: result.chunkCount,
      title: file.originalname
    })
  } catch (err) {
    return handleErr(res, err)
  }
})

router.post('/:kbId/import/text', async (req: Request, res: Response) => {
  const { kbId } = req.params
  const workspaceId = getWorkspaceId(req)
  if (!workspaceId) {
    return res.status(400).json({
      ok: false,
      error: { code: 'MISSING_WORKSPACE', message: 'workspaceId query param is required' }
    })
  }
  const body = (req.body ?? {}) as { title?: string; content?: string; contentType?: string }
  if (!body.content || typeof body.content !== 'string') {
    return res.status(400).json({
      ok: false,
      error: { code: 'MISSING_CONTENT', message: 'JSON body { content } is required' }
    })
  }
  try {
    const store = getKbStore()
    const result = await store.addDocument({
      kbId,
      workspaceId,
      title: body.title || '(untitled)',
      content: body.content,
      contentType: body.contentType || 'text/plain',
      metadata: { uploadedAt: new Date().toISOString() }
    })
    return res.status(200).json({
      ok: true,
      docId: result.docId,
      chunkCount: result.chunkCount,
      title: body.title || null
    })
  } catch (err) {
    return handleErr(res, err)
  }
})

router.post('/:kbId/import/url', async (req: Request, res: Response) => {
  const { kbId } = req.params
  const workspaceId = getWorkspaceId(req)
  if (!workspaceId) {
    return res.status(400).json({
      ok: false,
      error: { code: 'MISSING_WORKSPACE', message: 'workspaceId query param is required' }
    })
  }
  const body = (req.body ?? {}) as { url?: string; title?: string }
  if (!body.url || typeof body.url !== 'string' || !/^https?:\/\//i.test(body.url)) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_URL', message: 'JSON body { url } must be http(s) absolute URL' }
    })
  }
  try {
    const r = await fetch(body.url, {
      headers: { 'User-Agent': 'starlink-kb-importer/1.0' },
      redirect: 'follow'
    })
    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        error: { code: 'UPSTREAM_FETCH_FAILED', message: `${r.status} ${r.statusText}` }
      })
    }
    const ct = r.headers.get('content-type') || 'text/html'
    const buf = Buffer.from(await r.arrayBuffer())
    const store = getKbStore()
    const result = await store.addDocument({
      kbId,
      workspaceId,
      title: body.title || body.url,
      content: buf,
      contentType: ct,
      sourceUrl: body.url,
      metadata: { fetchedAt: new Date().toISOString(), sizeBytes: buf.byteLength }
    })
    return res.status(200).json({
      ok: true,
      docId: result.docId,
      chunkCount: result.chunkCount,
      title: body.title || body.url
    })
  } catch (err) {
    return handleErr(res, err)
  }
})

function handleErr(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  console.error('[kb-import] error:', message)
  return res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL', message }
  })
}

export { router as kbProxyRouter }
