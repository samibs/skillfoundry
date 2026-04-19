/**
 * Natural Language Cron Compiler — converts English scheduling descriptions
 * into cron expressions.
 *
 * Inspired by Hermes Agent's natural language automation. Supports common
 * scheduling patterns without requiring users to know cron syntax.
 *
 * Examples:
 *   "every morning at 9am"        ->  0 9 * * *
 *   "every 30 minutes"            ->  star/30 * * * *
 *   "weekdays at 2:30pm"          ->  30 14 * * 1-5
 *   "first day of every month"    ->  0 0 1 * *
 *   "every sunday at midnight"    ->  0 0 * * 0
 *   "twice a day at 9am and 5pm"  ->  0 9,17 * * *
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface CronResult {
  /** The generated cron expression */
  expression: string;
  /** Human-readable description of what the cron does */
  description: string;
  /** Next 5 execution times (ISO strings) */
  nextRuns: string[];
  /** Whether this was an exact match or best-effort parse */
  confidence: "exact" | "high" | "medium" | "low";
  /** The original input text */
  input: string;
}

export interface CronJob {
  /** Unique job ID */
  id: string;
  /** Cron expression */
  expression: string;
  /** Human description */
  description: string;
  /** Command or tool to execute */
  command: string;
  /** Project path context */
  projectPath?: string;
  /** Whether the job is active */
  active: boolean;
  /** When the job was created */
  createdAt: string;
}

// ── Pattern Matching ──────────────────────────────────────────────────

interface CronPattern {
  regex: RegExp;
  handler: (match: RegExpMatchArray) => { expression: string; description: string };
  confidence: "exact" | "high" | "medium";
}

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

/**
 * Parse a time string like "9am", "2:30pm", "14:00", "midnight", "noon"
 */
function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const s = timeStr.toLowerCase().trim();

  if (s === "midnight") return { hour: 0, minute: 0 };
  if (s === "noon" || s === "midday") return { hour: 12, minute: 0 };

  // "2:30pm", "9:00am", "14:30"
  const timeMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!timeMatch) return null;

  let hour = parseInt(timeMatch[1], 10);
  const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const ampm = timeMatch[3]?.toLowerCase();

  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Parse a day name to cron day-of-week number.
 */
function parseDay(dayStr: string): number | null {
  return DAY_MAP[dayStr.toLowerCase().trim()] ?? null;
}

// ── Cron Patterns ─────────────────────────────────────────────────────

