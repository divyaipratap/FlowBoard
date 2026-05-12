import React, { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Activity, Plus, LayoutDashboard, Settings, Sparkles } from "lucide-react";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, loadProfile, LocalProfile, PROFILE_EVENT } from "@/lib/profile";
import flowboardIcon from "@/assets/brand/flowboard-icon-transparent.png";

export const Sidebar = () => {
  const { data: projects, isLoading } = useListProjects();
  const [location] = useLocation();
  const [profile, setProfile] = useState<LocalProfile | null>(() => loadProfile());

  useEffect(() => {
    const refreshProfile = () => setProfile(loadProfile());
    window.addEventListener(PROFILE_EVENT, refreshProfile as EventListener);
    return () => window.removeEventListener(PROFILE_EVENT, refreshProfile as EventListener);
  }, []);

  return (
    <div className="glass-panel z-10 w-64 h-screen border-r border-white/10 bg-background/55 flex flex-col flex-shrink-0">
      <div className="p-4 flex items-center gap-2 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white shadow-sm accent-glow">
          <img src={flowboardIcon} alt="" className="h-7 w-7 object-contain" />
        </div>
        <span className="font-semibold text-lg tracking-tight text-white">FlowBoard</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        <div className="space-y-1">
          <Link href="/">
            <button
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-all ${
                location === "/"
                  ? "glass-card text-white accent-glow"
                  : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <LayoutDashboard size={16} />
              <span className="truncate">Dashboard</span>
            </button>
          </Link>
          <Link href="/today">
            <button
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-all ${
                location === "/today"
                  ? "glass-card text-white accent-glow"
                  : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <Sparkles size={16} />
              <span className="truncate">Today</span>
            </button>
          </Link>
          <Link href="/pulse">
            <button
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-all ${
                location === "/pulse"
                  ? "glass-card text-white accent-glow"
                  : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <Activity size={16} />
              <span className="truncate">Pulse</span>
            </button>
          </Link>
        </div>
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
                          ? "glass-card text-white"
                          : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
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
      
      <div className="p-4 mt-auto border-t border-white/10">
        {profile && (
          <div className="glass-card mb-3 flex items-center gap-3 rounded-md px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: profile.avatarColor }}>
                {getInitials(profile.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.role || "Local profile"}</p>
            </div>
          </div>
        )}
        <Link href="/settings">
          <Button
            variant="ghost"
            className={`w-full justify-start gap-2 ${
              location === "/settings"
                ? "glass-card text-white"
                : "text-muted-foreground hover:bg-white/10 hover:text-white"
            }`}
          >
            <Settings size={16} />
            Settings
          </Button>
        </Link>
      </div>
    </div>
  );
};
