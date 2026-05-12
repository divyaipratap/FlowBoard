export type LocalProfile = {
  id: string;
  displayName: string;
  role?: string;
  avatarColor: string;
  createdAt: string;
  updatedAt: string;
};

export const PROFILE_KEY = "flowboard.profile";
export const PROFILE_EVENT = "flowboard:profile";

const AVATAR_COLORS = ["#8b5cf6", "#0ea5e9", "#10b981", "#f97316", "#e11d48", "#14b8a6"];

function sanitizeProfile(value: Partial<LocalProfile> | null): LocalProfile | null {
  const displayName = value?.displayName?.trim();
  if (!displayName) return null;
  const source = value || {};

  const now = new Date().toISOString();
  return {
    id: source.id || "local-user",
    displayName,
    role: source.role?.trim() || undefined,
    avatarColor: source.avatarColor || AVATAR_COLORS[0],
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now,
  };
}

export function loadProfile(): LocalProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? sanitizeProfile(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Pick<LocalProfile, "displayName"> & Partial<LocalProfile>) {
  const existing = loadProfile();
  const next = sanitizeProfile({
    ...existing,
    ...profile,
    id: profile.id || existing?.id || "local-user",
    createdAt: existing?.createdAt || profile.createdAt,
    updatedAt: new Date().toISOString(),
  });

  if (!next) return null;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: next }));
  return next;
}

export function resetProfile() {
  window.localStorage.removeItem(PROFILE_KEY);
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
}

export function getCurrentUserName() {
  return loadProfile()?.displayName || "You";
}

export function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || "?";
  return initials.toUpperCase();
}

export function getAvatarColors() {
  return AVATAR_COLORS;
}
