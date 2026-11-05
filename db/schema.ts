import { pgTable, serial, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'

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
