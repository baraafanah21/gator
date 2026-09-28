ALTER TABLE "feeds" ADD COLUMN "last_fetch_error" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "failed_fetches" integer DEFAULT 0 NOT NULL;