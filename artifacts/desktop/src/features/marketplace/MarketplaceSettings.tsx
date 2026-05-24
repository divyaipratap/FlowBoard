import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Download, ExternalLink, RefreshCw, Shield, Store, Trash2, Users } from "lucide-react";

interface IndexEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: { name: string; url?: string; verified?: boolean };
  tags: string[];
  manifestUrl: string;
  downloads?: number;
}

interface IndexResponse {
  version: 1;
  updatedAt: string;
  templates: IndexEntry[];
  cached?: boolean;
  source?: string;
}

interface InstalledEntry {
  id: string;
  manifest: { name?: string; description?: string };
  installedAt: string;
}

type VerificationStatus = "verified" | "community" | "invalid-signature" | "untrusted-key" | "unknown";

const SETTINGS_KEY = "flowboard.marketplace";
const DEFAULT_INDEX_URL =
  "https://raw.githubusercontent.com/divyaipratap/FlowBoard/main/templates/marketplace/index.json";

interface MarketplaceUiState {
  indexUrl: string;
  projectRoot: string;
}

function loadUiState(): MarketplaceUiState {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { indexUrl: DEFAULT_INDEX_URL, projectRoot: "" };
    return { indexUrl: DEFAULT_INDEX_URL, projectRoot: "", ...JSON.parse(raw) };
  } catch {
    return { indexUrl: DEFAULT_INDEX_URL, projectRoot: "" };
  }
}

function saveUiState(state: MarketplaceUiState) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
}

function verificationBadge(status: VerificationStatus, publisherName?: string) {
  switch (status) {
    case "verified":
      return (
        <Badge variant="default" className="gap-1">
          <Shield size={12} />
          Verified {publisherName ?? "publisher"}
        </Badge>
      );
    case "community":
      return (
        <Badge variant="outline" className="gap-1">
          <Users size={12} />
          Community
        </Badge>
      );
    case "invalid-signature":
      return (
        <Badge variant="destructive" className="gap-1">
          <Shield size={12} />
          Invalid signature
        </Badge>
      );
    case "untrusted-key":
      return (
        <Badge variant="outline" className="gap-1">
          <Users size={12} />
          Self-signed (untrusted)
        </Badge>
      );
    default:
      return null;
  }
}

