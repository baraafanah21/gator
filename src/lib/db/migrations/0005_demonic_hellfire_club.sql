CREATE TABLE "post_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"read_at" timestamp,
	"bookmarked_at" timestamp,
	CONSTRAINT "post_states_user_post_unique" UNIQUE("user_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "post_states" ADD CONSTRAINT "post_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_states" ADD CONSTRAINT "post_states_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;