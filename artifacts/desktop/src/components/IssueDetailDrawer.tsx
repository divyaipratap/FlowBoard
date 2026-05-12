import React, { useEffect, useState, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  useGetIssue, 
  useUpdateIssue, 
  useDeleteIssue,
  useCreateIssue,
  useListIssues,
  useListProjectStatuses,
  useListComments,
  useListAttachments,
  useCreateAttachment,
  useDeleteAttachment,
  useCreateComment,
  useDeleteComment,
  getGetIssueQueryKey,
  getGetPulseTodayQueryKey,
  getGetProjectSummaryQueryKey,
  getListIssuesQueryKey,
  getListCommentsQueryKey,
  getListAttachmentsQueryKey,
  getListProjectStatusesQueryKey,
  Issue,
  IssuePriority, 
  IssueType 
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTypeIcon, getPriorityColor } from "./issue-visuals";
import { X, Trash2, MessageSquare, Loader2, Send, Target, ListPlus, CheckCircle2, Circle, Paperclip, Image as ImageIcon, FileText, Bot, GitBranch, TerminalSquare, FlaskConical } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { getEffortMap, isIssueInFocus, setIssueEffort, toggleFocusIssue } from "@/lib/productivity";
import { getCurrentUserName } from "@/lib/profile";
import { useLocation } from "wouter";
import { DEFAULT_STATUSES, getDoneStatus, getStatusLabel } from "@/lib/statuses";

const MAX_ATTACHMENTS_PER_ISSUE = 5;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

