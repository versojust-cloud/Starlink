import { Router } from 'express'
import { ZodError } from 'zod'
import { getTaskEventStore } from '../context/index.js'

const router = Router()
const taskEventStore = getTaskEventStore()

function isAuthorized(tokenHeader: string | undefined): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN
  if (!expected) return true
  return tokenHeader === expected
}

router.post('/task-events', async (req, res) => {
  const tokenHeader = typeof req.headers['x-internal-token'] === 'string'
    ? req.headers['x-internal-token']
    : undefined

  if (!isAuthorized(tokenHeader)) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid internal token'
      }
    })
  }

  try {
    const result = await taskEventStore.ingest(req.body)
    if (result.duplicate) {
      return res.status(200).json({
        ok: true,
        data: { deduplicated: true }
      })
    }

    return res.status(202).json({
      ok: true,
      data: { accepted: true }
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_TASK_EVENT',
          message: 'Task event payload validation failed',
          details: { issues: error.issues }
        }
      })
    }

    return res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to ingest task event'
      }
    })
  }
})

export { router as internalRouter }
