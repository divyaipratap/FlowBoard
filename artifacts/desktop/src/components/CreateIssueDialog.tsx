import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateIssue, getGetProjectSummaryQueryKey, getGetPulseTodayQueryKey, getListIssuesQueryKey, IssuePriority, IssueType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTypeIcon } from "./issue-visuals";
import { getCurrentUserName } from "@/lib/profile";
import { DEFAULT_STATUSES, getStatusLabel } from "@/lib/statuses";

interface CreateIssueDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus?: string;
  statuses?: Array<{ id: string; title: string; color: string }>;
}

export const CreateIssueDialog = ({ projectId, open, onOpenChange, defaultStatus, statuses }: CreateIssueDialogProps) => {
  const statusOptions = React.useMemo(
    () => statuses?.length ? statuses : DEFAULT_STATUSES.map((status) => ({ id: status.name, title: getStatusLabel(status.name), color: status.color })),
    [statuses]
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<IssueType>(IssueType.task);
  const [priority, setPriority] = useState<IssuePriority>(IssuePriority.medium);
  const [status, setStatus] = useState<string>(defaultStatus || statusOptions[0]?.id || "todo");
  const [assignee, setAssignee] = useState("");

  const queryClient = useQueryClient();
  const createIssue = useCreateIssue();

  // Reset state when opened with new defaults
  React.useEffect(() => {
    if (open) {
      const currentUserName = getCurrentUserName();
      setStatus(defaultStatus || statusOptions[0]?.id || "todo");
      setTitle("");
      setDescription("");
      setType(IssueType.task);
      setPriority(IssuePriority.medium);
      setAssignee(currentUserName);
    }
  }, [open, defaultStatus, statusOptions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    createIssue.mutate(
      {
        projectId,
        data: {
          title,
          description,
          type: type as any,
          priority: priority as any,
          status: status as any,
          assignee: assignee || undefined,
          reporter: getCurrentUserName(),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
          toast.success("Issue created");
          onOpenChange(false);
        },
        onError: () => {
          toast.error("Failed to create issue");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel sm:max-w-[600px] text-foreground">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Issue</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Issue title"
                className="bg-[#0a0a0a] text-lg font-medium border-none h-12"
                required
                autoFocus
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground uppercase">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as IssueType)}>
                  <SelectTrigger className="bg-[#0a0a0a]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(IssueType).map((t) => (
                      <SelectItem key={t} value={t}>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(t)}
                          <span className="capitalize">{t}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground uppercase">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="bg-[#0a0a0a]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="capitalize">{s.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground uppercase">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as IssuePriority)}>
                  <SelectTrigger className="bg-[#0a0a0a]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(IssuePriority).map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="capitalize">{p}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground uppercase">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                className="bg-[#0a0a0a] min-h-[150px] resize-none"
              />
            </div>
            
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground uppercase">Assignee</Label>
              <Input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder={getCurrentUserName()}
                className="bg-[#0a0a0a]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createIssue.isPending}>
              {createIssue.isPending ? "Creating..." : "Create Issue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
