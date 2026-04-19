/**
 * Parallel Dispatch Engine — concurrent subagent execution for multi-story pipelines.
 *
 * Implements the parallel dispatch protocol from agents/_parallel-dispatch.md.
 * Instead of executing stories sequentially (A → B → C → D), detects independent
 * stories via dependency graph analysis and runs them in parallel waves.
 *
 * Typical speedup: 2-5x on multi-story PRDs with independent work.
 *
 * Architecture:
 *   1. Parse story dependencies into a DAG
 *   2. Topological sort → execution waves
 *   3. Run each wave concurrently (Promise.allSettled)
 *   4. Aggregate results, propagate failures to dependents
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface StoryTask {
  /** Unique story identifier (e.g., STORY-001) */
  id: string;
  /** Human-readable title */
  title: string;
  /** Stories that MUST complete before this one starts */
  dependsOn: string[];
  /** Stories that SHOULD complete first (soft dependency) */
  prefers: string[];
  /** Stories blocked by this one */
  blocks: string[];
  /** Affected layers (database, backend, frontend) */
  layers: string[];
  /** Complexity estimate */
  complexity: "simple" | "medium" | "complex";
  /** Files this story will likely modify (for conflict detection) */
  files: string[];
  /** Whether this story includes database migrations */
  hasMigration: boolean;
  /** Arbitrary payload passed to the executor */
  payload: unknown;
}

export interface WaveResult {
  waveIndex: number;
  tasks: TaskResult[];
  durationMs: number;
}

export interface TaskResult {
  taskId: string;
  status: "success" | "error" | "skipped";
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface DispatchResult {
  mode: "wave" | "sequential";
  totalTasks: number;
  waves: WaveResult[];
  totalDurationMs: number;
  parallelSpeedup: number;
  skippedTasks: string[];
  failedTasks: string[];
}

export type TaskExecutor = (task: StoryTask) => Promise<unknown>;

// ── Dependency Graph ──────────────────────────────────────────────────

/**
 * Build a dependency graph from story tasks.
 * Returns adjacency list (task → tasks it depends on).
 */
function buildGraph(tasks: StoryTask[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const taskIds = new Set(tasks.map((t) => t.id));

  for (const task of tasks) {
    const deps = new Set<string>();
    for (const dep of task.dependsOn) {
      if (taskIds.has(dep)) deps.add(dep);
    }
    graph.set(task.id, deps);
  }

  return graph;
}

/**
 * Detect cycles in the dependency graph.
 * Returns the cycle path if found, null otherwise.
 */
export function detectCycles(tasks: StoryTask[]): string[] | null {
  const graph = buildGraph(tasks);
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);
    path.push(node);

    const deps = graph.get(node) || new Set();
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (inStack.has(dep)) {
        path.push(dep);
        return true;
      }
    }

    path.pop();
    inStack.delete(node);
    return false;
  }

  for (const [node] of graph) {
    if (!visited.has(node)) {
      if (dfs(node)) return path;
    }
  }

  return null;
}

/**
 * Check if two tasks have file conflicts (would cause merge issues if run in parallel).
 */
function hasFileConflict(a: StoryTask, b: StoryTask): boolean {
  if (a.files.length === 0 || b.files.length === 0) return false;
  const bFiles = new Set(b.files);
  return a.files.some((f) => bFiles.has(f));
}

/**
 * Check if two tasks both have migrations (must be sequential).
 */
function hasMigrationConflict(a: StoryTask, b: StoryTask): boolean {
  return a.hasMigration && b.hasMigration;
}

// ── Wave Generation ───────────────────────────────────────────────────

/**
 * Generate execution waves using topological sort with conflict detection.
 *
 * Each wave contains tasks that:
 * - Have all dependencies satisfied (completed in prior waves)
 * - Don't modify overlapping files
 * - Don't both require database migrations
 */
