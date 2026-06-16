CREATE TABLE "custom_quiz_submission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"custom_quiz_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"score" smallint NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rank_snapshot" integer
);
--> statement-breakpoint
CREATE TABLE "custom_quiz" (
	"id" uuid PRIMARY KEY NOT NULL,
	"league_id" uuid NOT NULL,
	"title" text NOT NULL,
	"questions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "active_custom_quiz_id" uuid;--> statement-breakpoint
ALTER TABLE "custom_quiz_submission" ADD CONSTRAINT "custom_quiz_submission_custom_quiz_id_custom_quiz_id_fk" FOREIGN KEY ("custom_quiz_id") REFERENCES "public"."custom_quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_quiz_submission" ADD CONSTRAINT "custom_quiz_submission_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_quiz" ADD CONSTRAINT "custom_quiz_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_quiz_submission_uq" ON "custom_quiz_submission" USING btree ("custom_quiz_id","team_id");--> statement-breakpoint
CREATE INDEX "custom_quiz_submission_leaderboard_idx" ON "custom_quiz_submission" USING btree ("custom_quiz_id","score","submitted_at");