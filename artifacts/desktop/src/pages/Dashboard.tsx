import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Bot, CheckCircle2, Inbox, KanbanSquare, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import flowboardLockup from "@/assets/brand/flowboard-dark-mode-lockup.png";

const starterCards = [
  { icon: <KanbanSquare size={18} />, title: "Plan the board", text: "Create a project with lanes for work you can actually finish." },
  { icon: <Inbox size={18} />, title: "Capture quickly", text: "Drop ideas into Today, then turn them into real tickets later." },
  { icon: <Bot size={18} />, title: "Use local AI", text: "Ask Ollama to break goals into prioritized tickets when you need momentum." },
  { icon: <CheckCircle2 size={18} />, title: "Review progress", text: "Use the cockpit to spot stale work, decisions, and weekly movement." },
];

export const Dashboard = () => {
  const { data: projects, isLoading } = useListProjects();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (projects && projects.length > 0) {
      setLocation(`/projects/${projects[0].id}`);
    }
  }, [projects, setLocation]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-8 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-center">
          <div className="space-y-6">
            <img src={flowboardLockup} alt="FlowBoard" className="h-16 w-auto rounded-md object-contain shadow-2xl" />
            <div className="glass-card inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
              <Sparkles size={14} className="text-accent" />
              Local execution cockpit for solo builders
            </div>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white">Start with a project, then drive the work from one cockpit.</h1>
              <p className="max-w-xl text-muted-foreground">
                FlowBoard combines a focused Kanban board, quick capture, weekly review, templates, and optional local AI planning.
              </p>
            </div>
            <CreateProjectDialog>
              <Button size="lg" className="accent-glow bg-gradient-to-r from-primary to-accent">
                Create first project
              </Button>
            </CreateProjectDialog>
          </div>

          <div className="glass-panel rounded-lg p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Starter workflow</p>
                <p className="text-xs text-muted-foreground">What happens after project creation</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/15 text-accent">
                <Sparkles size={18} />
              </div>
            </div>
            <div className="space-y-3">
              {starterCards.map((card) => (
                <div key={card.title} className="glass-card flex gap-3 rounded-md p-3">
                  <div className="mt-0.5 text-accent">{card.icon}</div>
                  <div>
                    <p className="text-sm font-medium">{card.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{card.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
