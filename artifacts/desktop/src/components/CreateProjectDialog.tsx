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
import { useCreateProject, getGetPulseTodayQueryKey, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Plus, Trash2 } from "lucide-react";
import { DEFAULT_STATUSES, LocalStatus } from "@/lib/statuses";

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
  const [statuses, setStatuses] = useState<LocalStatus[]>(DEFAULT_STATUSES);
  
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
        data: { name, key, description, color, statuses },
      },
      {
        onSuccess: (newProject) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
          toast.success("Project created");
          setOpen(false);
          setName("");
          setKey("");
          setDescription("");
          setColor(PRESET_COLORS[0]);
          setStatuses(DEFAULT_STATUSES);
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
      <DialogContent className="glass-panel sm:max-w-[560px] text-foreground">
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
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Status columns</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setStatuses((items) => [...items, { name: "blocked", color: "#ef4444", position: items.length }])}
                >
                  <Plus size={14} />
                  Add status
                </Button>
              </div>
              <div className="space-y-2 rounded-lg border border-white/10 bg-background/35 p-2">
                {statuses.map((status, index) => (
                  <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2">
                    <Input
                      value={status.name}
                      onChange={(event) => setStatuses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                      placeholder="Status name"
                      className="bg-[#0a0a0a]"
                    />
                    <Input
                      type="color"
                      value={status.color}
                      onChange={(event) => setStatuses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))}
                      className="h-10 bg-[#0a0a0a] p-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={statuses.length <= 1}
                      onClick={() => setStatuses((items) => items.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, position: itemIndex })))}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Rename defaults or add states like blocked. The last status is treated as completed.</p>
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
