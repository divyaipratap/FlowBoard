export type ScheduleExpr = string;

export type ParsedSchedule =
  | { kind: "nightly"; hour: number; minute: number }
  | { kind: "hourly"; minute: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekday"; hour: number; minute: number }
  | { kind: "interval"; ms: number };

const HHMM = /^(\d{1,2}):(\d{2})$/;

function clampHM(hh: number, mm: number) {
  const hour = Number.isFinite(hh) && hh >= 0 && hh <= 23 ? hh : 3;
  const minute = Number.isFinite(mm) && mm >= 0 && mm <= 59 ? mm : 0;
  return { hour, minute };
}

export function parseScheduleExpr(raw: string): ParsedSchedule {
  const expr = (raw || "").trim().toLowerCase();
  if (!expr || expr === "nightly") return { kind: "nightly", hour: 3, minute: 0 };
  if (expr === "hourly") return { kind: "hourly", minute: 0 };

  const dailyMatch = expr.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (dailyMatch) {
    const { hour, minute } = clampHM(Number(dailyMatch[1]), Number(dailyMatch[2]));
    return { kind: "daily", hour, minute };
  }

  const weekdayMatch = expr.match(/^weekday\s+(\d{1,2}):(\d{2})$/);
  if (weekdayMatch) {
    const { hour, minute } = clampHM(Number(weekdayMatch[1]), Number(weekdayMatch[2]));
    return { kind: "weekday", hour, minute };
  }

  const everyMatch = expr.match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)$/);
  if (everyMatch) {
    const n = Math.max(1, Number(everyMatch[1]));
    const unit = everyMatch[2];
    const ms = unit.startsWith("m") && !unit.startsWith("min")
      ? n * 60_000
      : unit.startsWith("min")
        ? n * 60_000
        : n * 3_600_000;
    return { kind: "interval", ms };
  }

  const justHM = expr.match(HHMM);
  if (justHM) {
    const { hour, minute } = clampHM(Number(justHM[1]), Number(justHM[2]));
    return { kind: "daily", hour, minute };
  }

  return { kind: "nightly", hour: 3, minute: 0 };
}

function nextLocalAt(base: Date, hour: number, minute: number, alwaysFuture = true): Date {
  const next = new Date(base);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (alwaysFuture && next.getTime() <= base.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function computeNextRunAt(
  parsed: ParsedSchedule,
  now: Date,
  lastRunAt: Date | null,
): Date {
  if (parsed.kind === "nightly" || parsed.kind === "daily") {
    return nextLocalAt(now, parsed.hour, parsed.minute);
  }
  if (parsed.kind === "hourly") {
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(parsed.minute, 0, 0);
    if (next.getTime() <= now.getTime()) next.setHours(next.getHours() + 1);
    return next;
  }
  if (parsed.kind === "weekday") {
    const next = nextLocalAt(now, parsed.hour, parsed.minute);
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }
  // interval
  const anchor = lastRunAt ?? now;
  const next = new Date(anchor.getTime() + parsed.ms);
  if (next.getTime() <= now.getTime()) {
    return new Date(now.getTime() + parsed.ms);
  }
  return next;
}

export function describeSchedule(expr: string): string {
  const parsed = parseScheduleExpr(expr);
  switch (parsed.kind) {
    case "nightly":
      return `Every night at ${pad(parsed.hour)}:${pad(parsed.minute)}`;
    case "daily":
      return `Every day at ${pad(parsed.hour)}:${pad(parsed.minute)}`;
    case "hourly":
      return `Every hour at :${pad(parsed.minute)}`;
    case "weekday":
      return `Mon–Fri at ${pad(parsed.hour)}:${pad(parsed.minute)}`;
    case "interval": {
      const minutes = Math.round(parsed.ms / 60_000);
      if (minutes >= 60 && minutes % 60 === 0) return `Every ${minutes / 60}h`;
      return `Every ${minutes}m`;
    }
  }
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
