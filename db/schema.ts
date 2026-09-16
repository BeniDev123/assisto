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

export const caseLikes = pgTable('case_likes', {
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
}, (table) => [
  primaryKey({ columns: [table.caseId, table.username] }),
])
