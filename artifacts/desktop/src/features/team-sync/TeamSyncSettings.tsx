import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Clipboard, Link2, RefreshCw, Users, Wifi, WifiOff } from "lucide-react";

type TransportState = "idle" | "connecting" | "connected" | "disconnected" | "error";

type TeamSyncState = {
  enabled: boolean;
  relayUrl: string;
  roomId: string | null;
  pairingCode: string | null;
  transportState: TransportState;
  queuedMessages: number;
  connectedPeers: number;
};

const DEFAULT_RELAY_URL = "wss://y-websocket-relay.fly.dev";

const SYNC_SETTINGS_KEY = "flowboard.team-sync";

function loadSyncSettings(): { enabled: boolean; relayUrl: string; roomId: string | null } {
  try {
    const raw = window.localStorage.getItem(SYNC_SETTINGS_KEY);
    if (!raw) return { enabled: false, relayUrl: DEFAULT_RELAY_URL, roomId: null };
    return { enabled: false, relayUrl: DEFAULT_RELAY_URL, roomId: null, ...JSON.parse(raw) };
  } catch {
    return { enabled: false, relayUrl: DEFAULT_RELAY_URL, roomId: null };
  }
}

function saveSyncSettings(settings: { enabled: boolean; relayUrl: string; roomId: string | null }) {
  window.localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
}

