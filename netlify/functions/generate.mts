import Anthropic from '@anthropic-ai/sdk'
import type { Config } from '@netlify/functions'
import { getUser } from '@netlify/identity'
import { consume, refund, type Kind } from '../../db/subs.js'

const anthropic = new Anthropic()

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const user = await getUser()
  if (!user) return Response.json({ error: 'Please sign in to generate lesson plans.' }, { status: 401 })
  let prompt = ''
  let kind: Kind = 'plan'
  try {
    const body = await req.json()
    prompt = typeof body?.prompt === 'string' ? body.prompt : ''
    if (body?.kind === 'notes' || body?.kind === 'helper') kind = body.kind
  } catch {}
  if (!prompt.trim()) return Response.json({ error: 'Missing prompt' }, { status: 400 })
  if (prompt.length > 60000) return Response.json({ error: 'Request too long' }, { status: 413 })

  // Monthly limits of the user's subscription plan.
  let blocked: string | null
  try {
    blocked = await consume(user.id, kind)
  } catch (e) {
    console.error('Usage check failed', e)
    return Response.json({ error: 'Could not check your plan limits. Please try again.' }, { status: 500 })
  }
  if (blocked) return Response.json({ error: blocked, limit: true }, { status: 402 })

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = await anthropic.messages.create({
          model: 'claude-sonnet-5-5',
          max_tokens: 6000,
          system:
            'You are an expert teacher-trainer for Rwanda\'s REB competence-based curriculum. Always reply with a single valid JSON object only, with no markdown fences and no text before or after it.',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        })
        for await (const ev of res) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            controller.enqueue(enc.encode(ev.delta.text))
          }
        }
      } catch (e) {
        console.error('AI generation failed', e)
        await refund(user.id, kind).catch(() => {})
        controller.enqueue(enc.encode('\n\u0000ERROR:' + ((e as Error)?.message || 'AI request failed')))
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

export const config: Config = { path: '/api/generate' }
