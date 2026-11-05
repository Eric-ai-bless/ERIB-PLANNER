import type { Config } from '@netlify/functions'
import { admin as idAdmin } from '@netlify/identity'
import { getSettings, OWNER_EMAIL, setSetting } from '../../db/subs.js'

// One-time setup of the owner (admin) password from the ADMIN_INITIAL_PASSWORD secret.
// It runs once, the first time someone signs in with the owner email; after that it does nothing,
// so the owner can change the password later from the Subscription page.
const FLAG = 'owner_password_set'

export default async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  const initial = process.env.ADMIN_INITIAL_PASSWORD || ''
  if (!initial) return Response.json({ done: false })
  const settings = await getSettings()
  if (settings[FLAG]) return Response.json({ done: false })
  try {
    let owner = null
    for (let page = 1; page <= 20 && !owner; page++) {
      const batch = await idAdmin.listUsers({ page, perPage: 100 })
      owner = batch.find((u) => (u.email || '').toLowerCase() === OWNER_EMAIL) || null
      if (batch.length < 100) break
    }
    if (owner) await idAdmin.updateUser(owner.id, { password: initial })
    else await idAdmin.createUser({ email: OWNER_EMAIL, password: initial, data: { user_metadata: { username: 'Admin', full_name: 'Admin' } } })
    await setSetting(FLAG, new Date().toISOString())
    return Response.json({ done: true })
  } catch (e) {
    console.error('Owner password setup failed', e)
    return Response.json({ done: false }, { status: 500 })
  }
}

export const config: Config = { path: '/api/owner-setup' }
