CREATE TABLE "daily_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"deck_date" date NOT NULL,
	"answers" jsonb NOT NULL,
	"score" smallint NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rank_snapshot" integer
);
--> statement-breakpoint
CREATE TABLE "deck" (
	"deck_date" date PRIMARY KEY NOT NULL,
	"questions" jsonb NOT NULL,
	"curator_notes" text,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "daily_submission" ADD CONSTRAINT "daily_submission_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_submission" ADD CONSTRAINT "daily_submission_deck_date_deck_deck_date_fk" FOREIGN KEY ("deck_date") REFERENCES "public"."deck"("deck_date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_submission_team_date_uq" ON "daily_submission" USING btree ("team_id","deck_date");--> statement-breakpoint
CREATE INDEX "daily_submission_leaderboard_idx" ON "daily_submission" USING btree ("deck_date","score","submitted_at");