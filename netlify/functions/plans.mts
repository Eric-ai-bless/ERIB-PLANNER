import type { Config } from '@netlify/functions'
import { getUser, verifyRequestOrigin } from '@netlify/identity'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { lessonPlans } from '../../db/schema.js'
import { SUSPENDED_MSG, isSuspended } from '../../db/subs.js'

// Saved lesson plans of the signed-in user.
//   GET    /api/plans          -> list (summary)
//   GET    /api/plans?id=1     -> one plan with all fields
//   POST   /api/plans          -> save new plan, or update when body.id is given
//   DELETE /api/plans?id=1     -> delete
const MAX_BYTES = 200_000
const str = (v: unknown, n = 200) => String(v ?? '').slice(0, n)

export default async (req: Request) => {
  const user = await getUser()
  if (!user) return Response.json({ error: 'Please sign in to use saved plans.' }, { status: 401 })
  const uid = user.id
  if (await isSuspended(uid)) return Response.json({ error: SUSPENDED_MSG, suspended: true }, { status: 403 })
  const url = new URL(req.url)
  const id = Number(url.searchParams.get('id')) || 0

  if (req.method !== 'GET') {
    try {
      verifyRequestOrigin(req)
    } catch {
      return Response.json({ error: 'Request not allowed' }, { status: 403 })
    }
  }

  if (req.method === 'GET') {
    if (id) {
      const [row] = await db
        .select()
        .from(lessonPlans)
        .where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, uid)))
      if (!row) return Response.json({ error: 'Plan not found' }, { status: 404 })
      return Response.json(row)
    }
    const rows = await db
      .select({
        id: lessonPlans.id,
        title: lessonPlans.title,
        subject: lessonPlans.subject,
        cls: lessonPlans.cls,
        updatedAt: lessonPlans.updatedAt,
      })
      .from(lessonPlans)
      .where(eq(lessonPlans.userId, uid))
      .orderBy(desc(lessonPlans.updatedAt))
      .limit(200)
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    const raw = await req.text()
    if (raw.length > MAX_BYTES) return Response.json({ error: 'Plan is too large to save' }, { status: 413 })
    let body: any
    try {
      body = JSON.parse(raw)
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 })
    }
    const plan = body?.plan
    if (!plan || typeof plan !== 'object' || Array.isArray(plan))
      return Response.json({ error: 'Missing plan' }, { status: 400 })
    const values = {
      title: str(plan.title),
      subject: str(plan.subject, 80),
      cls: str(plan.cls, 40),
      plan,
      labels: body.labels && typeof body.labels === 'object' ? body.labels : null,
      notes: Array.isArray(body.notes) ? body.notes : null,
      updatedAt: new Date(),
    }
    const pid = Number(body.id) || 0
    if (pid) {
      const [row] = await db
        .update(lessonPlans)
        .set(values)
        .where(and(eq(lessonPlans.id, pid), eq(lessonPlans.userId, uid)))
        .returning({ id: lessonPlans.id })
      if (row) return Response.json(row)
    }
    const [row] = await db
      .insert(lessonPlans)
      .values({ ...values, userId: uid })
      .returning({ id: lessonPlans.id })
    return Response.json(row, { status: 201 })
  }

  if (req.method === 'DELETE') {
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })
    await db.delete(lessonPlans).where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, uid)))
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}

export const config: Config = { path: '/api/plans' }
