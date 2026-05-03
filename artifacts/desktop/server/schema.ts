import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("#8b5cf6"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const issuesTable = sqliteTable("issues", {
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
  labels: text("labels").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const commentsTable = sqliteTable("comments", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  content: text("content").notNull(),
  author: text("author").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
