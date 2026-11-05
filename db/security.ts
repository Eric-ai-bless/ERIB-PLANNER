import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { db } from './index.js'
import { securityAnswers } from './schema.js'

const scryptAsync = promisify(scrypt) as (p: string, s: string, n: number) => Promise<Buffer>

// Birthday arrives as YYYY-MM-DD from a date field.
export function normBirthday(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(s + 'T00:00:00Z')
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return ''
  const y = d.getUTCFullYear()
  if (y < 1900 || d.getTime() > Date.now()) return ''
  return s
}

// Favorite food is compared ignoring case, accents, punctuation and extra spaces ("Ugali " = "ugali").
export function normFood(v: unknown): string {
  return String(v ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 80)
}

const hash = async (value: string, salt: string) => (await scryptAsync(value, salt, 32)).toString('hex')

export async function matches(value: string, salt: string, stored: string) {
  if (!value) return false
  const a = Buffer.from(await hash(value, salt), 'hex')
  const b = Buffer.from(stored, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// Returns an error message, or '' when saved.
export async function saveAnswers(userId: string, email: string, birthdayRaw: unknown, foodRaw: unknown): Promise<string> {
  const birthday = normBirthday(birthdayRaw)
  const food = normFood(foodRaw)
  if (!birthday) return 'Please enter your birthday (day, month and year).'
  if (food.length < 2) return 'Please enter your favorite food.'
  const salt = randomBytes(16).toString('hex')
  const v = {
    email: email.trim().toLowerCase(),
    salt,
    birthdayHash: await hash(birthday, salt),
    foodHash: await hash(food, salt),
    updatedAt: new Date(),
  }
  await db.insert(securityAnswers).values({ userId, ...v }).onConflictDoUpdate({ target: securityAnswers.userId, set: v })
  return ''
}
