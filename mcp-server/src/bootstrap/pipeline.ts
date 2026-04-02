/**
 * Bootstrap Pipeline — ordered stage execution with required/optional semantics.
 *
 * Stages are sorted by `order` and executed sequentially.
 * A required stage failure aborts the pipeline.
 * A non-required stage failure is logged and execution continues.
 */

export interface BootstrapStage {
  name: string;
  order: number;
  execute: () => Promise<void>;
  required: boolean;
}

export interface BootstrapState {
  currentStage: string;
  completedStages: number;
  totalStages: number;
  startTime: number;
  durationMs: number;
  errors: Array<{ stage: string; error: string }>;
}

export class BootstrapPipeline {
  private stages: BootstrapStage[] = [];
  private state: BootstrapState = {
    currentStage: "",
    completedStages: 0,
    totalStages: 0,
    startTime: 0,
    durationMs: 0,
    errors: [],
  };

  /**
   * Register a stage. Stages are kept sorted by ascending order.
   * @param stage - The bootstrap stage to add
   */
  addStage(stage: BootstrapStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => a.order - b.order);
  }

  /**
   * Execute all registered stages in order.
   *
   * - Required stage failure throws and halts the pipeline.
   * - Non-required stage failure is recorded and execution continues.
   */
  async run(): Promise<void> {
    this.state.startTime = Date.now();
    this.state.totalStages = this.stages.length;
    this.state.completedStages = 0;
    this.state.errors = [];

    console.log(`\n[bootstrap] Starting pipeline (${this.stages.length} stages)\n`);

    for (const stage of this.stages) {
      this.state.currentStage = stage.name;
      const label = `[bootstrap] Stage ${stage.order}: ${stage.name}`;

      try {
        console.log(`${label} — running...`);
        await stage.execute();
        this.state.completedStages++;
        console.log(`${label} — done`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (stage.required) {
          this.state.errors.push({ stage: stage.name, error: message });
          this.state.durationMs = Date.now() - this.state.startTime;
          console.error(`${label} — FAILED (required): ${message}`);
          throw new Error(
            `Bootstrap aborted at required stage "${stage.name}": ${message}`
          );
        }

        // Non-required: log and continue
        this.state.errors.push({ stage: stage.name, error: message });
        console.warn(`${label} — FAILED (optional, continuing): ${message}`);
      }
    }

    this.state.durationMs = Date.now() - this.state.startTime;
    this.state.currentStage = "complete";
    console.log(
      `\n[bootstrap] Pipeline complete — ${this.state.completedStages}/${this.state.totalStages} stages in ${this.state.durationMs}ms\n`
    );
  }

  /**
   * Return a snapshot of the current pipeline state.
   */
  getState(): BootstrapState {
    return { ...this.state, errors: [...this.state.errors] };
  }
}
