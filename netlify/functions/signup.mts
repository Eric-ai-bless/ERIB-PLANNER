import { admin, verifyRequestOrigin, AuthError } from '@netlify/identity'
import type { Config } from '@netlify/functions'

// Creates an account with username, email and password.
// Accounts are created already confirmed, so no verification email is sent.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function usernameTaken(username: string) {
  const wanted = username.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const users = await admin.listUsers({ page, perPage: 500 })
    if (users.some((u) => String(u.userMetadata?.username ?? '').toLowerCase() === wanted)) return true
    if (users.length < 500) break
  }
  return false
}

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
  const username = String(body?.username ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')

  if (!USERNAME_RE.test(username))
    return Response.json(
      { error: 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.' },
      { status: 422 },
    )
  if (!EMAIL_RE.test(email) || email.length > 254)
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 422 })
  if (password.length < 6 || password.length > 128)
    return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 422 })

  try {
    if (await usernameTaken(username))
      return Response.json({ error: 'That username is already taken.' }, { status: 409 })

    const user = await admin.createUser({
      email,
      password,
      data: { user_metadata: { username, full_name: username } },
    })
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