const PATTERNS: CronPattern[] = [
  // "every N minutes"
  {
    regex: /every\s+(\d+)\s+minutes?/i,
    handler: (m) => ({
      expression: `*/${m[1]} * * * *`,
      description: `Every ${m[1]} minutes`,
    }),
    confidence: "exact",
  },
  // "every N hours"
  {
    regex: /every\s+(\d+)\s+hours?/i,
    handler: (m) => ({
      expression: `0 */${m[1]} * * *`,
      description: `Every ${m[1]} hours`,
    }),
    confidence: "exact",
  },
  // "every minute"
  {
    regex: /every\s+minute/i,
    handler: () => ({
      expression: "* * * * *",
      description: "Every minute",
    }),
    confidence: "exact",
  },
  // "every hour"
  {
    regex: /every\s+hour(?:\s+at\s+(\d+)\s+minutes?\s+past)?/i,
    handler: (m) => {
      const min = m[1] ? m[1] : "0";
      return {
        expression: `${min} * * * *`,
        description: m[1] ? `Every hour at ${min} minutes past` : "Every hour",
      };
    },
    confidence: "exact",
  },
  // "every day at TIME" / "daily at TIME"
  {
    regex: /(?:every\s+day|daily)\s+at\s+(.+)/i,
    handler: (m) => {
      const time = parseTime(m[1]);
      if (!time) return { expression: "0 0 * * *", description: "Daily at midnight" };
      return {
        expression: `${time.minute} ${time.hour} * * *`,
        description: `Daily at ${m[1].trim()}`,
      };
    },
    confidence: "exact",
  },
  // "every morning at TIME" / "every morning"
  {
    regex: /every\s+morning(?:\s+at\s+(.+))?/i,
    handler: (m) => {
      const time = m[1] ? parseTime(m[1]) : { hour: 9, minute: 0 };
      if (!time) return { expression: "0 9 * * *", description: "Every morning at 9:00 AM" };
      return {
        expression: `${time.minute} ${time.hour} * * *`,
        description: `Every morning at ${m[1]?.trim() || "9:00 AM"}`,
      };
    },
    confidence: "exact",
  },
  // "every evening at TIME" / "every evening"
  {
    regex: /every\s+evening(?:\s+at\s+(.+))?/i,
    handler: (m) => {
      const time = m[1] ? parseTime(m[1]) : { hour: 18, minute: 0 };
      if (!time) return { expression: "0 18 * * *", description: "Every evening at 6:00 PM" };
      return {
        expression: `${time.minute} ${time.hour} * * *`,
        description: `Every evening at ${m[1]?.trim() || "6:00 PM"}`,
      };
    },
    confidence: "exact",
  },
  // "every night at TIME" / "every night"
  {
    regex: /every\s+night(?:\s+at\s+(.+))?/i,
    handler: (m) => {
      const time = m[1] ? parseTime(m[1]) : { hour: 22, minute: 0 };
      if (!time) return { expression: "0 22 * * *", description: "Every night at 10:00 PM" };
      return {
        expression: `${time.minute} ${time.hour} * * *`,
        description: `Every night at ${m[1]?.trim() || "10:00 PM"}`,
      };
    },
    confidence: "exact",
  },
  // "weekdays at TIME" / "every weekday at TIME"
  {
    regex: /(?:every\s+)?weekdays?\s+at\s+(.+)/i,
    handler: (m) => {
      const time = parseTime(m[1]);
      if (!time) return { expression: "0 9 * * 1-5", description: "Weekdays at 9:00 AM" };
      return {
        expression: `${time.minute} ${time.hour} * * 1-5`,
        description: `Weekdays at ${m[1].trim()}`,
      };
    },
    confidence: "exact",
  },
  // "weekends at TIME"
  {
    regex: /(?:every\s+)?weekends?\s+at\s+(.+)/i,
    handler: (m) => {
      const time = parseTime(m[1]);
      if (!time) return { expression: "0 10 * * 0,6", description: "Weekends at 10:00 AM" };
      return {
        expression: `${time.minute} ${time.hour} * * 0,6`,
        description: `Weekends at ${m[1].trim()}`,
      };
    },
    confidence: "exact",
  },
  // "every DAYNAME at TIME"
  {
    regex: /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\s+at\s+(.+)/i,
    handler: (m) => {
      const day = parseDay(m[1]);
      const time = parseTime(m[2]);
      if (day === null) return { expression: "0 0 * * 0", description: "Every Sunday at midnight" };
      if (!time) return { expression: `0 0 * * ${day}`, description: `Every ${m[1]} at midnight` };
      return {
        expression: `${time.minute} ${time.hour} * * ${day}`,
        description: `Every ${m[1]} at ${m[2].trim()}`,
      };
    },
    confidence: "exact",
  },
  // "twice a day at TIME and TIME"
  {
    regex: /twice\s+(?:a|per)\s+day\s+at\s+(.+?)\s+and\s+(.+)/i,
    handler: (m) => {
      const t1 = parseTime(m[1]);
      const t2 = parseTime(m[2]);
      if (!t1 || !t2) return { expression: "0 9,17 * * *", description: "Twice a day at 9am and 5pm" };
      return {
        expression: `${t1.minute === t2.minute ? t1.minute : "0"} ${t1.hour},${t2.hour} * * *`,
        description: `Twice a day at ${m[1].trim()} and ${m[2].trim()}`,
      };
    },
    confidence: "high",
  },
  // "first day of every month" / "monthly on the 1st"
  {
    regex: /(?:first\s+day\s+of\s+every\s+month|monthly(?:\s+on\s+the\s+1st)?)/i,
    handler: () => ({
      expression: "0 0 1 * *",
      description: "First day of every month at midnight",
    }),
    confidence: "exact",
  },
  // "on the Nth of every month at TIME"
  {
    regex: /on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\s+of\s+every\s+month(?:\s+at\s+(.+))?/i,
    handler: (m) => {
      const day = parseInt(m[1], 10);
      const time = m[2] ? parseTime(m[2]) : { hour: 0, minute: 0 };
      if (!time || day < 1 || day > 31) return { expression: "0 0 1 * *", description: "Monthly on the 1st" };
      return {
        expression: `${time.minute} ${time.hour} ${day} * *`,
        description: `Monthly on the ${m[1]}${getOrdinal(day)} at ${m[2]?.trim() || "midnight"}`,
      };
    },
    confidence: "exact",
  },
  // "every N days"
  {
    regex: /every\s+(\d+)\s+days?/i,
    handler: (m) => ({
      expression: `0 0 */${m[1]} * *`,
      description: `Every ${m[1]} days at midnight`,
    }),
    confidence: "high",
  },
  // "at TIME" (simple daily)
  {
    regex: /^at\s+(.+)$/i,
    handler: (m) => {
      const time = parseTime(m[1]);
      if (!time) return { expression: "0 0 * * *", description: "Daily at midnight" };
      return {
        expression: `${time.minute} ${time.hour} * * *`,
        description: `Daily at ${m[1].trim()}`,
      };
    },
    confidence: "high",
  },
  // "hourly" / "daily" / "weekly" / "monthly"
  {
    regex: /^hourly$/i,
    handler: () => ({ expression: "0 * * * *", description: "Every hour" }),
    confidence: "exact",
  },
  {
    regex: /^daily$/i,
    handler: () => ({ expression: "0 0 * * *", description: "Daily at midnight" }),
    confidence: "exact",
  },
  {
    regex: /^weekly$/i,
    handler: () => ({ expression: "0 0 * * 0", description: "Weekly on Sunday at midnight" }),
    confidence: "exact",
  },
  {
    regex: /^monthly$/i,
    handler: () => ({ expression: "0 0 1 * *", description: "Monthly on the 1st at midnight" }),
    confidence: "exact",
  },
];

