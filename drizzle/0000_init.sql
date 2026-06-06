CREATE TABLE "daily_submission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
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
CREATE TABLE "league_membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"league_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_by_team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "daily_submission" ADD CONSTRAINT "daily_submission_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_submission" ADD CONSTRAINT "daily_submission_deck_date_deck_deck_date_fk" FOREIGN KEY ("deck_date") REFERENCES "public"."deck"("deck_date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_membership" ADD CONSTRAINT "league_membership_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_membership" ADD CONSTRAINT "league_membership_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league" ADD CONSTRAINT "league_created_by_team_id_team_id_fk" FOREIGN KEY ("created_by_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_submission_team_date_uq" ON "daily_submission" USING btree ("team_id","deck_date");--> statement-breakpoint
CREATE INDEX "daily_submission_leaderboard_idx" ON "daily_submission" USING btree ("deck_date","score","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "league_membership_uq" ON "league_membership" USING btree ("league_id","team_id");--> statement-breakpoint
CREATE INDEX "league_membership_team_idx" ON "league_membership" USING btree ("team_id");