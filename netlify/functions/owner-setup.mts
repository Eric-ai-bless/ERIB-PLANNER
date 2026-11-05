import type { Config } from '@netlify/functions'
import { admin as idAdmin } from '@netlify/identity'
import { getSettings, OWNER_EMAIL, setSetting } from '../../db/subs.js'

// One-time setup of the owner (admin) password from the ADMIN_INITIAL_PASSWORD secret.
// Called only when the owner's sign-in is rejected and the typed password equals the initial
// admin password. It runs at most once; after that (or after the owner changes the password
// from the Subscription page) it does nothing, so a chosen password is never overwritten.
const OWNER_SETUP_FLAG = 'owner_password_set_v2'

export default async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  const initial = process.env.ADMIN_INITIAL_PASSWORD || ''
  const body: any = await req.json().catch(() => ({}))
  const typed = String(body?.password ?? '')
  if (!initial || typed !== initial) return Response.json({ done: false })
  try {
    const settings = await getSettings()
    if (settings[OWNER_SETUP_FLAG]) return Response.json({ done: false })
    let owner = null
    for (let page = 1; page <= 20 && !owner; page++) {
      const batch = await idAdmin.listUsers({ page, perPage: 100 })
      owner = batch.find((u) => (u.email || '').toLowerCase() === OWNER_EMAIL) || null
      if (batch.length < 100) break
    }
    if (owner) await idAdmin.updateUser(owner.id, { password: initial, confirm: true })
    else await idAdmin.createUser({ email: OWNER_EMAIL, password: initial, data: { user_metadata: { username: 'Admin', full_name: 'Admin' } } })
    await setSetting(OWNER_SETUP_FLAG, new Date().toISOString())
    return Response.json({ done: true })
  } catch (e) {
    console.error('Owner password setup failed', e)
    return Response.json({ done: false }, { status: 500 })
  }
}

export const config: Config = { path: '/api/owner-setup' }
