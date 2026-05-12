export type IssueStatus = (typeof IssueStatus)[keyof typeof IssueStatus];

export const IssueStatus = {
  todo: "todo",
  in_progress: "in_progress",
  in_review: "in_review",
  done: "done",
} as const;

