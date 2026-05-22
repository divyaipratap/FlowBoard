import React, { useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { ProjectView } from "./pages/ProjectView";
import { Settings } from "./pages/Settings";
import { Today } from "./pages/Today";
import { ProfileSetupDialog } from "./components/ProfileSetupDialog";
import { PulsePage } from "./features/pulse/PulsePage";
import { useFlowBoardEvents } from "./hooks/use-flowboard-events";
import { AgentInboxProvider, useAgentInbox } from "./contexts/AgentInboxContext";
import { NotificationBell } from "./components/NotificationBell";
import { StatusConflictDialog } from "./features/team-sync/StatusConflictDialog";

type ThemeMode = "dark" | "light";

function getThemeMode(): ThemeMode {
  try {
    const settings = JSON.parse(window.localStorage.getItem("flowboard.settings") || "{}");
    return settings.themeMode === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function GlobalApprovalShortcut() {
  const { proposals, approve } = useAgentInbox();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "a") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (target?.isContentEditable ?? false)) return;
      if (proposals.length === 0) return;
      event.preventDefault();
      void approve(proposals[0].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [proposals, approve]);
  return null;
}

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getThemeMode());
  useFlowBoardEvents();

  useEffect(() => {
    const applyTheme = () => {
      const nextTheme = getThemeMode();
      setThemeMode(nextTheme);
      document.documentElement.classList.toggle("light", nextTheme === "light");
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      document.documentElement.style.colorScheme = nextTheme;
    };

    applyTheme();
    window.addEventListener("storage", applyTheme);
    window.addEventListener("flowboard:settings", applyTheme as EventListener);
    return () => {
      window.removeEventListener("storage", applyTheme);
      window.removeEventListener("flowboard:settings", applyTheme as EventListener);
    };
  }, []);

  return (
    <AgentInboxProvider>
      <div className="app-dotted-bg flex h-screen w-full text-foreground font-sans overflow-hidden">
        <Sidebar />
        <main className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="pointer-events-none absolute top-3 right-4 z-40">
            <div className="pointer-events-auto">
              <NotificationBell />
            </div>
          </div>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/today" component={Today} />
            <Route path="/pulse" component={PulsePage} />
            <Route path="/settings" component={Settings} />
            <Route path="/projects/:projectId/*?" component={ProjectView} />
            <Route>
              <div className="flex-1 flex items-center justify-center">
                <h1 className="text-xl text-muted-foreground">404 Not Found</h1>
              </div>
            </Route>
          </Switch>
        </main>
        <ProfileSetupDialog />
        <StatusConflictDialog />
        <Toaster theme={themeMode} position="bottom-right" />
        <GlobalApprovalShortcut />
      </div>
    </AgentInboxProvider>
  );
}

export default App;
