import React, { useEffect, useState } from "react";
import { Monitor, Moon, RotateCcw, Settings as SettingsIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const SETTINGS_KEY = "flowboard.settings";

type AppSettings = {
  denseBoard: boolean;
  reduceMotion: boolean;
};

const defaultSettings: AppSettings = {
  denseBoard: false,
  reduceMotion: false,
};

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export const Settings = () => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    toast.success("Settings saved");
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
    toast.success("Settings reset");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
      <header className="px-6 py-4 border-b border-border bg-[#141414]/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/15 text-primary flex items-center justify-center">
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
            <Monitor size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workspace</h2>
          </div>

          <div className="rounded-lg border border-border bg-[#141414] divide-y divide-border">
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
            <Moon size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Appearance</h2>
          </div>
          <div className="rounded-lg border border-border bg-[#141414] p-4">
            <div className="flex items-center justify-between gap-6">
              <div className="space-y-1">
                <p className="text-sm font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">Dark mode is enabled for the app.</p>
              </div>
              <span className="text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded px-2 py-1">
                Dark
              </span>
            </div>
          </div>
        </section>

        <Separator />

        <div className="flex justify-end">
          <Button variant="outline" onClick={resetSettings} className="gap-2">
            <RotateCcw size={16} />
            Reset settings
          </Button>
        </div>
      </div>
    </div>
  );
};
