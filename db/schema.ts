import { pgTable, serial, text, timestamp, jsonb, index, integer, boolean, primaryKey } from 'drizzle-orm/pg-core'

// Lesson plans saved by signed-in teachers. `plan` holds every field of the plan
// (as shown in the editable preview); `notes` holds the prepared notes & exercises.
export const lessonPlans = pgTable(
  'lesson_plans',
  {
    id: serial().primaryKey(),
    userId: text('user_id').notNull(),
    title: text().notNull().default(''),
    subject: text().notNull().default(''),
    cls: text().notNull().default(''),
    plan: jsonb().notNull(),
    labels: jsonb(),
    notes: jsonb(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('lesson_plans_user_idx').on(t.userId, t.updatedAt)],
)

// Subscription plans the admin can create and edit. A limit of null means unlimited.
// Limits count per calendar month.
export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(''),
  price: integer().notNull().default(0),
  currency: text().notNull().default('RWF'),
  durationDays: integer('duration_days').notNull().default(30),
  lessonLimit: integer('lesson_limit'),
  exerciseLimit: integer('exercise_limit'),
  isDefault: boolean('is_default').notNull().default(false),
  active: boolean().notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Payment methods shown to users when they ask for an upgrade (e.g. MTN MoMo, bank).
export const paymentMethods = pgTable('payment_methods', {
  id: serial().primaryKey(),
  name: text().notNull(),
  details: text().notNull().default(''),
  active: boolean().notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// The plan each user is on. Users without a row are on the default plan.
// lessonLimit / exerciseLimit here override the plan's limits for that one user.
export const userSubscriptions = pgTable('user_subscriptions', {
  userId: text('user_id').primaryKey(),
  planId: integer('plan_id'),
  lessonLimit: integer('lesson_limit'),
  exerciseLimit: integer('exercise_limit'),
  customLimits: boolean('custom_limits').notNull().default(false),
  expiresAt: timestamp('expires_at'),
  note: text().notNull().default(''),
  // A suspended (stopped) user can sign in but cannot generate or save lesson plans.
  suspended: boolean().notNull().default(false),
  suspendedReason: text('suspended_reason').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Monthly usage counters. month is 'YYYY-MM'.
export const usage = pgTable(
  'usage',
  {
    userId: text('user_id').notNull(),
    month: text().notNull(),
    lessons: integer().notNull().default(0),
    exercises: integer().notNull().default(0),
    helpers: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
)

// Upgrade requests sent by users (with their payment reference) for the admin to approve.
export const upgradeRequests = pgTable(
  'upgrade_requests',
  {
    id: serial().primaryKey(),
    userId: text('user_id').notNull(),
    email: text().notNull().default(''),
    name: text().notNull().default(''),
    planId: integer('plan_id').notNull(),
    paymentMethodId: integer('payment_method_id'),
    reference: text().notNull().default(''),
    message: text().notNull().default(''),
    status: text().notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    decidedAt: timestamp('decided_at'),
  },
  (t) => [index('upgrade_requests_status_idx').on(t.status, t.createdAt)],
)

// Simple key/value settings managed by the admin (e.g. the admin's WhatsApp number).
export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: text().notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Money received from users, recorded by the admin (manually or when approving an upgrade request).
export const payments = pgTable(
  'payments',
  {
    id: serial().primaryKey(),
    userId: text('user_id').notNull().default(''),
    email: text().notNull().default(''),
    name: text().notNull().default(''),
    amount: integer().notNull().default(0),
    currency: text().notNull().default('RWF'),
    method: text().notNull().default(''),
    reference: text().notNull().default(''),
    planId: integer('plan_id'),
    requestId: integer('request_id'),
    note: text().notNull().default(''),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('payments_paid_idx').on(t.paidAt), index('payments_user_idx').on(t.userId)],
)

// Password-reset security answers (birthday and favorite food), stored as salted scrypt hashes only.
export const securityAnswers = pgTable('security_answers', {
  userId: text('user_id').primaryKey(),
  email: text().notNull(),
  salt: text().notNull(),
  birthdayHash: text('birthday_hash').notNull(),
  foodHash: text('food_hash').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [index('security_answers_email_idx').on(t.email)])

// Failed reset attempts per email, to stop guessing.
export const resetAttempts = pgTable('reset_attempts', {
  email: text().primaryKey(),
  failures: integer().notNull().default(0),
  windowStart: timestamp('window_start').defaultNow().notNull(),
})
