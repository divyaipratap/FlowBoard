import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import flowboardLockup from "@/assets/brand/flowboard-primary-lockup-transparent.png";

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
      <img src={flowboardLockup} alt="FlowBoard" className="mb-6 h-20 w-auto object-contain" />
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
