CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY,
	"value" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY,
	"user_id" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RWF' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"plan_id" integer,
	"request_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "suspended_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_paid_idx" ON "payments" ("paid_at");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" ("user_id");