interface IssueDetailDrawerProps {
  issueId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AgentWorklogEntry = {
  id: string;
  agentName: string;
  summary: string;
  changedFiles: string[];
  commandsRun: string[];
  testsRun: string[];
  followUps: string[];
  createdAt: string | number;
};

export const IssueDetailDrawer = ({ issueId, projectId, open, onOpenChange }: IssueDetailDrawerProps) => {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const selectedIssueId = issueId || "";
  const { data: issue, isLoading } = useGetIssue(selectedIssueId, {
    query: {
      queryKey: getGetIssueQueryKey(selectedIssueId),
      enabled: !!issueId,
      refetchInterval: open ? 1000 : false,
      refetchIntervalInBackground: true,
      staleTime: 0,
    },
  });
  const { data: projectIssues = [] } = useListIssues(projectId, undefined, {
    query: {
      queryKey: getListIssuesQueryKey(projectId),
      enabled: !!projectId && !!issueId,
      refetchInterval: open ? 1000 : false,
      refetchIntervalInBackground: true,
      staleTime: 0,
    },
  });
  const { data: projectStatuses = DEFAULT_STATUSES } = useListProjectStatuses(projectId, {
    query: { queryKey: getListProjectStatusesQueryKey(projectId), enabled: !!projectId },
  });
  const doneStatus = getDoneStatus(projectStatuses);
  const { data: comments } = useListComments(selectedIssueId, {
    query: { queryKey: getListCommentsQueryKey(selectedIssueId), enabled: !!issueId },
  });
  const { data: attachments = [] } = useListAttachments(selectedIssueId, {
    query: { queryKey: getListAttachmentsQueryKey(selectedIssueId), enabled: !!issueId },
  });
  const { data: worklogEntries = [] } = useQuery({
    queryKey: ["/api/issues", selectedIssueId, "agent-worklog"],
    queryFn: async () => {
      const response = await fetch(`/api/issues/${selectedIssueId}/agent-worklog`);
      if (!response.ok) throw new Error("Failed to load agent worklog");
      return response.json() as Promise<AgentWorklogEntry[]>;
    },
    enabled: !!issueId,
  });
  
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const createIssue = useCreateIssue();
  const createAttachment = useCreateAttachment();
  const deleteAttachment = useDeleteAttachment();

  // Local state for debounced editing
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newComment, setNewComment] = useState("");
  const [breakdownText, setBreakdownText] = useState("");
  const [effort, setEffort] = useState("none");
  const [inFocus, setInFocus] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (issue && initializedForId.current !== issue.id) {
      initializedForId.current = issue.id;
      setTitle(issue.title);
      setDescription(issue.description || "");
      setEffort(getEffortMap()[issue.id] || "none");
      setInFocus(isIssueInFocus(issue.id));
    }
  }, [issue]);

  const subtasks = issue
    ? projectIssues.filter((candidate) => {
        if (candidate.id === issue.id) return false;
        const labels = Array.isArray(candidate.labels) ? candidate.labels : [];
        const description = (candidate as Issue & { description?: string }).description || "";
        return labels.includes(`parent:${issue.id}`) || description.startsWith(`Breakdown item from ${issue.issueKey}:`);
      })
    : [];

  const patchIssueInListCache = (issueId: string, patch: Partial<Issue>) => {
    queryClient.setQueriesData(
      {
        predicate: (query) => {
          const [first] = query.queryKey;
          return typeof first === "string" && first === `/api/projects/${projectId}/issues`;
        },
      },
      (old: Issue[] | undefined) => {
        if (!old) return old;
        return old.map((cachedIssue) => cachedIssue.id === issueId ? { ...cachedIssue, ...patch } : cachedIssue);
      }
    );
  };

  // Handle immediate updates for selects
  const handleUpdate = (field: string, value: string) => {
    if (!issueId) return;
    const previousIssue = issue;
    const patch = { [field]: value } as Partial<Issue>;
    
    // Optimistic update
    queryClient.setQueryData(getGetIssueQueryKey(issueId), (old: any) => {
      if (!old) return old;
      return { ...old, ...patch };
    });
    patchIssueInListCache(issueId, patch);

    updateIssue.mutate(
      {
        issueId,
        data: { [field]: value } as any,
      },
      {
        onError: () => {
          if (previousIssue) {
            queryClient.setQueryData(getGetIssueQueryKey(issueId), previousIssue);
            patchIssueInListCache(issueId, previousIssue);
          }
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(projectId) });
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
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
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
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
          queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
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
        data: { content: newComment, author: getCurrentUserName() }
      },
      {
        onSuccess: () => {
          setNewComment("");
          queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey(issueId) });
        }
      }
    );
  };

  const handleToggleFocus = () => {
    if (!issue) return;
    const added = toggleFocusIssue(issue);
    setInFocus(added);
    toast.success(added ? "Added to focus queue" : "Removed from focus queue");
  };

  const handleEffortChange = (value: string) => {
    if (!issueId) return;
    setEffort(value);
    setIssueEffort(issueId, value as any);
    toast.success("Effort saved");
  };

  const handleBreakdown = async () => {
    if (!issue || !breakdownText.trim()) return;
    const lines = breakdownText
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
    if (lines.length === 0) return;

    await Promise.all(lines.map((line) =>
      createIssue.mutateAsync({
        projectId,
        data: {
          title: line,
          description: `Breakdown item from ${issue.issueKey}: ${issue.title}`,
          status: projectStatuses[0]?.name || "todo",
          priority: issue.priority,
          type: IssueType.task,
          assignee: getCurrentUserName(),
          reporter: getCurrentUserName(),
          labels: [`parent:${issue.id}`, "subtask"],
        },
      })
    ));
    setBreakdownText("");
    queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
    toast.success(`Created ${lines.length} breakdown issue${lines.length === 1 ? "" : "s"}`);
  };

  const readFileContent = (file: File, kind: "image" | "text") => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    if (kind === "image") reader.readAsDataURL(file);
    else reader.readAsText(file);
  });

  const handleAttachmentFiles = async (files: FileList | null) => {
    if (!issueId || !files || files.length === 0) return;
    const selected = Array.from(files);
    const totalExistingBytes = attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
    let nextCount = attachments.length;
    let nextTotalBytes = totalExistingBytes;

    for (const file of selected) {
      if (nextCount >= MAX_ATTACHMENTS_PER_ISSUE) {
        toast.error(`Each ticket can have up to ${MAX_ATTACHMENTS_PER_ISSUE} attachments`);
        break;
      }

      const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
      const isText = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
      const kind = isImage ? "image" : isText ? "text" : null;
      if (!kind) {
        toast.error(`${file.name} is not supported. Use images or .txt files.`);
        continue;
      }

      const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
      if (file.size > limit) {
        toast.error(kind === "image" ? `${file.name} is over 2 MB` : `${file.name} is over 256 KB`);
        continue;
      }

      if (nextTotalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        toast.error("Total attachment size for this ticket must stay under 8 MB");
        break;
      }

      const content = await readFileContent(file, kind);
      await createAttachment.mutateAsync({
        issueId,
        data: {
          fileName: file.name,
          mimeType: kind === "text" ? "text/plain" : file.type,
          kind,
          sizeBytes: file.size,
          content,
        },
      });
      nextCount += 1;
      nextTotalBytes += file.size;
    }

    queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(issueId) });
    queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (attachmentId: string) => {
    if (!issueId) return;
    deleteAttachment.mutate(
      { attachmentId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(issueId) });
          toast.success("Attachment removed");
        },
        onError: () => toast.error("Could not remove attachment"),
      }
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="glass-panel h-screen top-0 right-0 left-auto mt-0 w-[600px] rounded-none border-l border-white/10">
        {isLoading || !issue ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden text-foreground">
            {/* Header */}
            <div className="glass-card px-6 py-4 flex items-center justify-between border-x-0 border-t-0">
              <div className="flex items-center gap-2 text-muted-foreground text-sm font-mono">
                {getTypeIcon(issue.type)}
                <span>{issue.issueKey}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleToggleFocus} className={inFocus ? "text-primary" : "text-muted-foreground hover:text-white"}>
                  <Target size={16} />
                  {inFocus ? "Focused" : "Focus"}
                </Button>
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
              <div className="glass-card grid grid-cols-2 gap-4 p-4 rounded-lg">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Status</span>
                  <Select value={issue.status} onValueChange={(v) => handleUpdate('status', v)}>
                    <SelectTrigger className="bg-[#0a0a0a] h-8 text-xs border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {projectStatuses.map((s) => (
                        <SelectItem key={s.name} value={s.name} className="text-xs">
                          <span className="capitalize">{getStatusLabel(s.name)}</span>
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

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Energy / Effort</span>
                  <Select value={effort} onValueChange={handleEffortChange}>
                    <SelectTrigger className="bg-[#0a0a0a] h-8 text-xs border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="low">Low effort</SelectItem>
                      <SelectItem value="medium">Medium effort</SelectItem>
                      <SelectItem value="high">High effort</SelectItem>
                      <SelectItem value="shallow">Shallow work</SelectItem>
                      <SelectItem value="deep">Deep work</SelectItem>
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

              <div className="space-y-3 pt-4 border-t border-border">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ListPlus size={16} />
                  Breakdown Mode
                </h3>
                <Textarea
                  value={breakdownText}
                  onChange={(e) => setBreakdownText(e.target.value)}
                  placeholder="Add one sub-task per line..."
                  className="min-h-[110px] bg-[#141414] border-white/10 resize-none"
                />
                <Button onClick={handleBreakdown} disabled={!breakdownText.trim() || createIssue.isPending} className="gap-2">
                  <ListPlus size={16} />
                  Create breakdown issues
                </Button>
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    Subtasks
                  </h3>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                    {subtasks.length}
                  </span>
                </div>
                {subtasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-background/35 p-4 text-sm text-muted-foreground">
                    Breakdown items created from this ticket will appear here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {subtasks.map((subtask) => (
                      <button
                        key={subtask.id}
                        type="button"
                        onClick={() => setLocation(`/projects/${projectId}/issues/${subtask.id}`)}
                        className="glass-card flex w-full items-start justify-between gap-3 rounded-lg p-3 text-left transition-colors hover:border-accent/45 hover:bg-white/10"
                      >
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Circle size={8} fill={subtask.status === doneStatus ? "#22c55e" : "#94a3b8"} color={subtask.status === doneStatus ? "#22c55e" : "#94a3b8"} />
                            <span className="font-mono">{subtask.issueKey}</span>
                            <span className="capitalize">{getStatusLabel(subtask.status)}</span>
                          </div>
                          <p className="line-clamp-2 text-sm font-medium text-foreground">{subtask.title}</p>
                        </div>
                        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] capitalize ${getPriorityColor(subtask.priority)}`}>
                          {subtask.priority}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip size={16} />
                      Attachments
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Images up to 2 MB, .txt up to 256 KB, max {MAX_ATTACHMENTS_PER_ISSUE} files.
                    </p>
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/gif,text/plain,.txt"
                      className="hidden"
                      onChange={(event) => handleAttachmentFiles(event.target.files)}
                    />
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={attachments.length >= MAX_ATTACHMENTS_PER_ISSUE || createAttachment.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={16} />
                      Attach file
                    </Button>
                  </div>
                </div>

                {attachments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-background/35 p-4 text-sm text-muted-foreground">
                    Attach screenshots, mockups, notes, or small text files to this ticket.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="glass-card rounded-lg p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 rounded-md bg-accent/15 p-2 text-accent">
                              {attachment.kind === "image" ? <ImageIcon size={16} /> : <FileText size={16} />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {attachment.kind} · {formatBytes(attachment.sizeBytes)} · {format(new Date(attachment.createdAt), "MMM d, h:mm a")}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={deleteAttachment.isPending}
                            onClick={() => removeAttachment(attachment.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                        {attachment.kind === "image" ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ src: attachment.content, name: attachment.fileName })}
                            className="group relative block w-full overflow-hidden rounded-md border border-white/10 bg-background/60"
                          >
                            <img
                              src={attachment.content}
                              alt={attachment.fileName}
                              className="max-h-56 w-full object-contain transition-transform group-hover:scale-[1.01]"
                            />
                            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                              View full image
                            </span>
                          </button>
                        ) : (
                          <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                            {attachment.content}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Bot size={16} />
                    Agent Worklog
                  </h3>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                    {worklogEntries.length}
                  </span>
                </div>
                {worklogEntries.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-background/35 p-4 text-sm text-muted-foreground">
                    Agent implementation summaries will appear here with files, commands, tests, and follow-ups.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {worklogEntries.map((entry) => (
                      <div key={entry.id} className="glass-card rounded-lg p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{entry.summary}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {entry.agentName} · {format(new Date(entry.createdAt), "MMM d, h:mm a")}
                            </p>
                          </div>
                        </div>
                        <WorklogList icon={<GitBranch size={14} />} label="Files changed" items={entry.changedFiles} />
                        <WorklogList icon={<TerminalSquare size={14} />} label="Commands" items={entry.commandsRun} />
                        <WorklogList icon={<FlaskConical size={14} />} label="Validation" items={entry.testsRun} />
                        <WorklogList icon={<ListPlus size={14} />} label="Follow-ups" items={entry.followUps} />
                      </div>
                    ))}
                  </div>
                )}
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
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="glass-panel h-[88vh] max-w-[92vw] p-0">
          <DialogHeader className="border-b border-white/10 px-4 py-3">
            <DialogTitle className="truncate text-sm">{previewImage?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            {previewImage && (
              <img
                src={previewImage.src}
                alt={previewImage.name}
                className="max-h-full max-w-full rounded-md object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
};

const WorklogList = ({ icon, label, items }: { icon: React.ReactNode; label: string; items: string[] }) => {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="rounded-md border border-white/10 bg-background/45 px-2 py-1.5 text-xs text-foreground/80">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
};
