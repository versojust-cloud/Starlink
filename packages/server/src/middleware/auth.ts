/**
 * Gateway authentication middleware.
 *
 * Two modes, controlled by AUTH_MODE env var:
 *   - "disabled" (default): legacy x-user-id header trusted, dev workflow preserved.
 *   - "jwt":               HS256 JWT in `Authorization: Bearer <token>` is required.
 *
 * Hand-rolled HMAC-SHA256 implementation — zero new dependencies.
 * Token shape (canonical JWT):
 *   header  = { alg: "HS256", typ: "JWT" }
 *   payload = { userId: string, workspaceIds: string[] | "all", exp?: number, iat?: number }
 *   signature = HMAC_SHA256(base64url(header) + "." + base64url(payload), AUTH_JWT_SECRET)
 *
 * NOTE: For production, consider migrating to the `jose` package once it can be installed.
 *       The package.json dependency entry is already present, but require explicit `pnpm install`.
 */

import crypto from 'node:crypto'
import type { Request } from 'express'

export type AuthMode = 'disabled' | 'jwt'

export type AuthIdentity = {
  userId: string
  /** Either a finite list of workspace IDs the caller may access, or 'all' (admin/dev). */
  allowedWorkspaceIds: string[] | 'all'
}

export class AuthError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode = 401) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}

function getAuthMode(): AuthMode {
  const mode = (process.env.AUTH_MODE ?? 'disabled').toLowerCase()
  return mode === 'jwt' ? 'jwt' : 'disabled'
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

type JwtPayload = {
  userId: string
  workspaceIds: string[] | 'all'
  exp?: number
  iat?: number
}

function verifyHs256Jwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) throw new AuthError('Malformed JWT (expected 3 segments)')
  const [headerB64, payloadB64, signatureB64] = parts

  // Verify signature.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  if (!timingSafeEqualStr(expected, signatureB64)) {
    throw new AuthError('JWT signature verification failed')
  }

  // Verify header alg.
  let header: { alg?: string }
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { alg?: string }
  } catch {
    throw new AuthError('Malformed JWT header')
  }
  if (header.alg !== 'HS256') throw new AuthError(`Unsupported JWT alg: ${header.alg ?? '<missing>'}`)

  // Decode + validate payload.
  let payload: JwtPayload
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as JwtPayload
  } catch {
    throw new AuthError('Malformed JWT payload')
  }
  if (typeof payload.userId !== 'string' || payload.userId.length === 0) {
    throw new AuthError('JWT payload missing userId')
  }
  if (
    payload.workspaceIds !== 'all' &&
    (!Array.isArray(payload.workspaceIds) || payload.workspaceIds.some((w) => typeof w !== 'string'))
  ) {
    throw new AuthError('JWT payload workspaceIds must be string[] or "all"')
  }
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
    throw new AuthError('JWT expired')
  }
  return payload
}

function readBearer(headerValue: string | undefined): string | null {
  if (!headerValue) return null
  const m = /^Bearer\s+(.+)$/i.exec(headerValue.trim())
  return m ? m[1].trim() : null
}

/**
 * Resolves identity from a raw Authorization header value and a legacy x-user-id fallback.
 * Throws AuthError on invalid token in jwt mode.
 */
export function authenticate(
  authorizationHeader: string | undefined,
  legacyUserIdHeader: string | undefined
): AuthIdentity {
  const mode = getAuthMode()

  if (mode === 'jwt') {
    const token = readBearer(authorizationHeader)
    if (!token) throw new AuthError('Missing Bearer token (AUTH_MODE=jwt)')
    const secret = process.env.AUTH_JWT_SECRET
    if (!secret || secret.length < 16) {
      throw new AuthError('Server misconfigured: AUTH_JWT_SECRET missing or too short', 500)
    }
    const payload = verifyHs256Jwt(token, secret)
    return {
      userId: payload.userId,
      allowedWorkspaceIds: payload.workspaceIds
    }
  }

  // disabled mode — preserve dev workflow with x-user-id legacy header.
  const userId = legacyUserIdHeader && legacyUserIdHeader.length > 0 ? legacyUserIdHeader : 'anonymous'
  return { userId, allowedWorkspaceIds: 'all' }
}

export function authenticateExpress(req: Request): AuthIdentity {
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const legacy = typeof req.headers['x-user-id'] === 'string' ? (req.headers['x-user-id'] as string) : undefined
  return authenticate(auth, legacy)
}

export function authenticateConnectionParams(params: Record<string, unknown> | undefined): AuthIdentity {
  if (!params) return authenticate(undefined, undefined)
  const auth =
    typeof params.authorization === 'string'
      ? (params.authorization as string)
      : typeof params.Authorization === 'string'
        ? (params.Authorization as string)
        : undefined
  const legacy = typeof params['x-user-id'] === 'string' ? (params['x-user-id'] as string) : undefined
  return authenticate(auth, legacy)
}

/** Optional helper for tests / scripts: produce a signed HS256 token. */
export function signHs256Jwt(payload: JwtPayload, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  const headerB64 = enc(header)
  const payloadB64 = enc(payload)
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${headerB64}.${payloadB64}.${sig}`
}
