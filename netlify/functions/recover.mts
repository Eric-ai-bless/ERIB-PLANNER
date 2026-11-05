import type { Config } from '@netlify/functions'
import { admin as idAdmin, verifyRequestOrigin } from '@netlify/identity'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { resetAttempts, securityAnswers } from '../../db/schema.js'
import { matches, normBirthday, normFood } from '../../db/security.js'

// Forgot password without email: the user proves who they are with their birthday OR favorite food,
// then chooses a new password.
//   POST /api/recover { email, method: 'birthday' | 'food', answer, password }
const MAX_FAILURES = 5
const WINDOW_MS = 30 * 60 * 1000
const err = (m: string, s = 400) => Response.json({ error: m }, { status: s })

export default async (req: Request) => {
  if (req.method !== 'POST') return err('Method not allowed', 405)
  try {
    verifyRequestOrigin(req)
  } catch {
    return err('Request not allowed', 403)
  }
  const b: any = await req.json().catch(() => ({}))
  const email = String(b?.email ?? '').trim().toLowerCase().slice(0, 254)
  const method = b?.method === 'food' ? 'food' : 'birthday'
  const answer = method === 'food' ? normFood(b?.answer) : normBirthday(b?.answer)
  const password = String(b?.password ?? '')
  if (!email) return err('Enter your account email.', 422)
  if (!answer) return err(method === 'food' ? 'Enter your favorite food.' : 'Enter your birthday.', 422)
  if (password.length < 6 || password.length > 128) return err('The new password must be at least 6 characters.', 422)

  const [att] = await db.select().from(resetAttempts).where(eq(resetAttempts.email, email))
  const fresh = !att || Date.now() - new Date(att.windowStart).getTime() > WINDOW_MS
  if (!fresh && att.failures >= MAX_FAILURES)
    return err('Too many wrong answers. Please wait 30 minutes and try again, or ask the admin to reset your password.', 429)

  const [row] = await db.select().from(securityAnswers).where(eq(securityAnswers.email, email))
  const ok = row && (await matches(answer, row.salt, method === 'food' ? row.foodHash : row.birthdayHash))
  if (!ok) {
    const v = fresh ? { failures: 1, windowStart: new Date() } : { failures: sql`${resetAttempts.failures} + 1` }
    await db.insert(resetAttempts).values({ email, failures: 1, windowStart: new Date() }).onConflictDoUpdate({ target: resetAttempts.email, set: v })
    if (!row)
      return err('This email has no birthday or favorite food saved, or no account exists for it. Ask the admin to reset your password.', 404)
    return err(method === 'food' ? 'That favorite food does not match our records.' : 'That birthday does not match our records.', 403)
  }

  const user = await idAdmin.getUser(row.userId).catch(() => null)
  if (!user || (user.email || '').toLowerCase() !== email) return err('This account could not be found. Ask the admin for help.', 404)
  try {
    await idAdmin.updateUser(row.userId, { password })
  } catch (e) {
    console.error('Password reset failed', e)
    const m = e instanceof Error ? e.message : ''
    return err(/password/i.test(m) && m.length < 200 ? m : 'Could not save the new password. Please try again.', 500)
  }
  await db.delete(resetAttempts).where(eq(resetAttempts.email, email))
  return Response.json({ ok: true })
}

export const config: Config = { path: '/api/recover' }