function getOrdinal(n: number): string {
  if (n > 3 && n < 21) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// ── Compiler ──────────────────────────────────────────────────────────

/**
 * Compile a natural language schedule description into a cron expression.
 */
export function compileCron(input: string): CronResult {
  const cleaned = input.trim().replace(/\s+/g, " ");

  for (const pattern of PATTERNS) {
    const match = cleaned.match(pattern.regex);
    if (match) {
      const { expression, description } = pattern.handler(match);
      return {
        expression,
        description,
        nextRuns: getNextRuns(expression, 5),
        confidence: pattern.confidence,
        input: cleaned,
      };
    }
  }

  // No pattern matched — return with low confidence
  return {
    expression: "0 0 * * *",
    description: `Could not parse "${cleaned}" — defaulting to daily at midnight`,
    nextRuns: getNextRuns("0 0 * * *", 5),
    confidence: "low",
    input: cleaned,
  };
}

/**
 * Validate a cron expression.
 */
export function validateCron(expression: string): { valid: boolean; error?: string } {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { valid: false, error: `Expected 5 fields, got ${parts.length}` };
  }

  const ranges = [
    { name: "minute", min: 0, max: 59 },
    { name: "hour", min: 0, max: 23 },
    { name: "day of month", min: 1, max: 31 },
    { name: "month", min: 1, max: 12 },
    { name: "day of week", min: 0, max: 7 },
  ];

  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    const range = ranges[i];

    // Accept wildcards
    if (part === "*") continue;

    // Accept step values */N
    if (/^\*\/\d+$/.test(part)) {
      const step = parseInt(part.slice(2), 10);
      if (step < 1 || step > range.max) {
        return { valid: false, error: `Invalid step ${step} for ${range.name}` };
      }
      continue;
    }

    // Accept lists 1,2,3
    if (part.includes(",")) {
      const values = part.split(",");
      for (const v of values) {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < range.min || n > range.max) {
          return { valid: false, error: `Value ${v} out of range for ${range.name} (${range.min}-${range.max})` };
        }
      }
      continue;
    }

    // Accept ranges 1-5
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      if (isNaN(start) || isNaN(end) || start < range.min || end > range.max || start > end) {
        return { valid: false, error: `Invalid range ${part} for ${range.name}` };
      }
      continue;
    }

    // Accept single numbers
    const n = parseInt(part, 10);
    if (isNaN(n) || n < range.min || n > range.max) {
      return { valid: false, error: `Value ${part} out of range for ${range.name} (${range.min}-${range.max})` };
    }
  }

  return { valid: true };
}

// ── Next Run Calculation ──────────────────────────────────────────────

/**
 * Calculate the next N execution times for a cron expression.
 * Simple implementation — handles most common patterns.
 */
function getNextRuns(expression: string, count: number): string[] {
  const parts = expression.split(/\s+/);
  if (parts.length !== 5) return [];

  const runs: string[] = [];
  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);

  // Advance by 1 minute to start from next occurrence
  candidate.setMinutes(candidate.getMinutes() + 1);

  const maxIterations = 525960; // 1 year of minutes

  for (let i = 0; i < maxIterations && runs.length < count; i++) {
    if (matchesCron(candidate, parts)) {
      runs.push(candidate.toISOString());
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return runs;
}

function matchesCron(date: Date, parts: string[]): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  return (
    matchField(minute, parts[0], 0, 59) &&
    matchField(hour, parts[1], 0, 23) &&
    matchField(dayOfMonth, parts[2], 1, 31) &&
    matchField(month, parts[3], 1, 12) &&
    matchField(dayOfWeek, parts[4], 0, 7)
  );
}

function matchField(value: number, field: string, min: number, max: number): boolean {
  if (field === "*") return true;

  // Step: */N
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }

  // List: 1,2,3
  if (field.includes(",")) {
    return field.split(",").some((v) => parseInt(v, 10) === value);
  }

  // Range: 1-5
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return value >= start && value <= end;
  }

  // Single value
  return parseInt(field, 10) === value;
}
