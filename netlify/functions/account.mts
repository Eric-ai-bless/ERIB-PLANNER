import type { Config } from '@netlify/functions'
import { admin as idAdmin, getUser, verifyRequestOrigin } from '@netlify/identity'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { paymentMethods, securityAnswers, upgradeRequests } from '../../db/schema.js'
import { saveAnswers } from '../../db/security.js'
import { OWNER_EMAIL, SUSPENDED_MSG, ensurePlans, entitlement, getSettings, isAdmin, isSuspended, setSetting } from '../../db/subs.js'

// The signed-in user's subscription.
//   GET  /api/account  -> current plan, limits, this month's usage, plans, payment methods, my upgrade requests
//   POST /api/account  -> send an upgrade request { planId, paymentMethodId, reference, message }
//   POST /api/account {action:'setSecurity', birthday, food} -> save password-reset answers
//   POST /api/account {action:'changePassword', password}    -> change my password
const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

export default async (req: Request) => {
  const user = await getUser()
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 })

  if (req.method === 'GET') {
    const [ent, plans, pms, reqs, adm, settings, sec] = await Promise.all([
      entitlement(user.id),
      ensurePlans(),
      db.select().from(paymentMethods).where(eq(paymentMethods.active, true)).orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.id)),
      db.select().from(upgradeRequests).where(eq(upgradeRequests.userId, user.id)).orderBy(desc(upgradeRequests.createdAt)).limit(20),
      isAdmin(user),
      getSettings(),
      db.select({ id: securityAnswers.userId }).from(securityAnswers).where(eq(securityAnswers.userId, user.id)),
    ])
    return Response.json({
      ...ent,
      isAdmin: adm,
      email: user.email || '',
      plans: plans.filter((p) => p.active),
      paymentMethods: pms,
      requests: reqs,
      whatsapp: settings.whatsapp || '',
      hasSecurity: sec.length > 0,
    })
  }

  if (req.method === 'POST') {
    try {
      verifyRequestOrigin(req)
    } catch {
      return Response.json({ error: 'Request not allowed' }, { status: 403 })
    }
    const body: any = await req.json().catch(() => ({}))
    if (body?.action === 'setSecurity') {
      const msg = await saveAnswers(user.id, user.email || '', body.birthday, body.food)
      return msg ? Response.json({ error: msg }, { status: 422 }) : Response.json({ ok: true })
    }
    if (body?.action === 'changePassword') {
      const pw = String(body.password ?? '')
      if (pw.length < 6 || pw.length > 128) return Response.json({ error: 'The new password must be at least 6 characters.' }, { status: 422 })
      await idAdmin.updateUser(user.id, { password: pw })
      // The one-time initial admin password must never overwrite a password the owner chose.
      if ((user.email || '').toLowerCase() === OWNER_EMAIL) await setSetting('owner_password_set_v2', new Date().toISOString())
      return Response.json({ ok: true })
    }
    if (await isSuspended(user.id)) return Response.json({ error: SUSPENDED_MSG }, { status: 403 })
    const planId = Number(body?.planId) || 0
    const pmId = Number(body?.paymentMethodId) || null
    const plans = await ensurePlans()
    if (!plans.some((p) => p.id === planId && p.active)) return Response.json({ error: 'Please choose a plan.' }, { status: 422 })
    const [pending] = await db
      .select({ id: upgradeRequests.id })
      .from(upgradeRequests)
      .where(and(eq(upgradeRequests.userId, user.id), eq(upgradeRequests.status, 'pending')))
    if (pending) return Response.json({ error: 'You already have a request waiting for the admin. Please wait for it to be reviewed.' }, { status: 409 })
    const m = user.userMetadata || {}
    const [row] = await db
      .insert(upgradeRequests)
      .values({
        userId: user.id,
        email: user.email || '',
        name: String(m.username || m.full_name || user.name || ''),
        planId,
        paymentMethodId: pmId,
        reference: str(body?.reference, 120),
        message: str(body?.message, 500),
      })
      .returning()
    return Response.json(row, { status: 201 })
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}

export const config: Config = { path: '/api/account' }
