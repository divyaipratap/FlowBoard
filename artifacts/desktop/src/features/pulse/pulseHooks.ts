import {
  getGetPulseTodayQueryKey,
  useGetPulseToday,
  useRecomputePulse,
  useSaveDailyReview,
  useStartFlowSession,
  useStopFlowSession,
} from "@workspace/api-client-react";

export const pulseKeys = {
  today: getGetPulseTodayQueryKey(),
};

export {
  useGetPulseToday as usePulseToday,
  useRecomputePulse,
  useSaveDailyReview,
  useStartFlowSession,
  useStopFlowSession,
};
