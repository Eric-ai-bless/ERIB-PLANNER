CREATE TABLE "reset_attempts" (
	"email" text PRIMARY KEY,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_answers" (
	"user_id" text PRIMARY KEY,
	"email" text NOT NULL,
	"salt" text NOT NULL,
	"birthday_hash" text NOT NULL,
	"food_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "security_answers_email_idx" ON "security_answers" ("email");