export function generateWaves(tasks: StoryTask[]): StoryTask[][] {
  if (tasks.length === 0) return [];

  // Check for cycles
  const cycle = detectCycles(tasks);
  if (cycle) {
    throw new Error(
      `Dependency cycle detected: ${cycle.join(" → ")}. Cannot parallelize.`
    );
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const completed = new Set<string>();
  const remaining = new Set(tasks.map((t) => t.id));
  const waves: StoryTask[][] = [];

  while (remaining.size > 0) {
    // Find all tasks whose dependencies are satisfied
    const candidates: StoryTask[] = [];
    for (const id of remaining) {
      const task = taskMap.get(id)!;
      const allDepsMet = task.dependsOn.every(
        (dep) => completed.has(dep) || !remaining.has(dep)
      );
      if (allDepsMet) {
        candidates.push(task);
      }
    }

    if (candidates.length === 0) {
      // Deadlock — remaining tasks have unresolvable dependencies
      // Force them into a sequential wave
      const forced = Array.from(remaining).map((id) => taskMap.get(id)!);
      waves.push(forced);
      break;
    }

    // Group candidates by conflict analysis
    const wave: StoryTask[] = [];
    for (const candidate of candidates) {
      // Check against already-added wave members for conflicts
      const hasConflict = wave.some(
        (member) =>
          hasFileConflict(member, candidate) ||
          hasMigrationConflict(member, candidate)
      );

      if (!hasConflict) {
        wave.push(candidate);
      }
      // Conflicting tasks will be picked up in the next wave
    }

    // If no tasks could be added (all conflict), force first candidate through
    if (wave.length === 0 && candidates.length > 0) {
      wave.push(candidates[0]);
    }

    for (const task of wave) {
      remaining.delete(task.id);
      completed.add(task.id);
    }

    waves.push(wave);
  }

  return waves;
}

// ── Execution Engine ──────────────────────────────────────────────────

/**
 * Execute tasks in parallel waves.
 *
 * Each wave runs all its tasks concurrently via Promise.allSettled.
 * If a task fails, its dependents are skipped in subsequent waves.
 */
export async function executeParallel(
  tasks: StoryTask[],
  executor: TaskExecutor,
  options: { maxConcurrency?: number } = {},
): Promise<DispatchResult> {
  const totalStart = Date.now();
  const { maxConcurrency = 5 } = options;

  // Fall back to sequential if only 1 task
  if (tasks.length <= 1) {
    return executeSequential(tasks, executor);
  }

  const waves = generateWaves(tasks);
  const failedTasks = new Set<string>();
  const skippedTasks = new Set<string>();
  const waveResults: WaveResult[] = [];

  // Track estimated sequential time for speedup calculation
  let estimatedSequentialMs = 0;

  for (let wi = 0; wi < waves.length; wi++) {
    const wave = waves[wi];
    const waveStart = Date.now();

    // Filter out tasks whose dependencies failed
    const executable: StoryTask[] = [];
    for (const task of wave) {
      const hasFailedDep = task.dependsOn.some((dep) => failedTasks.has(dep));
      if (hasFailedDep) {
        skippedTasks.add(task.id);
      } else {
        executable.push(task);
      }
    }

    // Limit concurrency within each wave
    const taskResults: TaskResult[] = [];

    // Add skipped results
    for (const task of wave) {
      if (skippedTasks.has(task.id)) {
        taskResults.push({
          taskId: task.id,
          status: "skipped",
          error: "Dependency failed",
          durationMs: 0,
        });
      }
    }

    // Execute in batches of maxConcurrency
    for (let i = 0; i < executable.length; i += maxConcurrency) {
      const batch = executable.slice(i, i + maxConcurrency);
      const promises = batch.map(async (task): Promise<TaskResult> => {
        const taskStart = Date.now();
        try {
          const result = await executor(task);
          const dur = Date.now() - taskStart;
          estimatedSequentialMs += dur;
          return { taskId: task.id, status: "success", result, durationMs: dur };
        } catch (err) {
          const dur = Date.now() - taskStart;
          estimatedSequentialMs += dur;
          failedTasks.add(task.id);
          return {
            taskId: task.id,
            status: "error",
            error: (err as Error).message,
            durationMs: dur,
          };
        }
      });

      const settled = await Promise.allSettled(promises);
      for (const s of settled) {
        if (s.status === "fulfilled") {
          taskResults.push(s.value);
        } else {
          // Promise rejection (shouldn't happen with try/catch above)
          taskResults.push({
            taskId: "unknown",
            status: "error",
            error: s.reason?.message || "Unknown error",
            durationMs: 0,
          });
        }
      }
    }

    waveResults.push({
      waveIndex: wi,
      tasks: taskResults,
      durationMs: Date.now() - waveStart,
    });
  }

  const totalMs = Date.now() - totalStart;
  const speedup = estimatedSequentialMs > 0
    ? Math.round((estimatedSequentialMs / totalMs) * 100) / 100
    : 1;

  return {
    mode: "wave",
    totalTasks: tasks.length,
    waves: waveResults,
    totalDurationMs: totalMs,
    parallelSpeedup: speedup,
    skippedTasks: Array.from(skippedTasks),
    failedTasks: Array.from(failedTasks),
  };
}

/**
 * Execute tasks sequentially (fallback for single-task or forced-serial).
 */
async function executeSequential(
  tasks: StoryTask[],
  executor: TaskExecutor,
): Promise<DispatchResult> {
  const totalStart = Date.now();
  const waveResults: WaveResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const taskStart = Date.now();
    let taskResult: TaskResult;

    try {
      const result = await executor(task);
      taskResult = {
        taskId: task.id,
        status: "success",
        result,
        durationMs: Date.now() - taskStart,
      };
    } catch (err) {
      taskResult = {
        taskId: task.id,
        status: "error",
        error: (err as Error).message,
        durationMs: Date.now() - taskStart,
      };
    }

    waveResults.push({
      waveIndex: i,
      tasks: [taskResult],
      durationMs: taskResult.durationMs,
    });
  }

  return {
    mode: "sequential",
    totalTasks: tasks.length,
    waves: waveResults,
    totalDurationMs: Date.now() - totalStart,
    parallelSpeedup: 1,
    skippedTasks: [],
    failedTasks: waveResults
      .flatMap((w) => w.tasks)
      .filter((t) => t.status === "error")
      .map((t) => t.taskId),
  };
}

