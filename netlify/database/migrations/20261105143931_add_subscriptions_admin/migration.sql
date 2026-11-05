CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RWF' NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"lesson_limit" integer,
	"exercise_limit" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upgrade_requests" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"plan_id" integer NOT NULL,
	"payment_method_id" integer,
	"reference" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"user_id" text,
	"month" text,
	"lessons" integer DEFAULT 0 NOT NULL,
	"exercises" integer DEFAULT 0 NOT NULL,
	"helpers" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_pkey" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"user_id" text PRIMARY KEY,
	"plan_id" integer,
	"lesson_limit" integer,
	"exercise_limit" integer,
	"custom_limits" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "upgrade_requests_status_idx" ON "upgrade_requests" ("status","created_at");