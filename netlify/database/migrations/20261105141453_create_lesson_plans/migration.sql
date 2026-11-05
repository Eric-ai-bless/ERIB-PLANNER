CREATE TABLE "lesson_plans" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"cls" text DEFAULT '' NOT NULL,
	"plan" jsonb NOT NULL,
	"labels" jsonb,
	"notes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lesson_plans_user_idx" ON "lesson_plans" ("user_id","updated_at");