import { pgTable, text, timestamp, boolean, jsonb, primaryKey, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  username: text('username').primaryKey(),
  salt: text('salt').notNull(),
  hash: text('hash').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by'),
})

export const cases = pgTable('cases', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  machineType: text('machine_type').notNull().default('---'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  technician: text('technician').notNull(),
  messages: jsonb('messages').notNull().default([]),
  cause: text('cause').notNull(),
  remedy: text('remedy').notNull(),
  verified: boolean('verified').notNull().default(false),
  verifiedBy: text('verified_by'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  editedBy: text('edited_by'),
}, (table) => [
  index('cases_machine_type_idx').on(table.machineType),
  index('cases_technician_idx').on(table.technician),
])

// The image bytes themselves live in Netlify Blobs, keyed by id - this row
// is just the metadata needed to list/authorize/render them.
export const casePhotos = pgTable('case_photos', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('case_photos_case_id_idx').on(table.caseId),
])

export const caseLikes = pgTable('case_likes', {
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
}, (table) => [
  primaryKey({ columns: [table.caseId, table.username] }),
])

// One open request per username - a repeat request just refreshes
// requested_at (ON CONFLICT DO UPDATE) instead of stacking up duplicates.
export const passwordResetRequests = pgTable('password_reset_requests', {
  username: text('username').primaryKey(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
})
