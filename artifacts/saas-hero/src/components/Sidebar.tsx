import React from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Plus, LayoutDashboard, Settings } from "lucide-react";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Sidebar = () => {
  const { data: projects, isLoading } = useListProjects();
  const [location] = useLocation();

  return (
    <div className="w-64 h-screen border-r border-border bg-[#0a0a0a] flex flex-col flex-shrink-0">
      <div className="p-4 flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold shadow-[0_0_15px_rgba(139,92,246,0.5)]">
          F
        </div>
        <span className="font-semibold text-lg tracking-tight text-white">FlowBoard</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Projects
            </span>
            <CreateProjectDialog>
              <button className="text-muted-foreground hover:text-white transition-colors">
                <Plus size={16} />
              </button>
            </CreateProjectDialog>
          </div>
          
          <div className="space-y-1">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <Skeleton className="w-4 h-4 rounded-sm" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            ) : projects?.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                No projects yet.
              </div>
            ) : (
              projects?.map((p) => {
                const isActive = location.startsWith(`/projects/${p.id}`);
                return (
                  <Link href={`/projects/${p.id}`} key={p.id}>
                    <button
                      className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-all ${
                        isActive
                          ? "bg-secondary text-white"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      }`}
                    >
                      <div
                        className="w-3 h-3 rounded-sm shadow-sm"
                        style={{ backgroundColor: p.color || "#8b5cf6" }}
                      />
                      <span className="truncate">{p.name}</span>
                    </button>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
      
      <div className="p-4 mt-auto border-t border-border">
        <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground hover:text-white">
          <Settings size={16} />
          Settings
        </Button>
      </div>
    </div>
  );
};
