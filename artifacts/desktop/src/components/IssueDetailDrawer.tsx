import React, { useEffect, useState, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  useGetIssue, 
  useUpdateIssue, 
  useDeleteIssue,
  useListComments,
  useCreateComment,
  useDeleteComment,
  getGetIssueQueryKey,
  getListIssuesQueryKey,
  getListCommentsQueryKey,
  IssueStatus, 
  IssuePriority, 
  IssueType 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTypeIcon, getPriorityColor } from "./IssueCard";
import { X, Trash2, MessageSquare, Loader2, Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";

interface IssueDetailDrawerProps {
  issueId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const IssueDetailDrawer = ({ issueId, projectId, open, onOpenChange }: IssueDetailDrawerProps) => {
  const queryClient = useQueryClient();
  const { data: issue, isLoading } = useGetIssue(issueId || "", { query: { enabled: !!issueId } });
  const { data: comments } = useListComments(issueId || "", { query: { enabled: !!issueId } });
  
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();

  // Local state for debounced editing
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newComment, setNewComment] = useState("");
  
  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (issue && initializedForId.current !== issue.id) {
      initializedForId.current = issue.id;
      setTitle(issue.title);
      setDescription(issue.description || "");
    }
  }, [issue]);

  // Handle immediate updates for selects
  const handleUpdate = (field: string, value: string) => {
    if (!issueId) return;
    
    // Optimistic update
    queryClient.setQueryData(getGetIssueQueryKey(issueId), (old: any) => {
      if (!old) return old;
      return { ...old, [field]: value };
    });

    updateIssue.mutate(
      {
        issueId,
        data: { [field]: value } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(projectId) });
        },
      }
    );
  };

  const handleBlurUpdate = (field: 'title' | 'description', value: string) => {
    if (!issueId || !issue || issue[field] === value) return;
    
    updateIssue.mutate(
      {
        issueId,
        data: { [field]: value },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(projectId) });
        },
      }
    );
  };

  const handleDelete = () => {
    if (!issueId || !window.confirm("Are you sure you want to delete this issue?")) return;
    
    deleteIssue.mutate(
      { issueId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(projectId) });
          toast.success("Issue deleted");
          onOpenChange(false);
        }
      }
    );
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueId || !newComment.trim()) return;

    createComment.mutate(
      {
        issueId,
        data: { content: newComment, author: "You" }
      },
      {
        onSuccess: () => {
          setNewComment("");
          queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey(issueId) });
        }
      }
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-screen top-0 right-0 left-auto mt-0 w-[600px] rounded-none bg-[#0a0a0a] border-l border-border">
        {isLoading || !issue ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden text-foreground">
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-border bg-[#141414]">
              <div className="flex items-center gap-2 text-muted-foreground text-sm font-mono">
                {getTypeIcon(issue.type)}
                <span>{issue.issueKey}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handleDelete} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 size={16} />
                </Button>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
                    <X size={16} />
                  </Button>
                </DrawerClose>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Title */}
              <div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => handleBlurUpdate('title', title)}
                  className="text-2xl font-bold bg-transparent border-transparent px-0 h-auto focus-visible:ring-0 focus-visible:border-primary shadow-none hover:bg-secondary/30 transition-colors"
                />
              </div>

              {/* Properties Grid */}
              <div className="grid grid-cols-2 gap-4 bg-[#141414] p-4 rounded-lg border border-border">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Status</span>
                  <Select value={issue.status} onValueChange={(v) => handleUpdate('status', v)}>
                    <SelectTrigger className="bg-[#0a0a0a] h-8 text-xs border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(IssueStatus).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          <span className="capitalize">{s.replace("_", " ")}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Assignee</span>
                  <Input
                    value={issue.assignee || ""}
                    onChange={(e) => handleUpdate('assignee', e.target.value)}
                    placeholder="Unassigned"
                    className="bg-[#0a0a0a] h-8 text-xs border-white/10"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Priority</span>
                  <Select value={issue.priority} onValueChange={(v) => handleUpdate('priority', v)}>
                    <SelectTrigger className={`bg-[#0a0a0a] h-8 text-xs border-white/10 ${getPriorityColor(issue.priority)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(IssuePriority).map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                          <span className="capitalize">{p}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Type</span>
                  <Select value={issue.type} onValueChange={(v) => handleUpdate('type', v)}>
                    <SelectTrigger className="bg-[#0a0a0a] h-8 text-xs border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(IssueType).map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(t, 12)}
                            <span className="capitalize">{t}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <span className="text-sm font-semibold">Description</span>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => handleBlurUpdate('description', description)}
                  placeholder="Add a description..."
                  className="min-h-[150px] bg-[#141414] border-white/10 resize-none hover:bg-[#1a1a1a] focus:bg-[#141414] transition-colors"
                />
              </div>

              {/* Comments */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare size={16} />
                  Comments
                </h3>

                <div className="space-y-4">
                  {comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs bg-primary/20 text-primary">
                          {comment.author.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-medium">{comment.author}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap bg-[#141414] p-3 rounded-lg border border-white/5">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2 items-end pt-2">
                  <div className="flex-1">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write a comment..."
                      className="min-h-[80px] bg-[#141414] border-white/10 resize-none"
                    />
                  </div>
                  <Button type="submit" size="icon" disabled={!newComment.trim() || createComment.isPending} className="shrink-0">
                    <Send size={16} />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};
