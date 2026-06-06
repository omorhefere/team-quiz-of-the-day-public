CREATE TABLE "league_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_by_team_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "league_membership" ADD CONSTRAINT "league_membership_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_membership" ADD CONSTRAINT "league_membership_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league" ADD CONSTRAINT "league_created_by_team_id_team_id_fk" FOREIGN KEY ("created_by_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_membership_uq" ON "league_membership" USING btree ("league_id","team_id");--> statement-breakpoint
CREATE INDEX "league_membership_team_idx" ON "league_membership" USING btree ("team_id");