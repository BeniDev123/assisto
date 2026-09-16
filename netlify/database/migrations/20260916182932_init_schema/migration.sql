CREATE TABLE "case_likes" (
	"case_id" text,
	"username" text,
	CONSTRAINT "case_likes_pkey" PRIMARY KEY("case_id","username")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY,
	"fingerprint" text NOT NULL,
	"machine_type" text DEFAULT '---' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"technician" text NOT NULL,
	"messages" jsonb DEFAULT '[]' NOT NULL,
	"cause" text NOT NULL,
	"remedy" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"edited_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"username" text PRIMARY KEY,
	"salt" text NOT NULL,
	"hash" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE INDEX "cases_machine_type_idx" ON "cases" ("machine_type");--> statement-breakpoint
CREATE INDEX "cases_technician_idx" ON "cases" ("technician");--> statement-breakpoint
ALTER TABLE "case_likes" ADD CONSTRAINT "case_likes_case_id_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE;