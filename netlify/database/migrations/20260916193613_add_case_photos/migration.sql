CREATE TABLE "case_photos" (
	"id" text PRIMARY KEY,
	"case_id" text NOT NULL,
	"content_type" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "case_photos_case_id_idx" ON "case_photos" ("case_id");--> statement-breakpoint
ALTER TABLE "case_photos" ADD CONSTRAINT "case_photos_case_id_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE;