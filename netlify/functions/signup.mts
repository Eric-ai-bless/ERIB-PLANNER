import { admin, verifyRequestOrigin, AuthError } from '@netlify/identity'
import type { Config } from '@netlify/functions'

// Creates an account with first name, second name, email and password.
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
  const username = `${firstName} ${lastName}`
  if (!EMAIL_RE.test(email) || email.length > 254)
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 422 })
  if (password.length < 6 || password.length > 128)
    return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 422 })

  try {
    const user = await admin.createUser({
      email,
      password,
      data: { user_metadata: { username, first_name: firstName, last_name: lastName, full_name: username } },
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
