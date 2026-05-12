import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { pulseKeys, useStartFlowSession, useStopFlowSession } from "./pulseHooks";

export const StartFlowButton = ({ issueId }: { issueId: string }) => {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const startFlow = useStartFlowSession();
  const stopFlow = useStopFlowSession();

  const refreshPulse = () => queryClient.invalidateQueries({ queryKey: pulseKeys.today });

  if (sessionId) {
    return (
      <Button
        variant="outline"
        className="gap-2"
        disabled={stopFlow.isPending}
        onClick={() => stopFlow.mutate(
          { id: sessionId, data: {} },
          {
            onSuccess: () => {
              setSessionId(null);
              refreshPulse();
              toast.success("Flow session stopped");
            },
            onError: () => toast.error("Could not stop flow session"),
          }
        )}
      >
        <Square size={15} />
        Stop Flow
      </Button>
    );
  }

  return (
    <Button
      className="accent-glow gap-2 bg-gradient-to-r from-primary to-accent"
      disabled={startFlow.isPending}
      onClick={() => startFlow.mutate(
        { data: { issueId } },
        {
          onSuccess: (response) => {
            setSessionId(response.session.id);
            refreshPulse();
            toast.success("Flow session started");
          },
          onError: () => toast.error("Could not start flow session"),
        }
      )}
    >
      <Play size={15} />
      Start Flow
    </Button>
  );
};
