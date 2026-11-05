import type { Config } from '@netlify/functions'
import { admin as idAdmin, getUser, verifyRequestOrigin } from '@netlify/identity'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { lessonPlans, paymentMethods, payments, securityAnswers, subscriptionPlans, upgradeRequests, usage, userSubscriptions } from '../../db/schema.js'
import { OWNER_EMAIL, ensurePlans, getSettings, isAdmin, monthKey, resolve, setSetting } from '../../db/subs.js'

// Admin-only API.
//   GET  /api/admin           -> users (with plan & usage), plans, payment methods, upgrade requests
//   POST /api/admin {action}  -> savePlan, deletePlan, savePayment, deletePayment,
//                                 setUserPlan, setRole, suspendUser, deleteUser, decideRequest,
//                                 setPassword (temporary password for a user), saveMoney, deleteMoney (payments received), saveSettings (WhatsApp number)
const str = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n)
const lim = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.floor(Number(v)) || 0))
const err = (m: string, s = 400) => Response.json({ error: m }, { status: s })

async function allUsers() {
  const out = []
  for (let page = 1; page <= 20; page++) {
    const batch = await idAdmin.listUsers({ page, perPage: 100 })
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out
}

async function setPlan(userId: string, b: any) {
  const planId = Number(b.planId) || null
  const custom = !!b.customLimits
  const days = Number(b.days) || 0
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : days > 0 ? new Date(Date.now() + days * 864e5) : null
  const values = {
    planId,
    customLimits: custom,
    lessonLimit: custom ? lim(b.lessonLimit) : null,
    exerciseLimit: custom ? lim(b.exerciseLimit) : null,
    expiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null,
    note: str(b.note, 300),
    updatedAt: new Date(),
  }
  await db.insert(userSubscriptions).values({ userId, ...values }).onConflictDoUpdate({ target: userSubscriptions.userId, set: values })
  if (b.resetUsage) await db.delete(usage).where(and(eq(usage.userId, userId), eq(usage.month, monthKey())))
}

export default async (req: Request) => {
  const me = await getUser()
  if (!me) return err('Please sign in.', 401)
  if (!(await isAdmin(me))) return err('Admins only.', 403)

  if (req.method === 'GET') {
    const [users, plans, pms, reqs, subs, use, counts, money, settings] = await Promise.all([
      allUsers(),
      ensurePlans(),
      db.select().from(paymentMethods).orderBy(paymentMethods.sortOrder, paymentMethods.id),
      db.select().from(upgradeRequests).orderBy(desc(upgradeRequests.createdAt)).limit(200),
      db.select().from(userSubscriptions),
      db.select().from(usage).where(eq(usage.month, monthKey())),
      db.select({ userId: lessonPlans.userId, id: lessonPlans.id }).from(lessonPlans),
      db.select().from(payments).orderBy(desc(payments.paidAt), desc(payments.id)).limit(2000),
      getSettings(),
    ])
    const paid: Record<string, Record<string, number>> = {}
    money.forEach((p) => {
      if (!p.userId) return
      const t = (paid[p.userId] ||= {})
      t[p.currency] = (t[p.currency] || 0) + p.amount
    })
    const saved: Record<string, number> = {}
    counts.forEach((c) => (saved[c.userId] = (saved[c.userId] || 0) + 1))
    return Response.json({
      month: monthKey(),
      me: me.id,
      owner: OWNER_EMAIL,
      plans,
      paymentMethods: pms,
      requests: reqs,
      payments: money,
      settings: { whatsapp: settings.whatsapp || '' },
      users: users.map((u) => {
        const sub = subs.find((s) => s.userId === u.id)
        const us = use.find((x) => x.userId === u.id)
        const m = u.userMetadata || {}
        return {
          id: u.id,
          email: u.email,
          name: String(m.username || m.full_name || u.name || ''),
          createdAt: u.createdAt,
          lastSignInAt: u.lastSignInAt,
          isAdmin: (u.email || '').toLowerCase() === OWNER_EMAIL || !!u.roles?.includes('admin'),
          isOwner: (u.email || '').toLowerCase() === OWNER_EMAIL,
          sub: sub || null,
          ...resolve(plans, sub),
          used: { lessons: us?.lessons ?? 0, exercises: us?.exercises ?? 0 },
          saved: saved[u.id] || 0,
          suspended: !!sub?.suspended,
          suspendedReason: sub?.suspended ? sub.suspendedReason : '',
          paid: paid[u.id] || {},
        }
      }),
    })
  }

  if (req.method !== 'POST') return err('Method not allowed', 405)
  try {
    verifyRequestOrigin(req)
  } catch {
    return err('Request not allowed', 403)
  }
  const b: any = await req.json().catch(() => ({}))
  const id = Number(b.id) || 0

  switch (b.action) {
    case 'savePlan': {
      const name = str(b.name, 60)
      if (!name) return err('Plan name is required.')
      const v = {
        name,
        description: str(b.description, 300),
        price: Math.max(0, Math.floor(Number(b.price)) || 0),
        currency: str(b.currency, 8).toUpperCase() || 'RWF',
        durationDays: Math.max(1, Math.floor(Number(b.durationDays)) || 30),
        lessonLimit: lim(b.lessonLimit),
        exerciseLimit: lim(b.exerciseLimit),
        isDefault: !!b.isDefault,
        active: b.active !== false,
        sortOrder: Math.floor(Number(b.sortOrder)) || 0,
      }
      if (v.isDefault) v.active = true
      const [row] = id
        ? await db.update(subscriptionPlans).set(v).where(eq(subscriptionPlans.id, id)).returning()
        : await db.insert(subscriptionPlans).values(v).returning()
      if (!row) return err('Plan not found', 404)
      if (v.isDefault) {
        const others = (await ensurePlans()).filter((p) => p.id !== row.id && p.isDefault).map((p) => p.id)
        if (others.length) await db.update(subscriptionPlans).set({ isDefault: false }).where(inArray(subscriptionPlans.id, others))
      } else if (!(await ensurePlans()).some((p) => p.isDefault)) {
        await db.update(subscriptionPlans).set({ isDefault: true, active: true }).where(eq(subscriptionPlans.id, row.id))
      }
      return Response.json(row)
    }
    case 'deletePlan': {
      const plans = await ensurePlans()
      const p = plans.find((x) => x.id === id)
      if (!p) return err('Plan not found', 404)
      if (p.isDefault) return err('This is the default plan for new users. Make another plan the default first.')
      await db.update(userSubscriptions).set({ planId: null, updatedAt: new Date() }).where(eq(userSubscriptions.planId, id))
      await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id))
      return Response.json({ ok: true })
    }
    case 'savePayment': {
      const name = str(b.name, 80)
      if (!name) return err('Payment method name is required.')
      const dialCode = str(b.dialCode, 80).replace(/\s+/g, '')
      if (dialCode && !/^(\+?[0-9*#]|\{amount\})+$/.test(dialCode)) return err('The dial code can only contain digits, *, #, + and {amount} (e.g. *182*8*1*123456*{amount}#).')
      const v = { name, details: str(b.details, 1000), dialCode, active: b.active !== false, sortOrder: Math.floor(Number(b.sortOrder)) || 0 }
      const [row] = id
        ? await db.update(paymentMethods).set(v).where(eq(paymentMethods.id, id)).returning()
        : await db.insert(paymentMethods).values(v).returning()
      return row ? Response.json(row) : err('Payment method not found', 404)
    }
    case 'deletePayment':
      await db.delete(paymentMethods).where(eq(paymentMethods.id, id))
      return Response.json({ ok: true })
    case 'setUserPlan': {
      const uid = str(b.userId, 100)
      if (!uid) return err('Missing user')
      await setPlan(uid, b)
      return Response.json({ ok: true })
    }
    case 'setRole': {
      const uid = str(b.userId, 100)
      const u = await idAdmin.getUser(uid).catch(() => null)
      if (!u) return err('User not found', 404)
      if ((u.email || '').toLowerCase() === OWNER_EMAIL) return err('The owner account is always an admin.')
      if (uid === me.id && !b.admin) return err('You cannot remove your own admin access.')
      const roles = new Set(u.roles || [])
      b.admin ? roles.add('admin') : roles.delete('admin')
      await idAdmin.updateUser(uid, { app_metadata: { ...(u.appMetadata || {}), roles: [...roles] } })
      return Response.json({ ok: true })
    }
    case 'setPassword': {
      const uid = str(b.userId, 100)
      const pw = String(b.password ?? '')
      if (pw.length < 6 || pw.length > 128) return err('The password must be at least 6 characters.')
      const u = await idAdmin.getUser(uid).catch(() => null)
      if (!u) return err('User not found', 404)
      await idAdmin.updateUser(uid, { password: pw })
      return Response.json({ ok: true })
    }
    case 'suspendUser': {
      const uid = str(b.userId, 100)
      if (!uid) return err('Missing user')
      const stop = !!b.suspended
      if (stop) {
        if (uid === me.id) return err('You cannot stop your own account.')
        const u = await idAdmin.getUser(uid).catch(() => null)
        if (!u) return err('User not found', 404)
        if ((u.email || '').toLowerCase() === OWNER_EMAIL) return err('The owner account cannot be stopped.')
      }
      const v = { suspended: stop, suspendedReason: stop ? str(b.reason, 300) : '', updatedAt: new Date() }
      await db.insert(userSubscriptions).values({ userId: uid, ...v }).onConflictDoUpdate({ target: userSubscriptions.userId, set: v })
      return Response.json({ ok: true })
    }
    case 'saveMoney': {
      const amount = Math.floor(Number(b.amount))
      if (!Number.isFinite(amount) || amount <= 0) return err('Enter the amount received.')
      const uid = str(b.userId, 100)
      let email = str(b.email, 200)
      let name = str(b.name, 120)
      if (uid) {
        const u = await idAdmin.getUser(uid).catch(() => null)
        if (u) {
          const m = u.userMetadata || {}
          email = u.email || email
          name = String(m.username || m.full_name || u.name || name)
        }
      }
      if (!uid && !name && !email) return err('Choose the user who paid, or type their name.')
      const paidAt = b.paidAt ? new Date(b.paidAt) : new Date()
      const v = {
        userId: uid,
        email,
        name,
        amount,
        currency: str(b.currency, 8).toUpperCase() || 'RWF',
        method: str(b.method, 80),
        reference: str(b.reference, 120),
        planId: Number(b.planId) || null,
        note: str(b.note, 300),
        paidAt: isNaN(paidAt.getTime()) ? new Date() : paidAt,
      }
      const [row] = id
        ? await db.update(payments).set(v).where(eq(payments.id, id)).returning()
        : await db.insert(payments).values(v).returning()
      return row ? Response.json(row) : err('Payment not found', 404)
    }
    case 'deleteMoney':
      await db.delete(payments).where(eq(payments.id, id))
      return Response.json({ ok: true })
    case 'saveSettings': {
      const wa = str(b.whatsapp, 30).replace(/[^\d+]/g, '')
      if (wa && wa.replace(/\D/g, '').length < 8) return err('Enter the full WhatsApp number with country code, e.g. +250788123456.')
      await setSetting('whatsapp', wa)
      return Response.json({ ok: true })
    }
    case 'deleteUser': {
      const uid = str(b.userId, 100)
      if (uid === me.id) return err('You cannot delete your own account here.')
      const u = await idAdmin.getUser(uid).catch(() => null)
      if (u && (u.email || '').toLowerCase() === OWNER_EMAIL) return err('The owner account cannot be deleted.')
      if (u) await idAdmin.deleteUser(uid)
      await Promise.all([
        db.delete(lessonPlans).where(eq(lessonPlans.userId, uid)),
        db.delete(userSubscriptions).where(eq(userSubscriptions.userId, uid)),
        db.delete(usage).where(eq(usage.userId, uid)),
        db.delete(upgradeRequests).where(eq(upgradeRequests.userId, uid)),
        db.delete(securityAnswers).where(eq(securityAnswers.userId, uid)),
      ])
      return Response.json({ ok: true })
    }
    case 'decideRequest': {
      const [r] = await db.select().from(upgradeRequests).where(eq(upgradeRequests.id, id))
      if (!r) return err('Request not found', 404)
      if (r.status !== 'pending') return err('This request was already reviewed.')
      const approve = !!b.approve
      if (approve) {
        const plan = (await ensurePlans()).find((p) => p.id === r.planId)
        if (!plan) return err('The requested plan no longer exists.')
        await setPlan(r.userId, { planId: plan.id, days: plan.durationDays, resetUsage: !!b.resetUsage, note: 'Approved request #' + r.id })
        if (b.recordPayment !== false && plan.price > 0) {
          const [pm] = r.paymentMethodId ? await db.select().from(paymentMethods).where(eq(paymentMethods.id, r.paymentMethodId)) : []
          await db.insert(payments).values({
            userId: r.userId,
            email: r.email,
            name: r.name,
            amount: plan.price,
            currency: plan.currency,
            method: pm?.name || '',
            reference: r.reference,
            planId: plan.id,
            requestId: r.id,
            note: 'Upgrade request #' + r.id + ' approved',
          })
        }
      }
      await db.update(upgradeRequests).set({ status: approve ? 'approved' : 'rejected', decidedAt: new Date() }).where(eq(upgradeRequests.id, id))
      return Response.json({ ok: true })
    }
  }
  return err('Unknown action')
}

export const config: Config = { path: '/api/admin' }
