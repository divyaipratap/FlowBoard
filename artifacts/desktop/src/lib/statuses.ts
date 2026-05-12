export type LocalStatus = {
  id?: string;
  name: string;
  color: string;
  position: number;
};

export const DEFAULT_STATUSES: LocalStatus[] = [
  { name: "todo", color: "#6b7280", position: 0 },
  { name: "in_progress", color: "#3b82f6", position: 1 },
  { name: "in_review", color: "#eab308", position: 2 },
  { name: "done", color: "#22c55e", position: 3 },
];

export function getStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function getDoneStatus(statuses: Array<{ name: string }>) {
  return statuses.at(-1)?.name || "done";
}
