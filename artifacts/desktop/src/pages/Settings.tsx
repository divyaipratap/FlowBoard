import React, { useEffect, useState } from "react";
import { AlertTriangle, Bell, Bot, Check, Clipboard, FolderKanban, Inbox, ListChecks, Monitor, Moon, RotateCcw, Settings as SettingsIcon, ShieldCheck, Sun, Trash2, UserRound, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { getAvatarColors, getInitials, loadProfile, LocalProfile, PROFILE_EVENT, resetProfile, saveProfile } from "@/lib/profile";
import {
  defaultNotificationPrefs,
  loadNotificationPrefs,
  NotificationPrefs,
  PROPOSAL_KIND_LABELS,
  ProposalKind,
  saveNotificationPrefs,
} from "@/lib/notification-prefs";
import {
  getGetPulseTodayQueryKey,
  getListProjectsQueryKey,
  Project,
  useDeleteAllData,
  useDeleteProject,
  useListProjects,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TeamSyncSettings } from "@/features/team-sync/TeamSyncSettings";

const SETTINGS_KEY = "flowboard.settings";

type AppSettings = {
  denseBoard: boolean;
  reduceMotion: boolean;
  themeMode: "dark" | "light";
};

type AgentBridgeSettings = {
  permissionMode: "suggest-only" | "trusted";
  allowedAgents: string[];
  disableWrites: boolean;
  permissions: AgentBridgePermissions;
};

type AgentActionPolicy = "approval" | "allow" | "never";

type AgentBridgePermissions = {
  readTickets: "allow" | "never";
  createTickets: AgentActionPolicy;
  updateStatus: AgentActionPolicy;
  markDone: AgentActionPolicy;
  addNotes: AgentActionPolicy;
  attachWorkSummaries: AgentActionPolicy;
  createFollowUps: AgentActionPolicy;
  requireWorkSummaryToMarkDone: boolean;
};

type AgentAuditEntry = {
  id: string;
  agentName: string;
  toolName: string;
  action: string;
  status: string;
  result: string;
  createdAt: string | number;
};

type AgentProposal = {
  id: string;
  agentName: string;
  toolName: string;
  proposalType: string;
  action: string;
  status: string;
  title: string;
  description?: string | null;
  createdAt: string | number;
};

const defaultSettings: AppSettings = {
  denseBoard: false,
  reduceMotion: false,
  themeMode: "dark",
};

const DELETE_ALL_ACKNOWLEDGEMENT = "DELETE ALL DATA";
const defaultAgentBridgeSettings: AgentBridgeSettings = {
  permissionMode: "suggest-only",
  allowedAgents: ["Codex", "Cursor", "MCP Agent"],
  disableWrites: false,
  permissions: {
    readTickets: "allow",
    createTickets: "approval",
    updateStatus: "approval",
    markDone: "approval",
    addNotes: "approval",
    attachWorkSummaries: "approval",
    createFollowUps: "approval",
    requireWorkSummaryToMarkDone: true,
  },
};

const agentRuleLabels: Array<{ key: Exclude<keyof AgentBridgePermissions, "requireWorkSummaryToMarkDone" | "readTickets">; label: string }> = [
  { key: "createTickets", label: "Create tickets" },
  { key: "updateStatus", label: "Update status" },
  { key: "markDone", label: "Mark done" },
  { key: "addNotes", label: "Add notes" },
  { key: "attachWorkSummaries", label: "Attach work summaries" },
  { key: "createFollowUps", label: "Create follow-ups" },
];

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export const Settings = () => {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: projects = [] } = useListProjects();
  const deleteProject = useDeleteProject();
  const deleteAllData = useDeleteAllData();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [avatarColor, setAvatarColor] = useState(getAvatarColors()[0]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllText, setDeleteAllText] = useState("");
  const [agentStatus, setAgentStatus] = useState("checking");
  const [agentBridge, setAgentBridge] = useState<AgentBridgeSettings>(defaultAgentBridgeSettings);
  const [allowedAgentsText, setAllowedAgentsText] = useState("Codex\nCursor\nMCP Agent");
  const [auditLog, setAuditLog] = useState<AgentAuditEntry[]>([]);
  const [agentInbox, setAgentInbox] = useState<AgentProposal[]>([]);
  const [mcpConfig, setMcpConfig] = useState("");
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(defaultNotificationPrefs);

  useEffect(() => {
    setNotificationPrefs(loadNotificationPrefs());
  }, []);

  const updateNotificationPrefs = (next: NotificationPrefs) => {
    setNotificationPrefs(next);
    saveNotificationPrefs(next);
  };

  useEffect(() => {
    setSettings(loadSettings());
    const currentProfile = loadProfile();
    setProfile(currentProfile);
    setDisplayName(currentProfile?.displayName || "");
    setRole(currentProfile?.role || "");
    setAvatarColor(currentProfile?.avatarColor || getAvatarColors()[0]);
  }, []);

  const loadAgentBridge = async () => {
    try {
      const [statusResponse, auditResponse, inboxResponse, configResponse] = await Promise.all([
        fetch("/api/agent-bridge/status"),
        fetch("/api/agent-bridge/audit-log?limit=8"),
        fetch("/api/agent-bridge/inbox?status=pending&limit=8"),
        fetch("/api/agent-bridge/mcp-config"),
      ]);
      const statusBody = await statusResponse.json();
      const auditBody = await auditResponse.json();
      const inboxBody = await inboxResponse.json();
      const configBody = await configResponse.json();
      const nextSettings = statusBody.settings ?? defaultAgentBridgeSettings;
      setAgentStatus(statusBody.status ?? "ready");
      setAgentBridge(nextSettings);
      setAllowedAgentsText((nextSettings.allowedAgents ?? []).join("\n"));
      setAuditLog(Array.isArray(auditBody) ? auditBody : []);
      setAgentInbox(Array.isArray(inboxBody) ? inboxBody : []);
      setMcpConfig(JSON.stringify(configBody, null, 2));
    } catch {
      setAgentStatus("offline");
    }
  };

  useEffect(() => {
    void loadAgentBridge();
    window.addEventListener("flowboard:agent-bridge-changed", loadAgentBridge as EventListener);
    return () => window.removeEventListener("flowboard:agent-bridge-changed", loadAgentBridge as EventListener);
  }, []);

  useEffect(() => {
    const refreshProfile = () => {
      const next = loadProfile();
      setProfile(next);
      setDisplayName(next?.displayName || "");
      setRole(next?.role || "");
      setAvatarColor(next?.avatarColor || getAvatarColors()[0]);
    };
    window.addEventListener(PROFILE_EVENT, refreshProfile as EventListener);
    return () => window.removeEventListener(PROFILE_EVENT, refreshProfile as EventListener);
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("flowboard:settings"));
    toast.success("Settings saved");
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
    window.dispatchEvent(new CustomEvent("flowboard:settings"));
    toast.success("Settings reset");
  };

  const saveAgentBridge = async (next: Partial<AgentBridgeSettings>) => {
    try {
      const body: AgentBridgeSettings = {
        ...agentBridge,
        ...next,
        allowedAgents: next.allowedAgents ?? allowedAgentsText.split(/\r?\n|,/).map((agent) => agent.trim()).filter(Boolean),
      };
      const response = await fetch("/api/agent-bridge/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Failed to save Agent Bridge settings");
      const saved = await response.json();
      setAgentBridge(saved);
      setAllowedAgentsText((saved.allowedAgents ?? []).join("\n"));
      toast.success("Agent Bridge settings saved");
      void loadAgentBridge();
    } catch {
      toast.error("Failed to save Agent Bridge settings");
    }
  };

  const saveAgentPermission = (key: keyof AgentBridgePermissions, value: AgentBridgePermissions[keyof AgentBridgePermissions]) => {
    void saveAgentBridge({
      permissions: {
        ...agentBridge.permissions,
        [key]: value,
      },
    });
  };

  const copyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfig);
      toast.success("MCP config copied");
    } catch {
      toast.error("Unable to copy MCP config");
    }
  };

  const resolveProposal = async (proposalId: string, action: "approve" | "reject") => {
    try {
      const response = await fetch(`/api/agent-bridge/inbox/${proposalId}/${action}`, { method: "POST" });
      if (!response.ok) throw new Error(`Failed to ${action} proposal`);
      toast.success(action === "approve" ? "Proposal approved" : "Proposal rejected");
      void loadAgentBridge();
      refreshProjectData();
    } catch {
      toast.error(action === "approve" ? "Failed to approve proposal" : "Failed to reject proposal");
    }
  };

  const saveLocalProfile = (event: React.FormEvent) => {
    event.preventDefault();
    const next = saveProfile({ ...profile, displayName, role, avatarColor });
    if (!next) {
      toast.error("Add your name to save the profile");
      return;
    }
    setProfile(next);
    toast.success("Profile saved");
  };

  const clearLocalProfile = () => {
    resetProfile();
    setProfile(null);
    setDisplayName("");
    setRole("");
    setAvatarColor(getAvatarColors()[0]);
    toast.success("Profile reset");
  };

  const refreshProjectData = () => {
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
  };

  const confirmDeleteProject = () => {
    if (!projectToDelete) return;
    deleteProject.mutate(
      { projectId: projectToDelete.id },
      {
        onSuccess: () => {
          toast.success(`${projectToDelete.name} deleted`);
          setProjectToDelete(null);
          refreshProjectData();
          setLocation("/");
        },
        onError: () => toast.error("Failed to delete project"),
      }
    );
  };

  const confirmDeleteAllData = () => {
    if (deleteAllText !== DELETE_ALL_ACKNOWLEDGEMENT) return;
    deleteAllData.mutate(undefined, {
      onSuccess: () => {
        window.localStorage.clear();
        queryClient.clear();
        setSettings(defaultSettings);
        setProfile(null);
        setDisplayName("");
        setRole("");
        setAvatarColor(getAvatarColors()[0]);
        setDeleteAllText("");
        setDeleteAllOpen(false);
        window.dispatchEvent(new CustomEvent("flowboard:settings"));
        toast.success("All local app data deleted");
        setLocation("/");
      },
      onError: () => toast.error("Failed to delete app data"),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="glass-panel border-x-0 border-t-0 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-accent/15 text-accent flex items-center justify-center">
            <SettingsIcon size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Settings</h1>
            <p className="text-xs text-muted-foreground">FlowBoard preferences</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl p-6 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <UserRound size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile</h2>
          </div>

          <form onSubmit={saveLocalProfile} className="glass-panel rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="text-sm font-semibold text-white" style={{ backgroundColor: avatarColor }}>
                  {getInitials(displayName || "You")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{profile ? "Local user profile" : "No profile saved"}</p>
                <p className="text-sm text-muted-foreground">New tickets are assigned to this person by default.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-role">Role or focus</Label>
                <Input
                  id="profile-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="Solo builder"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Avatar color</Label>
              <div className="flex flex-wrap gap-2">
                {getAvatarColors().map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use avatar color ${color}`}
                    onClick={() => setAvatarColor(color)}
                    className={`h-7 w-7 rounded-full border-2 ${avatarColor === color ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={clearLocalProfile}>
                Reset profile
              </Button>
              <Button type="submit" disabled={!displayName.trim()}>
                Save profile
              </Button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workspace</h2>
          </div>

          <div className="glass-panel rounded-lg divide-y divide-border/70">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="space-y-1">
                <Label htmlFor="dense-board" className="text-sm font-medium">Compact board layout</Label>
                <p className="text-sm text-muted-foreground">Use tighter spacing for columns and issue cards.</p>
              </div>
              <Switch
                id="dense-board"
                checked={settings.denseBoard}
                onCheckedChange={(checked) => updateSetting("denseBoard", checked)}
              />
            </div>

            <div className="flex items-center justify-between gap-6 p-4">
              <div className="space-y-1">
                <Label htmlFor="reduce-motion" className="text-sm font-medium">Reduce motion</Label>
                <p className="text-sm text-muted-foreground">Minimize animations and transitions where possible.</p>
              </div>
              <Switch
                id="reduce-motion"
                checked={settings.reduceMotion}
                onCheckedChange={(checked) => updateSetting("reduceMotion", checked)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Notifications</h2>
          </div>

          <div className="glass-panel rounded-lg divide-y divide-border/70">
            <div className="flex items-center justify-between gap-6 p-4">
              <div className="space-y-1">
                <Label htmlFor="mute-all-toasts" className="text-sm font-medium">Mute all agent toasts</Label>
                <p className="text-sm text-muted-foreground">
                  Hide toast pop-ups for every new agent proposal. The notification bell still updates.
                  Keyboard shortcut: Ctrl+Shift+A approves the most recent pending proposal.
                </p>
              </div>
              <Switch
                id="mute-all-toasts"
                checked={notificationPrefs.muteToasts}
                onCheckedChange={(checked) =>
                  updateNotificationPrefs({ ...notificationPrefs, muteToasts: checked })
                }
              />
            </div>

            {(Object.keys(PROPOSAL_KIND_LABELS) as ProposalKind[]).map((kind) => (
              <div key={kind} className="flex items-center justify-between gap-6 p-4">
                <div className="space-y-1">
                  <Label htmlFor={`mute-${kind}`} className="text-sm font-medium">
                    Mute {PROPOSAL_KIND_LABELS[kind]} toasts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {kind === "work_summary"
                      ? "Skip toasts for work summary proposals — they can be high volume."
                      : `Skip toasts for ${PROPOSAL_KIND_LABELS[kind].toLowerCase()} proposals.`}
                  </p>
                </div>
                <Switch
                  id={`mute-${kind}`}
                  disabled={notificationPrefs.muteToasts}
                  checked={notificationPrefs.muteByType[kind]}
                  onCheckedChange={(checked) =>
                    updateNotificationPrefs({
                      ...notificationPrefs,
                      muteByType: { ...notificationPrefs.muteByType, [kind]: checked },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>


        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Agent Bridge</h2>
          </div>

          <div className="glass-panel rounded-lg divide-y divide-border/70">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">MCP server status</p>
                  <Badge variant={agentStatus === "ready" ? "default" : "outline"}>{agentStatus}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Cursor, Codex, and other MCP clients can connect through the local stdio bridge.</p>
              </div>
              <Button variant="outline" className="gap-2" onClick={copyMcpConfig} disabled={!mcpConfig}>
                <Clipboard size={16} />
                Copy MCP config
              </Button>
            </div>

            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Permission mode</Label>
                <Select
                  value={agentBridge.permissionMode}
                  onValueChange={(value) => saveAgentBridge({ permissionMode: value as AgentBridgeSettings["permissionMode"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suggest-only">
                      <span className="flex items-center gap-2"><ShieldCheck size={14} /> Suggest-only</span>
                    </SelectItem>
                    <SelectItem value="trusted">
                      <span className="flex items-center gap-2"><Bot size={14} /> Trusted agent</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Suggest-only requires approval before status updates or follow-up tickets are applied.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="allowed-agents">Allowed agents</Label>
                <Textarea
                  id="allowed-agents"
                  value={allowedAgentsText}
                  onChange={(event) => setAllowedAgentsText(event.target.value)}
                  onBlur={() => saveAgentBridge({ allowedAgents: allowedAgentsText.split(/\r?\n|,/).map((agent) => agent.trim()).filter(Boolean) })}
                  className="min-h-24"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6 p-4">
              <div className="space-y-1">
                <Label htmlFor="disable-agent-writes" className="text-sm font-medium">Disable writes</Label>
                <p className="text-sm text-muted-foreground">Force all MCP write tools to record proposals without changing tickets.</p>
              </div>
              <Switch
                id="disable-agent-writes"
                checked={agentBridge.disableWrites}
                onCheckedChange={(checked) => saveAgentBridge({ disableWrites: checked })}
              />
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-muted-foreground" />
                <p className="text-sm font-medium">Agent Rules</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/35 p-3">
                  <div>
                    <p className="text-sm font-medium">Read tickets</p>
                    <p className="text-xs text-muted-foreground">Allow agents to inspect FlowBoard work.</p>
                  </div>
                  <Select
                    value={agentBridge.permissions.readTickets}
                    onValueChange={(value) => saveAgentPermission("readTickets", value as AgentBridgePermissions["readTickets"])}
                  >
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">Allow</SelectItem>
                      <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {agentRuleLabels.map((rule) => (
                  <div key={rule.key} className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/35 p-3">
                    <div>
                      <p className="text-sm font-medium">{rule.label}</p>
                      <p className="text-xs text-muted-foreground">Choose whether agents apply, propose, or are blocked.</p>
                    </div>
                    <Select
                      value={agentBridge.permissions[rule.key]}
                      onValueChange={(value) => saveAgentPermission(rule.key, value as AgentActionPolicy)}
                    >
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approval">Approval</SelectItem>
                        <SelectItem value="allow">Allow</SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-6 rounded-md border border-border/70 bg-background/35 p-3">
                <div className="space-y-1">
                  <Label htmlFor="require-worklog-done" className="text-sm font-medium">Require work summary before done</Label>
                  <p className="text-sm text-muted-foreground">Trusted agents must attach an Agent Worklog before auto-completing tickets.</p>
                </div>
                <Switch
                  id="require-worklog-done"
                  checked={agentBridge.permissions.requireWorkSummaryToMarkDone}
                  onCheckedChange={(checked) => saveAgentPermission("requireWorkSummaryToMarkDone", checked)}
                />
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Inbox size={16} className="text-muted-foreground" />
                <p className="text-sm font-medium">Agent Inbox</p>
                {agentInbox.length > 0 && <Badge variant="secondary">{agentInbox.length} pending</Badge>}
              </div>
              <div className="space-y-2">
                {agentInbox.length === 0 ? (
                  <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">No pending agent proposals.</p>
                ) : agentInbox.map((proposal) => (
                  <div key={proposal.id} className="rounded-md border border-border/70 bg-background/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{proposal.title}</p>
                          <Badge variant="outline" className="text-[10px]">{proposal.proposalType.replace("_", " ")}</Badge>
                        </div>
                        {proposal.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{proposal.description}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {proposal.agentName} via {proposal.toolName} &middot; {new Date(proposal.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => resolveProposal(proposal.id, "reject")}>
                          <X size={14} />
                          Reject
                        </Button>
                        <Button size="sm" className="gap-1" onClick={() => resolveProposal(proposal.id, "approve")}>
                          <Check size={14} />
                          Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-muted-foreground" />
                <p className="text-sm font-medium">Agent activity log</p>
              </div>
              <div className="space-y-2">
                {auditLog.length === 0 ? (
                  <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">No agent actions recorded yet.</p>
                ) : auditLog.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border/70 bg-background/35 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{entry.action}</p>
                      <Badge variant={entry.status === "applied" ? "default" : "outline"}>{entry.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.agentName} via {entry.toolName} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <TeamSyncSettings />

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Appearance</h2>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center justify-between gap-6">
              <div className="space-y-1">
                <p className="text-sm font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">Choose the app color mode.</p>
              </div>
              <Select value={settings.themeMode} onValueChange={(value) => updateSetting("themeMode", value as AppSettings["themeMode"])}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">
                    <span className="flex items-center gap-2"><Moon size={14} /> Dark</span>
                  </SelectItem>
                  <SelectItem value="light">
                    <span className="flex items-center gap-2"><Sun size={14} /> Light</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FolderKanban size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Projects</h2>
          </div>
          <div className="glass-panel rounded-lg divide-y divide-border/70">
            {projects.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No projects to delete.</div>
            ) : projects.map((project) => (
              <div key={project.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: project.color }} />
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">{project.key}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{project.issueCount} issue{project.issueCount === 1 ? "" : "s"}</p>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0 gap-2 text-destructive hover:text-destructive"
                  onClick={() => setProjectToDelete(project)}
                >
                  <Trash2 size={15} />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-destructive" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-destructive">Danger Zone</h2>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Delete all app data</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Removes projects, tickets, comments, attachments, Pulse data, profile, and local settings.
                </p>
              </div>
              <Button variant="destructive" className="gap-2" onClick={() => setDeleteAllOpen(true)}>
                <Trash2 size={16} />
                Delete all data
              </Button>
            </div>
            <Separator className="my-4" />
            <div className="flex justify-end">
              <Button variant="outline" onClick={resetSettings} className="gap-2">
                <RotateCcw size={16} />
                Reset settings only
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <DialogContent className="glass-panel sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <span className="font-medium text-foreground">{projectToDelete?.name}</span> and all of its tickets, comments, and attachments.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteProject} disabled={deleteProject.isPending}>
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAllOpen} onOpenChange={(open) => { setDeleteAllOpen(open); if (!open) setDeleteAllText(""); }}>
        <DialogContent className="glass-panel sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              Delete all app data
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This cannot be undone. Type <span className="font-mono text-foreground">{DELETE_ALL_ACKNOWLEDGEMENT}</span> to confirm.
            </p>
            <Input
              value={deleteAllText}
              onChange={(event) => setDeleteAllText(event.target.value)}
              placeholder={DELETE_ALL_ACKNOWLEDGEMENT}
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteAllData}
              disabled={deleteAllText !== DELETE_ALL_ACKNOWLEDGEMENT || deleteAllData.isPending}
            >
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
