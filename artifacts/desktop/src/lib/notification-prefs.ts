const KEY = "flowboard.notifications";
export const NOTIFICATION_PREFS_EVENT = "flowboard:notifications";

export type ProposalKind = "status_update" | "issue_note" | "work_summary" | "create_issue" | "other";

export type NotificationPrefs = {
  muteToasts: boolean;
  muteByType: Record<ProposalKind, boolean>;
};

const KIND_VALUES: ProposalKind[] = ["status_update", "issue_note", "work_summary", "create_issue", "other"];

export const defaultNotificationPrefs: NotificationPrefs = {
  muteToasts: false,
  muteByType: {
    status_update: false,
    issue_note: false,
    work_summary: false,
    create_issue: false,
    other: false,
  },
};

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultNotificationPrefs;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      muteToasts: !!parsed.muteToasts,
      muteByType: { ...defaultNotificationPrefs.muteByType, ...(parsed.muteByType ?? {}) },
    };
  } catch {
    return defaultNotificationPrefs;
  }
}

export function saveNotificationPrefs(next: NotificationPrefs) {
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(NOTIFICATION_PREFS_EVENT));
}

export function toProposalKind(kind: string | null | undefined): ProposalKind {
  if (kind && (KIND_VALUES as string[]).includes(kind)) return kind as ProposalKind;
  return "other";
}

export function isMutedForKind(prefs: NotificationPrefs, kind: string | null | undefined): boolean {
  if (prefs.muteToasts) return true;
  return !!prefs.muteByType[toProposalKind(kind)];
}

export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  status_update: "Status updates",
  work_summary: "Work summaries",
  issue_note: "Progress notes",
  create_issue: "New tickets",
  other: "Other proposals",
};
