/**
 * User-skill barrel export (2026-04-28).
 *
 * Two consumers:
 *   - server: `UserSkillExtractor` service uses prompts + parser
 *   - server: `buildUserSkillPrompt` helper uses `renderUserSkillBlock`
 *
 * Web/Next.js code currently does not import this module — user-skill
 * fetching is server-only (Apollo resolver / Next.js API route call
 * `buildUserSkillPrompt` and pass the rendered string into the
 * coach/wizard request as `userSkillBlock`).
 */
export * from './schemas.js'
export * from './prompts.js'
export * from './parser.js'
