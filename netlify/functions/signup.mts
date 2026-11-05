import { admin, verifyRequestOrigin, AuthError } from '@netlify/identity'
import type { Config } from '@netlify/functions'
import { eq } from 'drizzle-orm'
import { normBirthday, normFood, saveAnswers } from '../../db/security.js'
import { getSettings, OWNER_EMAIL, setSetting } from '../../db/subs.js'
import { db } from '../../db/index.js'
import { lessonPlans, securityAnswers, usage, userSubscriptions } from '../../db/schema.js'

// The owner asked for their old account to be removed and recreated. The first sign-up with the
// owner email replaces the existing account once (lesson plans are kept and moved to the new
// account). After that this flag is set and the owner email behaves like any other email.
const OWNER_RECREATE_FLAG = 'owner_recreated_v1'

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 50; page++) {
    const batch = await admin.listUsers({ page, perPage: 100 })
    const u = batch.find((x) => (x.email || '').toLowerCase() === email)
    if (u) return u
    if (batch.length < 100) break
  }
  return null
}

// Creates an account with first name, second name, email, password, and the birthday /
// favorite food answers used to reset a forgotten password.
// The username is the user's first and second name only (e.g. "Eric Bless").
// Accounts are created already confirmed, so no verification email is sent.
const NAME_RE = /^\p{L}[\p{L}'-]{1,29}$/u
const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  try {
    verifyRequestOrigin(req)
  } catch {
    return Response.json({ error: 'Request not allowed' }, { status: 403 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {}
  const firstName = cap(String(body?.firstName ?? '').trim())
  const lastName = cap(String(body?.lastName ?? '').trim())
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')

  if (!NAME_RE.test(firstName) || !NAME_RE.test(lastName))
    return Response.json(
      { error: 'Please enter your first name and second name (letters only, one name in each box).' },
      { status: 422 },
    )
  if (!normBirthday(body?.birthday))
    return Response.json({ error: 'Please enter your birthday. It is used to reset your password if you forget it.' }, { status: 422 })
  if (normFood(body?.food).length < 2)
    return Response.json({ error: 'Please enter your favorite food. It is used to reset your password if you forget it.' }, { status: 422 })
  const username = `${firstName} ${lastName}`
  if (!EMAIL_RE.test(email) || email.length > 254)
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 422 })
  if (password.length < 6 || password.length > 128)
    return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 422 })

  // One-time replacement of the existing owner account.
  let replacedId = ''
  if (email === OWNER_EMAIL) {
    try {
      const settings = await getSettings()
      if (!settings[OWNER_RECREATE_FLAG]) {
        const old = await findUserByEmail(email)
        if (old) {
          await admin.deleteUser(old.id)
          replacedId = old.id
        }
      }
    } catch (e) {
      console.error('Replacing the owner account failed', e)
    }
  }

  try {
    const user = await admin.createUser({
      email,
      password,
      data: { user_metadata: { username, first_name: firstName, last_name: lastName, full_name: username } },
    })
    try {
      await saveAnswers(user.id, email, body?.birthday, body?.food)
    } catch (e) {
      console.error('Saving security answers failed', e)
    }
    if (email === OWNER_EMAIL) {
      try {
        // Never run the one-time replacement (or the initial admin password setup) again.
        await setSetting(OWNER_RECREATE_FLAG, new Date().toISOString())
        await setSetting('owner_password_set_v2', new Date().toISOString())
        if (replacedId) {
          await db.update(lessonPlans).set({ userId: user.id }).where(eq(lessonPlans.userId, replacedId))
          await db.delete(securityAnswers).where(eq(securityAnswers.userId, replacedId))
          await db.delete(usage).where(eq(usage.userId, replacedId))
          await db.delete(userSubscriptions).where(eq(userSubscriptions.userId, replacedId))
        }
      } catch (e) {
        console.error('Finishing the owner account replacement failed', e)
      }
    }
    return Response.json({ ok: true, id: user.id })
  } catch (e) {
    const msg = e instanceof AuthError ? e.message : ''
    if (/already|registered|exists/i.test(msg))
      return Response.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 })
    console.error('Signup failed', e)
    return Response.json({ error: 'Could not create the account. Please try again.' }, { status: 500 })
  }
}

export const config: Config = { path: '/api/signup' }
