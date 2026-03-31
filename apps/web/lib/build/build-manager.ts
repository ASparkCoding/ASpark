/**
 * Build Manager — Singleton tracking active & recent build jobs.
 *
 * Runs in-memory (like process-manager). Provides status for:
 *  - "Continue in background" — client disconnects, server-side onFinish still saves files
 *  - Page reload — detect recently completed builds, show notification
 *  - Polling — client checks status while build runs in background
 */

export interface BuildJob {
  projectId: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  completedAt?: number;
  filesGenerated: number;
  error?: string;
  modelInfo?: { provider: string; model: string; type: string };
}

const BUILD_TTL_MS = 30 * 60 * 1000; // keep completed builds for 30 min

class BuildManager {
  private builds = new Map<string, BuildJob>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  /** Register a build as started */
  start(projectId: string, modelInfo?: BuildJob['modelInfo']): void {
    this.builds.set(projectId, {
      projectId,
      status: 'running',
      startedAt: Date.now(),
      filesGenerated: 0,
      modelInfo,
    });
  }

  /** Mark build as completed */
  complete(projectId: string, filesGenerated: number): void {
    const job = this.builds.get(projectId);
    if (job) {
      job.status = 'completed';
      job.completedAt = Date.now();
      job.filesGenerated = filesGenerated;
    }
  }

  /** Mark build as failed */
  fail(projectId: string, error: string): void {
    const job = this.builds.get(projectId);
    if (job) {
      job.status = 'error';
      job.completedAt = Date.now();
      job.error = error;
    }
  }

  /** Get current build status for a project */
  getStatus(projectId: string): BuildJob | null {
    return this.builds.get(projectId) ?? null;
  }

  /** Check if a build is actively running */
  isRunning(projectId: string): boolean {
    const job = this.builds.get(projectId);
    return !!job && job.status === 'running';
  }

  /** Get all active (running or recently completed) builds — for project list badges */
  getAllActive(): Array<{ projectId: string; status: string; filesGenerated: number }> {
    const result: Array<{ projectId: string; status: string; filesGenerated: number }> = [];
    for (const [, job] of this.builds) {
      result.push({ projectId: job.projectId, status: job.status, filesGenerated: job.filesGenerated });
    }
    return result;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, job] of this.builds) {
      if (job.status !== 'running' && now - (job.completedAt ?? job.startedAt) > BUILD_TTL_MS) {
        this.builds.delete(id);
      }
    }
  }
}

// Singleton — survives Next.js hot reloads
const g = globalThis as unknown as { __buildManager?: BuildManager };
export const buildManager = g.__buildManager ?? (g.__buildManager = new BuildManager());
