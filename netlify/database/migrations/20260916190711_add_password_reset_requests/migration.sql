CREATE TABLE "password_reset_requests" (
	"username" text PRIMARY KEY,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