function stateColor(state: TransportState): string {
  switch (state) {
    case "connected":
      return "text-green-400";
    case "connecting":
      return "text-yellow-400";
    case "disconnected":
    case "error":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function stateLabel(state: TransportState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
  }
}

export function TeamSyncSettings() {
  const [syncState, setSyncState] = useState<TeamSyncState>(() => {
    const saved = loadSyncSettings();
    return {
      ...saved,
      pairingCode: null,
      transportState: "idle",
      queuedMessages: 0,
      connectedPeers: 0,
    };
  });
  const [relayInput, setRelayInput] = useState(syncState.relayUrl);
  const [joinCode, setJoinCode] = useState("");

  // Listen for transport state changes from SSE events.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        transportState?: TransportState;
        peerId?: string;
      } | undefined;
      if (!detail) return;

      if (detail.type === "sync.transport_state" && detail.transportState) {
        setSyncState((prev) => ({ ...prev, transportState: detail.transportState! }));
      }
      if (detail.type === "sync.peer_connected") {
        setSyncState((prev) => ({ ...prev, connectedPeers: prev.connectedPeers + 1 }));
      }
      if (detail.type === "sync.peer_disconnected") {
        setSyncState((prev) => ({ ...prev, connectedPeers: Math.max(0, prev.connectedPeers - 1) }));
      }
    };

    window.addEventListener("flowboard:sync-event", handler);
    return () => window.removeEventListener("flowboard:sync-event", handler);
  }, []);

  const toggleSync = useCallback((enabled: boolean) => {
    const next = { ...syncState, enabled };
    setSyncState(next);
    saveSyncSettings({ enabled, relayUrl: next.relayUrl, roomId: next.roomId });
    if (!enabled) {
      setSyncState((prev) => ({ ...prev, transportState: "idle", connectedPeers: 0 }));
    }
    toast.success(enabled ? "Team Sync enabled" : "Team Sync disabled");
  }, [syncState]);

  const saveRelay = useCallback(() => {
    const url = relayInput.trim() || DEFAULT_RELAY_URL;
    setRelayInput(url);
    const next = { ...syncState, relayUrl: url };
    setSyncState(next);
    saveSyncSettings({ enabled: next.enabled, relayUrl: url, roomId: next.roomId });
    toast.success("Relay URL saved");
  }, [relayInput, syncState]);

  const generatePairingCode = useCallback(() => {
    // In production this calls PairingService.generate() via the server.
    // For now, generate a placeholder 6-word code for the UI.
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    const code = words.sort(() => Math.random() - 0.5).slice(0, 6).join("-");
    setSyncState((prev) => ({ ...prev, pairingCode: code }));
    toast.success("Pairing code generated — share it with your teammate");
  }, []);

  const acceptPairingCode = useCallback(() => {
    if (!joinCode.trim()) {
      toast.error("Enter a pairing code to join");
      return;
    }
    // In production this calls PairingService.accept() via the server.
    const fakeRoomId = crypto.randomUUID().replace(/-/g, "").slice(0, 26);
    const next = { ...syncState, roomId: fakeRoomId };
    setSyncState(next);
    saveSyncSettings({ enabled: next.enabled, relayUrl: next.relayUrl, roomId: fakeRoomId });
    setJoinCode("");
    toast.success("Joined room — syncing will begin shortly");
  }, [joinCode, syncState]);

  const copyPairingCode = useCallback(async () => {
    if (!syncState.pairingCode) return;
    try {
      await navigator.clipboard.writeText(syncState.pairingCode);
      toast.success("Pairing code copied");
    } catch {
      toast.error("Unable to copy");
    }
  }, [syncState.pairingCode]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Team Sync</h2>
      </div>

      <div className="glass-panel rounded-lg divide-y divide-border/70">
        {/* Enable / status row */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Encrypted P2P sync</p>
              <Badge variant={syncState.transportState === "connected" ? "default" : "outline"}>
                <span className={stateColor(syncState.transportState)}>
                  {syncState.transportState === "connected" ? <Wifi size={12} className="inline mr-1" /> : <WifiOff size={12} className="inline mr-1" />}
                  {stateLabel(syncState.transportState)}
                </span>
              </Badge>
              {syncState.queuedMessages > 0 && (
                <Badge variant="secondary">{syncState.queuedMessages} queued</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Sync your board with 2–5 teammates over an encrypted relay. No server stores your data.
            </p>
          </div>
          <Switch
            id="team-sync-enabled"
            checked={syncState.enabled}
            onCheckedChange={toggleSync}
          />
        </div>

        {/* Relay URL */}
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="relay-url">Relay URL</Label>
            <div className="flex gap-2">
              <Input
                id="relay-url"
                value={relayInput}
                onChange={(e) => setRelayInput(e.target.value)}
                placeholder={DEFAULT_RELAY_URL}
                disabled={!syncState.enabled}
              />
              <Button variant="outline" onClick={saveRelay} disabled={!syncState.enabled}>
                <RefreshCw size={14} className="mr-1" />
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Any y-websocket-compatible relay works. The relay sees only encrypted traffic.
            </p>
          </div>
        </div>

        {/* Pairing */}
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-muted-foreground" />
            <p className="text-sm font-medium">Pairing</p>
          </div>

          {syncState.roomId ? (
            <div className="rounded-md border border-border/70 bg-background/35 p-3 space-y-2">
              <p className="text-sm">
                <span className="text-muted-foreground">Room:</span>{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{syncState.roomId}</code>
              </p>
              <p className="text-sm text-muted-foreground">
                {syncState.connectedPeers} peer{syncState.connectedPeers === 1 ? "" : "s"} connected
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Generate code (initiator) */}
              <div className="rounded-md border border-border/70 bg-background/35 p-3 space-y-3">
                <p className="text-sm font-medium">Create a room</p>
                <p className="text-xs text-muted-foreground">Generate a pairing code and share it with your teammate.</p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={generatePairingCode}
                  disabled={!syncState.enabled}
                >
                  Generate code
                </Button>
                {syncState.pairingCode && (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-2 py-1 rounded font-mono">
                      {syncState.pairingCode}
                    </code>
                    <Button size="sm" variant="ghost" onClick={copyPairingCode}>
                      <Clipboard size={14} />
                    </Button>
                  </div>
                )}
              </div>

              {/* Join with code */}
              <div className="rounded-md border border-border/70 bg-background/35 p-3 space-y-3">
                <p className="text-sm font-medium">Join a room</p>
                <p className="text-xs text-muted-foreground">Paste the code from your teammate's device.</p>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="alpha-bravo-charlie-delta-echo-foxtrot"
                  disabled={!syncState.enabled}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={acceptPairingCode}
                  disabled={!syncState.enabled || !joinCode.trim()}
                >
                  Join
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
