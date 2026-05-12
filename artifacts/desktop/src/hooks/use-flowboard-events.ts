import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetIssueQueryKey,
  getGetProjectSummaryQueryKey,
  getGetPulseTodayQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";

type FlowBoardEvent = {
  type?: string;
  issueId?: string | null;
  projectId?: string | null;
};

export function useFlowBoardEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");

    const refreshProjectIssues = (projectId: string) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const [first] = query.queryKey;
          return typeof first === "string" && first === `/api/projects/${projectId}/issues`;
        },
      });
    };

    const refresh = (event: MessageEvent<string>) => {
      let payload: FlowBoardEvent = {};
      try {
        payload = JSON.parse(event.data) as FlowBoardEvent;
      } catch {
        return;
      }

      if (payload.type === "connected") return;

      if (payload.projectId) {
        refreshProjectIssues(payload.projectId);
        queryClient.invalidateQueries({ queryKey: getGetProjectSummaryQueryKey(payload.projectId) });
      }

      if (payload.issueId) {
        queryClient.invalidateQueries({ queryKey: getGetIssueQueryKey(payload.issueId) });
        queryClient.invalidateQueries({ queryKey: ["/api/issues", payload.issueId, "agent-worklog"] });
      }

      if (payload.type === "issue.created" || payload.type === "issue.deleted" || payload.type === "project.changed") {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      }

      if (payload.type === "issue.created" || payload.type === "issue.updated" || payload.type === "issue.deleted") {
        queryClient.invalidateQueries({ queryKey: getGetPulseTodayQueryKey() });
      }

      if (payload.type === "proposal.changed") {
        window.dispatchEvent(new CustomEvent("flowboard:agent-bridge-changed"));
      }
    };

    source.addEventListener("flowboard", refresh as EventListener);

    return () => {
      source.removeEventListener("flowboard", refresh as EventListener);
      source.close();
    };
  }, [queryClient]);
}
