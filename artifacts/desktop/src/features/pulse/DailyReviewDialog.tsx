import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PulseTask } from "./pulseTypes";
import { pulseKeys, useSaveDailyReview } from "./pulseHooks";

export const DailyReviewDialog = ({
  date,
  tasks,
  open,
  onOpenChange,
}: {
  date: string;
  tasks: PulseTask[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const saveReview = useSaveDailyReview();
  const [summary, setSummary] = useState("");
  const carriedTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === "done"), [tasks]);

  const save = () => {
    saveReview.mutate(
      {
        data: {
          date,
          summary,
          completedIssueIds: completedTasks.map((task) => task.issueId),
          carriedIssueIds: carriedTasks.map((task) => task.issueId),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: pulseKeys.today });
          toast.success("Daily review saved");
          onOpenChange(false);
        },
        onError: () => toast.error("Could not save review"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-accent" />
            Close the Loop
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="glass-card rounded-lg p-3">
              <p className="mb-2 text-xs uppercase text-muted-foreground">Completed today</p>
              {completedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Pulse tasks are marked done yet.</p>
              ) : completedTasks.map((task) => <p key={task.issueId} className="text-sm">{task.issueKey} - {task.title}</p>)}
            </div>
            <div className="glass-card rounded-lg p-3">
              <p className="mb-2 text-xs uppercase text-muted-foreground">Carried over</p>
              {carriedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to carry over.</p>
              ) : carriedTasks.map((task) => <p key={task.issueId} className="text-sm">{task.issueKey} - {task.title}</p>)}
            </div>
          </div>

          <div className="glass-card rounded-lg p-3">
            <p className="mb-2 text-xs uppercase text-muted-foreground">Suggested plan for tomorrow</p>
            <p className="text-sm text-muted-foreground">
              Start with the highest carried-over item, then review Risk Radar before creating new work.
            </p>
          </div>

          <Textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Optional end-of-day note"
            className="min-h-[110px] bg-background/70"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saveReview.isPending}>Close the Loop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
