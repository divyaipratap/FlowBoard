import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "../components/CreateProjectDialog";

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
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(139,92,246,0.3)]">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xl">
          F
        </div>
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-3">Welcome to FlowBoard</h1>
      <p className="text-muted-foreground mb-8">
        Get started by creating your first project to organize your tasks, bugs, and workflows.
      </p>
      
      <CreateProjectDialog>
        <Button size="lg" className="w-full sm:w-auto shadow-lg shadow-primary/20">
          Create Your First Project
        </Button>
      </CreateProjectDialog>
    </div>
  );
};