// ── Analysis ──────────────────────────────────────────────────────────

export interface WaveAnalysis {
  totalTasks: number;
  totalWaves: number;
  maxParallelism: number;
  criticalPath: string[];
  criticalPathLength: number;
  estimatedSpeedup: string;
  waves: Array<{
    index: number;
    tasks: Array<{ id: string; title: string; complexity: string }>;
    parallelism: number;
  }>;
}

/**
 * Analyze a set of tasks and report wave structure without executing.
 * Used for planning and validation.
 */
export function analyzeWaves(tasks: StoryTask[]): WaveAnalysis {
  const waves = generateWaves(tasks);
  const maxParallelism = Math.max(...waves.map((w) => w.length), 0);

  // Calculate critical path (longest dependency chain)
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const depths = new Map<string, number>();

  function getDepth(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    const task = taskMap.get(id);
    if (!task || task.dependsOn.length === 0) {
      depths.set(id, 1);
      return 1;
    }
    const maxDepDep = Math.max(
      ...task.dependsOn.map((dep) => (taskMap.has(dep) ? getDepth(dep) : 0))
    );
    const depth = maxDepDep + 1;
    depths.set(id, depth);
    return depth;
  }

  for (const task of tasks) getDepth(task.id);

  // Find critical path
  let maxDepth = 0;
  let criticalEnd = "";
  for (const [id, depth] of depths) {
    if (depth > maxDepth) {
      maxDepth = depth;
      criticalEnd = id;
    }
  }

  const criticalPath: string[] = [];
  let current = criticalEnd;
  while (current) {
    criticalPath.unshift(current);
    const task = taskMap.get(current);
    if (!task || task.dependsOn.length === 0) break;
    // Pick the deepest dependency
    let deepest = "";
    let deepestVal = 0;
    for (const dep of task.dependsOn) {
      const d = depths.get(dep) || 0;
      if (d > deepestVal) {
        deepestVal = d;
        deepest = dep;
      }
    }
    current = deepest;
  }

  const sequentialTime = tasks.length;
  const parallelTime = waves.length;
  const speedup = parallelTime > 0 ? (sequentialTime / parallelTime).toFixed(1) : "1.0";

  return {
    totalTasks: tasks.length,
    totalWaves: waves.length,
    maxParallelism,
    criticalPath,
    criticalPathLength: criticalPath.length,
    estimatedSpeedup: `${speedup}x`,
    waves: waves.map((wave, i) => ({
      index: i,
      tasks: wave.map((t) => ({
        id: t.id,
        title: t.title,
        complexity: t.complexity,
      })),
      parallelism: wave.length,
    })),
  };
}
