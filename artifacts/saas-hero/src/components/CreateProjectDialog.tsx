import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocation } from "wouter";

const PRESET_COLORS = [
  "#8b5cf6", // Violet
  "#3b82f6", // Blue
  "#10b981", // Green
  "#f59e0b", // Yellow
  "#ef4444", // Red
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#6366f1", // Indigo
];

export const CreateProjectDialog = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const createProject = useCreateProject();

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    // Auto-generate key
    if (!key || key === generateKey(name)) {
      setKey(generateKey(newName));
    }
  };

  const generateKey = (name: string) => {
    const words = name.split(" ").filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase().slice(0, 4);
    }
    return name.slice(0, 3).toUpperCase();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !key) return;

    createProject.mutate(
      {
        data: { name, key, description, color },
      },
      {
        onSuccess: (newProject) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast.success("Project created");
          setOpen(false);
          setName("");
          setKey("");
          setDescription("");
          setColor(PRESET_COLORS[0]);
          setLocation(`/projects/${newProject.id}`);
        },
        onError: () => {
          toast.error("Failed to create project");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-[#141414] border-border text-foreground">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. Website Redesign"
                className="bg-[#0a0a0a]"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="key">Project Key</Label>
              <Input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="e.g. WEB"
                maxLength={6}
                className="bg-[#0a0a0a]"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                className="bg-[#0a0a0a]"
              />
            </div>
            <div className="grid gap-2">
              <Label>Project Color</Label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-6 h-6 rounded-full transition-transform ${
                      color === c ? "scale-125 ring-2 ring-primary ring-offset-2 ring-offset-[#141414]" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
