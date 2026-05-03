import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const issuesTable = pgTable("issues", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  issueNumber: integer("issue_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  type: text("type").notNull().default("task"),
  assignee: text("assignee"),
  reporter: text("reporter").notNull().default("You"),
  labels: text("labels").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertIssueSchema = createInsertSchema(issuesTable).omit({ createdAt: true, updatedAt: true });
export type InsertIssue = z.infer<typeof insertIssueSchema>;
export type Issue = typeof issuesTable.$inferSelect;