export function MarketplaceSettings() {
  const [uiState, setUiState] = useState<MarketplaceUiState>(() => loadUiState());
  const [indexUrlInput, setIndexUrlInput] = useState(uiState.indexUrl);
  const [projectRootInput, setProjectRootInput] = useState(uiState.projectRoot);

  const [index, setIndex] = useState<IndexResponse | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  const [installed, setInstalled] = useState<InstalledEntry[]>([]);
  const [verifications, setVerifications] = useState<Record<string, { status: VerificationStatus; publisherId?: string }>>({});

  const loadIndex = useCallback(async (refresh = false) => {
    setLoading(true);
    setIndexError(null);
    try {
      const params = new URLSearchParams();
      params.set("url", uiState.indexUrl);
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/marketplace/index?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load index (${res.status})`);
      const body = (await res.json()) as IndexResponse;
      setIndex(body);
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [uiState.indexUrl]);

  const loadInstalled = useCallback(async () => {
    try {
      const params = uiState.projectRoot ? `?projectRoot=${encodeURIComponent(uiState.projectRoot)}` : "";
      const res = await fetch(`/api/marketplace/installed${params}`);
      if (!res.ok) return;
      const body = (await res.json()) as InstalledEntry[];
      setInstalled(body);
    } catch {
      /* best effort */
    }
  }, [uiState.projectRoot]);

  useEffect(() => {
    void loadIndex();
    void loadInstalled();
  }, [loadIndex, loadInstalled]);

  const verifyTemplate = useCallback(async (id: string) => {
    try {
      const params = new URLSearchParams({ url: uiState.indexUrl });
      const res = await fetch(`/api/marketplace/template/${encodeURIComponent(id)}?${params.toString()}`);
      if (!res.ok) return;
      const body = (await res.json()) as { verification?: { status: VerificationStatus; publisherId?: string } };
      if (body.verification) {
        setVerifications((prev) => ({ ...prev, [id]: body.verification! }));
      }
    } catch {
      /* best effort */
    }
  }, [uiState.indexUrl]);

  // Lazy verify each template when the index loads.
  useEffect(() => {
    if (!index) return;
    for (const t of index.templates) {
      if (!verifications[t.id]) {
        void verifyTemplate(t.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const installedById = useMemo(() => new Set(installed.map((i) => i.id)), [installed]);

  const onSaveIndexUrl = () => {
    const next = { ...uiState, indexUrl: indexUrlInput.trim() || DEFAULT_INDEX_URL };
    setUiState(next);
    saveUiState(next);
    toast.success("Marketplace source saved");
  };

  const onSaveProjectRoot = () => {
    const next = { ...uiState, projectRoot: projectRootInput.trim() };
    setUiState(next);
    saveUiState(next);
    toast.success("Project root saved");
  };

  const onInstall = async (entry: IndexEntry) => {
    setInstalling(entry.id);
    try {
      const res = await fetch("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          url: uiState.indexUrl,
          ...(uiState.projectRoot ? { projectRoot: uiState.projectRoot } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Install failed (${res.status})`);
      }
      const body = await res.json();
      toast.success(`Installed ${entry.name} (${(body.writtenFiles ?? []).length} file${body.writtenFiles?.length === 1 ? "" : "s"})`);
      void loadInstalled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(null);
    }
  };

  const onUninstall = async (id: string) => {
    try {
      const params = uiState.projectRoot ? `?projectRoot=${encodeURIComponent(uiState.projectRoot)}` : "";
      const res = await fetch(`/api/marketplace/installed/${encodeURIComponent(id)}${params}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Uninstall failed (${res.status})`);
      toast.success("Removed");
      void loadInstalled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Store size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Marketplace</h2>
      </div>

      <div className="glass-panel rounded-lg divide-y divide-border/70">
        {/* Source row */}
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="market-source">Index source</Label>
            <div className="flex gap-2">
              <Input
                id="market-source"
                value={indexUrlInput}
                onChange={(e) => setIndexUrlInput(e.target.value)}
                placeholder={DEFAULT_INDEX_URL}
              />
              <Button variant="outline" onClick={onSaveIndexUrl}>
                <RefreshCw size={14} className="mr-1" />
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Static manifest URL. No telemetry — FlowBoard only fetches this URL when you open this page.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="market-root">Project root (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="market-root"
                value={projectRootInput}
                onChange={(e) => setProjectRootInput(e.target.value)}
                placeholder="(uses current working directory)"
              />
              <Button variant="outline" onClick={onSaveProjectRoot}>
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Templates are written to <code>.flowboard/</code> under this directory. Leave blank to use the desktop app's working directory.
            </p>
          </div>
        </div>

        {/* Browse row */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Available templates</p>
            <Button variant="ghost" size="sm" onClick={() => loadIndex(true)} disabled={loading}>
              <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {indexError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Couldn't load index: {indexError}. Falling back to bundled templates may have failed.
            </p>
          )}

          {!index && !indexError && (
            <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">Loading…</p>
          )}

          {index && index.templates.length === 0 && (
            <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">No templates found in this index.</p>
          )}

          <div className="space-y-2">
            {index?.templates.map((t) => {
              const v = verifications[t.id];
              const isInstalled = installedById.has(t.id);
              return (
                <div key={t.id} className="rounded-md border border-border/70 bg-background/35 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{t.name}</p>
                        <Badge variant="outline" className="text-[10px]">v{t.version}</Badge>
                        {verificationBadge(v?.status ?? (t.author.verified ? "unknown" : "community"), t.author.name)}
                        {isInstalled && <Badge variant="secondary" className="gap-1"><CheckCircle2 size={10} /> Installed</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        by {t.author.name}
                        {t.author.url && (
                          <>
                            {" "}
                            <a className="underline" href={t.author.url} target="_blank" rel="noreferrer">
                              <ExternalLink size={10} className="inline" />
                            </a>
                          </>
                        )}
                        {t.tags.length > 0 && <> · {t.tags.join(", ")}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {isInstalled ? (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => onUninstall(t.id)}>
                          <Trash2 size={14} />
                          Remove
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => onInstall(t)}
                          disabled={installing === t.id}
                        >
                          <Download size={14} />
                          {installing === t.id ? "Installing…" : "Install"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Installing only writes files under <code>.flowboard/</code>. Nothing auto-runs — enable each rule or recipe in its own
            section after installing.
          </p>
        </div>
      </div>
    </section>
  );
}
