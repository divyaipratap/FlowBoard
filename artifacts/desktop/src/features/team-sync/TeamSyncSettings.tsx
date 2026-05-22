import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Clipboard, Link2, RefreshCw, Trash2, Users, Wifi, WifiOff } from "lucide-react";

type TransportState = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface SyncRoom {
  id: string;
  label: string | null;
  relayUrl: string;
  enabled: boolean;
  createdAt: string;
  lastConnectedAt: string | null;
}

interface SyncStateInfo {
  keychainAvailable: boolean;
  roomCount: number;
  defaultRelayUrl: string;
}

interface PendingGenerated {
  roomId: string;
  words: readonly string[];
  expiresAt: string;
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function TeamSyncSettings() {
  const [state, setState] = useState<SyncStateInfo | null>(null);
  const [rooms, setRooms] = useState<SyncRoom[]>([]);
  const [relayInput, setRelayInput] = useState("");
  const [pending, setPending] = useState<PendingGenerated | null>(null);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [transportState, setTransportState] = useState<TransportState>("idle");
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [busy, setBusy] = useState(false);

  const enabled = useMemo(() => rooms.some((room) => room.enabled), [rooms]);

  const refresh = useCallback(async () => {
    try {
      const [info, list] = await Promise.all([
        api<SyncStateInfo>("/api/sync/state"),
        api<SyncRoom[]>("/api/sync/rooms"),
      ]);
      setState(info);
      setRooms(list);
      if (!relayInput) setRelayInput(info.defaultRelayUrl);
    } catch (error) {
      toast.error(`Sync state unavailable: ${(error as Error).message}`);
    }
  }, [relayInput]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Listen for transport state SSE events forwarded as window CustomEvents.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        type?: string;
        transportState?: TransportState;
      } | undefined;
      if (!detail) return;
      if (detail.type === "sync.transport_state" && detail.transportState) {
        setTransportState(detail.transportState);
      }
      if (detail.type === "sync.peer_connected") {
        setConnectedPeers((prev) => prev + 1);
      }
      if (detail.type === "sync.peer_disconnected") {
        setConnectedPeers((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener("flowboard:sync-event", handler);
    return () => window.removeEventListener("flowboard:sync-event", handler);
  }, []);

  const generate = useCallback(async () => {
    if (!state?.keychainAvailable) {
      toast.error("OS keychain is unavailable on this device — cannot create a room");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{
        roomId: string;
        words: readonly string[];
        relayUrl: string;
        expiresAt: string;
      }>("/api/sync/pairing/generate", {
        method: "POST",
        body: JSON.stringify({ relayUrl: relayInput.trim() || undefined }),
      });
      setPending({
        roomId: result.roomId,
        words: result.words,
        expiresAt: result.expiresAt,
      });
      await refresh();
      toast.success("Pairing code generated — share both the words and the room ID");
    } catch (error) {
      toast.error(`Could not generate pairing code: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [refresh, relayInput, state?.keychainAvailable]);

  const acceptPairing = useCallback(async () => {
    if (!joinRoomId.trim() || !joinCode.trim()) {
      toast.error("Enter both the room ID and the pairing code");
      return;
    }
    const words = joinCode
      .trim()
      .split(/[\s,-]+/u)
      .map((word) => word.toLowerCase())
      .filter(Boolean);
    if (words.length !== 6) {
      toast.error("Pairing code must be exactly 6 words");
      return;
    }
    setBusy(true);
    try {
      await api("/api/sync/pairing/accept", {
        method: "POST",
        body: JSON.stringify({
          roomId: joinRoomId.trim(),
          words,
          relayUrl: relayInput.trim() || undefined,
        }),
      });
      setJoinRoomId("");
      setJoinCode("");
      await refresh();
      toast.success("Joined room — peer sync will activate when the engine connects");
    } catch (error) {
      toast.error(`Could not join: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [joinCode, joinRoomId, refresh, relayInput]);

  const toggleRoom = useCallback(
    async (room: SyncRoom, next: boolean) => {
      try {
        await api(`/api/sync/rooms/${encodeURIComponent(room.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: next }),
        });
        await refresh();
      } catch (error) {
        toast.error(`Could not update room: ${(error as Error).message}`);
      }
    },
    [refresh],
  );

  const removeRoom = useCallback(
    async (room: SyncRoom) => {
      if (!window.confirm(`Remove room ${room.label ?? room.id}? The key will remain in the OS keychain until cleared.`)) {
        return;
      }
      try {
        await api(`/api/sync/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE" });
        await refresh();
      } catch (error) {
        toast.error(`Could not remove room: ${(error as Error).message}`);
      }
    },
    [refresh],
  );

  const copyPairing = useCallback(async () => {
    if (!pending) return;
    const text = `${pending.roomId}\n${pending.words.join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Pairing details copied");
    } catch {
      toast.error("Unable to copy");
    }
  }, [pending]);

  const updateRelayUrl = useCallback(async () => {
    const url = relayInput.trim();
    if (!url) return;
    if (rooms.length === 0) {
      toast.success("Relay URL noted — it will apply to the next room you create");
      return;
    }
    try {
      await Promise.all(
        rooms.map((room) =>
          api(`/api/sync/rooms/${encodeURIComponent(room.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ relayUrl: url }),
          }),
        ),
      );
      await refresh();
      toast.success("Relay URL updated");
    } catch (error) {
      toast.error(`Could not update relay: ${(error as Error).message}`);
    }
  }, [refresh, relayInput, rooms]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Team Sync</h2>
      </div>

      <div className="glass-panel rounded-lg divide-y divide-border/70">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Encrypted P2P sync</p>
              <Badge variant={transportState === "connected" ? "default" : "outline"}>
                <span className={stateColor(transportState)}>
                  {transportState === "connected" ? (
                    <Wifi size={12} className="inline mr-1" />
                  ) : (
                    <WifiOff size={12} className="inline mr-1" />
                  )}
                  {stateLabel(transportState)}
                </span>
              </Badge>
              {connectedPeers > 0 && (
                <Badge variant="secondary">{connectedPeers} peer{connectedPeers === 1 ? "" : "s"}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Sync your board with 2–5 teammates over an encrypted relay. No server stores your data.
            </p>
            {state && !state.keychainAvailable && (
              <p className="text-xs text-yellow-400">
                The OS keychain is unavailable — pairing is disabled until it can store keys.
              </p>
            )}
          </div>
          <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Active" : "No rooms"}</Badge>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="relay-url">Relay URL</Label>
            <div className="flex gap-2">
              <Input
                id="relay-url"
                value={relayInput}
                onChange={(e) => setRelayInput(e.target.value)}
                placeholder={state?.defaultRelayUrl ?? ""}
              />
              <Button variant="outline" onClick={updateRelayUrl}>
                <RefreshCw size={14} className="mr-1" />
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Any y-websocket-compatible relay works. The relay sees only encrypted traffic.
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-muted-foreground" />
            <p className="text-sm font-medium">Pairing</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-border/70 bg-background/35 p-3 space-y-3">
              <p className="text-sm font-medium">Create a room</p>
              <p className="text-xs text-muted-foreground">
                Generate a pairing code and share the room ID + 6 words with your teammate.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={generate}
                disabled={busy || !state?.keychainAvailable}
              >
                Generate code
              </Button>
              {pending && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-2 py-1 rounded font-mono break-all">
                      {pending.roomId}
                    </code>
                  </div>
                  <code className="block text-xs bg-muted px-2 py-1 rounded font-mono">
                    {pending.words.join(" ")}
                  </code>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(pending.expiresAt).toLocaleTimeString()}
                    </p>
                    <Button size="sm" variant="ghost" onClick={copyPairing}>
                      <Clipboard size={14} className="mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/70 bg-background/35 p-3 space-y-3">
              <p className="text-sm font-medium">Join a room</p>
              <p className="text-xs text-muted-foreground">
                Paste the room ID and 6-word code from your teammate's device.
              </p>
              <Input
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="fb_…"
              />
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="word word word word word word"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={acceptPairing}
                disabled={busy || !state?.keychainAvailable || !joinRoomId.trim() || !joinCode.trim()}
              >
                Join
              </Button>
            </div>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="p-4 space-y-3">
            <p className="text-sm font-medium">Paired rooms</p>
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li
                  key={room.id}
                  className="rounded-md border border-border/70 bg-background/35 p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{room.id}</code>
                    <p className="text-xs text-muted-foreground truncate">{room.relayUrl}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={room.enabled}
                      onCheckedChange={(next) => void toggleRoom(room, next)}
                    />
                    <Button size="sm" variant="ghost" onClick={() => void removeRoom(room)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
