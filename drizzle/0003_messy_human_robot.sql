CREATE TABLE "league_admin" (
	"id" uuid PRIMARY KEY NOT NULL,
	"league_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_admin_league_id_unique" UNIQUE("league_id"),
	CONSTRAINT "league_admin_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "league_admin" ADD CONSTRAINT "league_admin_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;