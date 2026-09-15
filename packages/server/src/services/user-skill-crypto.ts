/**
 * App-level AES-256-GCM encryption for user-skill content (2026-04-28).
 *
 * Why: user-skill rows can carry derived personal information ("5y B2B
 * SaaS background", "tends to skip risk analysis"). With no UI for user
 * inspection/correction, the system has heightened responsibility to
 * protect the data at rest.
 *
 * Scope: encrypts ONLY the row fields that contain inferred personal
 * content — `title`, `content`, and the same fields nested inside
 * `metadata.revisionTrend` (audit trail). Non-sensitive fields (userId,
 * workspaceId, scope, kind, tags, confidence, importance, timestamps,
 * embeddings) are stored in plaintext for filtering / ranking.
 *
 * RESIDUAL LEAK: pgvector embeddings are computed on plaintext content
 * before encryption; the embedding vectors are NOT encrypted (they need
 * to be queryable for `<=>` similarity search). Recent literature (Pan
 * et al. 2020+) shows embedding inversion is feasible for short text.
 * Mitigation in future work: redact named entities before embedding, or
 * adopt searchable-encryption schemes. Documented in README for paper.
 *
 * Key management: env `USER_SKILL_ENCRYPTION_KEY` (64 hex chars = 32
 * bytes for AES-256). If unset, encryption is a no-op and a one-time
 * warning is logged at module load. Existing plaintext rows pass
 * through `decryptIfNeeded` unchanged (no `enc:v1:` prefix → return
 * value as-is). This keeps backward-compat with rows written before
 * this commit.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { createAuditLogger } from '@starlink/shared'

const auditLogger = createAuditLogger('packages/server:services:user-skill-crypto')

const PREFIX = 'enc:v1:'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12 // GCM standard
const TAG_BYTES = 16

let cachedKey: Buffer | null | undefined

/**
 * Resolve the master key once. Memoised across calls. Returns null when
 * the env var is missing or invalid (in which case encryption no-ops).
 */
function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey
  const raw = process.env.USER_SKILL_ENCRYPTION_KEY
  if (!raw) {
    auditLogger.warn({
      action: 'user-skill-crypto.disabled',
      metadata: { reason: 'USER_SKILL_ENCRYPTION_KEY env not set' }
    })
    cachedKey = null
    return null
  }
  let buf: Buffer
  try {
    // Accept either 64-hex (32 bytes) or 44-char base64 (32 bytes after decode).
    buf = /^[0-9a-fA-F]+$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  } catch {
    auditLogger.warn({
      action: 'user-skill-crypto.disabled',
      metadata: { reason: 'USER_SKILL_ENCRYPTION_KEY decode failed' }
    })
    cachedKey = null
    return null
  }
  if (buf.length !== 32) {
    auditLogger.warn({
      action: 'user-skill-crypto.disabled',
      metadata: { reason: `key length ${buf.length} bytes; expected 32 (256 bits)` }
    })
    cachedKey = null
    return null
  }
  cachedKey = buf
  return buf
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/**
 * Encrypt a string. No-op (returns plaintext unchanged) when no key is
 * configured. Throws on actual crypto errors so the caller can decide —
 * silent failure here would mask config/key bugs.
 */
export function encryptIfConfigured(plaintext: string | null | undefined): string {
  if (plaintext == null || plaintext === '') return plaintext ?? ''
  const key = getKey()
  if (!key) return plaintext
  // Idempotent: if caller passes already-encrypted text, leave as-is.
  if (isEncrypted(plaintext)) return plaintext

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: prefix + base64(iv || ct || tag) — single field, easy to
  // detect, easy to migrate to v2 by changing the prefix later.
  return PREFIX + Buffer.concat([iv, ct, tag]).toString('base64')
}

/**
 * Decrypt a value if it's prefixed; otherwise pass through unchanged.
 * Returns plaintext on success. On any error (key missing, tampered
 * ciphertext) returns a placeholder + logs — the row's content is
 * unrecoverable but the rest of the read path keeps working.
 */
export function decryptIfNeeded(value: string | null | undefined): string {
  if (value == null) return ''
  if (!isEncrypted(value)) return value
  const key = getKey()
  if (!key) {
    // Encrypted row but no key configured — operator deconfigured the
    // key after some rows were already encrypted. Log + return placeholder.
    auditLogger.warn({
      action: 'user-skill-crypto.decrypt.no-key',
      metadata: { preview: value.slice(0, 16) }
    })
    return '[encrypted:no-key]'
  }
  try {
    const blob = Buffer.from(value.slice(PREFIX.length), 'base64')
    const iv = blob.subarray(0, IV_BYTES)
    const tag = blob.subarray(blob.length - TAG_BYTES)
    const ct = blob.subarray(IV_BYTES, blob.length - TAG_BYTES)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch (err) {
    auditLogger.warn({
      action: 'user-skill-crypto.decrypt.failed',
      metadata: { message: err instanceof Error ? err.message : String(err) }
    })
    return '[encrypted:tampered]'
  }
}

/**
 * Walk the metadata object and (en|de)crypt the fields that nest
 * sensitive content. Currently: `revisionTrend[].from.title/content`,
 * `revisionTrend[].to.title/content`, `revisionTrend[].reason`.
 * `observedEvidence` is plaintext (trace IDs are pseudonymous).
 */
type MetadataLike = Record<string, unknown> | null | undefined

interface RevisionEntry {
  from?: { title?: string | null; content?: string | null } | null
  to?: { title?: string | null; content?: string | null } | null
  reason?: string | null
}

export function encryptUserSkillMetadata(meta: MetadataLike): MetadataLike {
  if (!meta || !isEncryptionConfigured()) return meta
  const trend = meta.revisionTrend
  if (!Array.isArray(trend)) return meta
  return {
    ...meta,
    revisionTrend: trend.map((rawEntry: unknown) => {
      const entry = rawEntry as RevisionEntry
      return {
        ...entry,
        from: entry?.from
          ? {
              ...entry.from,
              title: encryptIfConfigured(entry.from.title ?? ''),
              content: encryptIfConfigured(entry.from.content ?? '')
            }
          : entry?.from,
        to: entry?.to
          ? {
              ...entry.to,
              title: encryptIfConfigured(entry.to.title ?? ''),
              content: encryptIfConfigured(entry.to.content ?? '')
            }
          : entry?.to,
        reason: entry?.reason ? encryptIfConfigured(entry.reason) : entry?.reason
      }
    })
  }
}

export function decryptUserSkillMetadata(meta: MetadataLike): MetadataLike {
  if (!meta) return meta
  const trend = meta.revisionTrend
  if (!Array.isArray(trend)) return meta
  return {
    ...meta,
    revisionTrend: trend.map((rawEntry: unknown) => {
      const entry = rawEntry as RevisionEntry
      return {
        ...entry,
        from: entry?.from
          ? {
              ...entry.from,
              title: decryptIfNeeded(entry.from.title ?? ''),
              content: decryptIfNeeded(entry.from.content ?? '')
            }
          : entry?.from,
        to: entry?.to
          ? {
              ...entry.to,
              title: decryptIfNeeded(entry.to.title ?? ''),
              content: decryptIfNeeded(entry.to.content ?? '')
            }
          : entry?.to,
        reason: entry?.reason ? decryptIfNeeded(entry.reason) : entry?.reason
      }
    })
  }
}
