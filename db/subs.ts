import { admin as idAdmin, type User } from '@netlify/identity'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from './index.js'
import { appSettings, subscriptionPlans, usage, userSubscriptions } from './schema.js'

// The owner's account. It is always an admin, and can make other users admins.
export const OWNER_EMAIL = 'blessedtalent1997@gmail.com'

export const SUSPENDED_MSG = 'Your account has been stopped by the admin. Please contact the admin to restore access.'

// Admin settings (key/value).
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings)
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
}

export async function isSuspended(uid: string): Promise<boolean> {
  const [r] = await db.select({ s: userSubscriptions.suspended }).from(userSubscriptions).where(eq(userSubscriptions.userId, uid))
  return !!r?.s
}

export type Kind = 'plan' | 'notes' | 'helper'

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7)

export async function isAdmin(user: User | null): Promise<boolean> {
  if (!user) return false
  if ((user.email || '').toLowerCase() === OWNER_EMAIL) return true
  // Check the live record so a removed admin role takes effect right away.
  try {
    const fresh = await idAdmin.getUser(user.id)
    return !!fresh.roles?.includes('admin')
  } catch {
    return !!user.roles?.includes('admin')
  }
}

// Creates starter plans the first time, so the app works before the admin edits anything.
export async function ensurePlans() {
  const rows = await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.id))
  if (rows.length) return rows
  await db.insert(subscriptionPlans).values([
    { name: 'Free', description: 'Try ERIB CBC LESSON PLANNER', price: 0, lessonLimit: 5, exerciseLimit: 5, isDefault: true, sortOrder: 0 },
    { name: 'Standard', description: 'For a busy teacher', price: 3000, lessonLimit: 40, exerciseLimit: 40, sortOrder: 1 },
    { name: 'Premium', description: 'No monthly limits', price: 6000, lessonLimit: null, exerciseLimit: null, sortOrder: 2 },
  ]).onConflictDoNothing()
  return db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.id))
}

type PlanRow = typeof subscriptionPlans.$inferSelect
type SubRow = typeof userSubscriptions.$inferSelect

export function resolve(plans: PlanRow[], sub: SubRow | undefined) {
  const def = plans.find((p) => p.isDefault) || plans[0] || null
  const expired = !!(sub?.expiresAt && sub.expiresAt.getTime() < Date.now())
  const assigned = sub?.planId ? plans.find((p) => p.id === sub.planId) : undefined
  const plan = !expired && assigned ? assigned : def
  const custom = !!sub?.customLimits && !expired
  return {
    plan: plan ? { id: plan.id, name: plan.name } : null,
    lessonLimit: custom ? (sub!.lessonLimit ?? null) : (plan?.lessonLimit ?? null),
    exerciseLimit: custom ? (sub!.exerciseLimit ?? null) : (plan?.exerciseLimit ?? null),
    customLimits: custom,
    expiresAt: sub?.expiresAt && !expired && assigned ? sub.expiresAt : null,
    expired: expired && !!assigned,
  }
}

export async function entitlement(uid: string) {
  const plans = await ensurePlans()
  const [sub] = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, uid))
  const [u] = await db.select().from(usage).where(and(eq(usage.userId, uid), eq(usage.month, monthKey())))
  return {
    ...resolve(plans, sub),
    suspended: !!sub?.suspended,
    suspendedReason: sub?.suspended ? sub.suspendedReason : '',
    month: monthKey(),
    used: { lessons: u?.lessons ?? 0, exercises: u?.exercises ?? 0 },
  }
}

// Atomically uses one unit of the monthly allowance. Returns an error message when the limit is reached.
export async function consume(uid: string, kind: Kind): Promise<string | null> {
  const month = monthKey()
  if (await isSuspended(uid)) return SUSPENDED_MSG
  if (kind === 'helper') {
    // Helper calls (reading a template, shortening a plan) are free but only alongside real generations.
    const r = await db
      .insert(usage)
      .values({ userId: uid, month, helpers: 1 })
      .onConflictDoUpdate({
        target: [usage.userId, usage.month],
        set: { helpers: sql`${usage.helpers} + 1` },
        setWhere: sql`${usage.helpers} < (${usage.lessons} + ${usage.exercises}) * 4 + 6`,
      })
      .returning({ m: usage.month })
    return r.length ? null : 'Too many AI requests this month. Please upgrade your plan.'
  }
  const ent = await entitlement(uid)
  const limit = kind === 'plan' ? ent.lessonLimit : ent.exerciseLimit
  const col = kind === 'plan' ? usage.lessons : usage.exercises
  const what = kind === 'plan' ? 'lesson plans' : 'notes & exercises'
  const full = `You have used all ${limit} ${what} of your ${ent.plan?.name || ''} plan for this month. Open "Subscription" in the menu to upgrade.`
  if (limit !== null && limit <= 0) return `Your ${ent.plan?.name || ''} plan does not include ${what}. Open "Subscription" in the menu to upgrade.`
  const values = kind === 'plan' ? { userId: uid, month, lessons: 1 } : { userId: uid, month, exercises: 1 }
  const r = await db
    .insert(usage)
    .values(values)
    .onConflictDoUpdate({
      target: [usage.userId, usage.month],
      set: kind === 'plan' ? { lessons: sql`${usage.lessons} + 1` } : { exercises: sql`${usage.exercises} + 1` },
      ...(limit === null ? {} : { setWhere: sql`${col} < ${limit}` }),
    })
    .returning({ m: usage.month })
  return r.length ? null : full
}

// Gives the unit back when the AI request failed.
export async function refund(uid: string, kind: Kind) {
  const month = monthKey()
  const col = kind === 'plan' ? usage.lessons : kind === 'notes' ? usage.exercises : usage.helpers
  const key = kind === 'plan' ? 'lessons' : kind === 'notes' ? 'exercises' : 'helpers'
  await db
    .update(usage)
    .set({ [key]: sql`greatest(${col} - 1, 0)` })
    .where(and(eq(usage.userId, uid), eq(usage.month, month)))
}
