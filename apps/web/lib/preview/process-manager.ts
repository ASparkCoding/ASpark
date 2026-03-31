import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

export interface ProjectProcess {
  process: ChildProcess;
  port: number;
  projectId: string;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  lastActive: number;
  projectDir: string;
}

type StatusListener = (event: {
  status: string;
  message: string;
  previewUrl?: string;
  port?: number;
}) => void;

const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 4000;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PROCESSES = 20;

class ProcessManager {
  private processes = new Map<string, ProjectProcess>();
  private allocatedPorts = new Set<number>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupLoop();
  }

  private startCleanupLoop() {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [projectId, proc] of this.processes) {
        // Idle timeout
        if (now - proc.lastActive > IDLE_TIMEOUT_MS) {
          console.log(`[ProcessManager] Idle timeout for project ${projectId}`);
          this.stop(projectId);
          continue;
        }

        // ★ 僵尸进程检测：验证进程是否真的还在运行
        if (proc.status === 'ready' || proc.status === 'starting') {
          try {
            // process.kill(pid, 0) 不发送信号，仅检查进程是否存在
            if (proc.process.pid) {
              process.kill(proc.process.pid, 0);
            }
          } catch {
            // 进程已死但状态未更新 → 清理
            console.log(`[ProcessManager] Zombie detected for project ${projectId} (port ${proc.port}), cleaning up`);
            proc.status = 'error';
            this.cleanup(projectId);
          }
        }
      }
    }, 30_000);
    // Don't prevent Node.js from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  getPort(projectId: string): number | undefined {
    return this.processes.get(projectId)?.port;
  }

  getStatus(projectId: string): ProjectProcess | undefined {
    const proc = this.processes.get(projectId);
    if (proc) proc.lastActive = Date.now();
    return proc;
  }

  isRunning(projectId: string): boolean {
    const proc = this.processes.get(projectId);
    return !!proc && (proc.status === 'ready' || proc.status === 'starting');
  }

  /**
   * Start a Vite dev server for the given project.
   * Calls `listener` with status updates as the process boots.
   */
  async start(
    projectId: string,
    projectDir: string,
    listener: StatusListener
  ): Promise<void> {
    // If already running, verify it's actually alive
    const existing = this.processes.get(projectId);
    if (existing && (existing.status === 'ready' || existing.status === 'starting')) {
      // ★ 验证进程是否真的存活
      let isAlive = false;
      try {
        if (existing.process.pid) {
          process.kill(existing.process.pid, 0);
          isAlive = true;
        }
      } catch { /* 进程已死 */ }

      if (isAlive) {
        // ★ 额外验证：检查端口是否还在监听
        const portListening = !(await isPortAvailable(existing.port));
        if (portListening) {
          listener({
            status: 'ready',
            message: 'Dev server already running',
            previewUrl: `http://127.0.0.1:${existing.port}`,
            port: existing.port,
          });
          return;
        }
      }

      // 进程已死或端口空了 → 清理后重新启动
      console.log(`[ProcessManager] Stale process for ${projectId}, cleaning up and restarting`);
      this.cleanup(projectId);
    }

    // ★ 清理同一项目的旧进程（防止孤儿进程）
    for (const [id, proc] of this.processes) {
      if (id === projectId) continue;
      // 如果是同一个项目目录的旧进程，也清理
      if (proc.projectDir === projectDir) {
        console.log(`[ProcessManager] Cleaning orphaned process for same directory on port ${proc.port}`);
        await this.stop(id);
      }
    }

    // Evict LRU if at capacity
    if (this.processes.size >= MAX_PROCESSES) {
      this.evictLRU();
    }

    const port = await this.allocatePort();

    // ★ 确保端口上没有残留进程（可能是上次 hot-reload 遗留的孤儿进程）
    const portFree = await isPortAvailable(port);
    if (!portFree) {
      console.log(`[ProcessManager] Port ${port} is occupied by orphan process, killing...`);
      await killProcessOnPort(port);
      // 等待端口释放
      await new Promise(r => setTimeout(r, 1000));
    }

    listener({ status: 'starting', message: `Allocating port ${port}...` });

    const isWindows = process.platform === 'win32';

    // Spawn Vite dev server
    const child = spawn('npx', ['vite', '--host', '--port', String(port)], {
      cwd: projectDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(port),
        NODE_OPTIONS: '--max-old-space-size=512',
        FORCE_COLOR: '0',
      },
      ...(isWindows ? { windowsHide: true } : { detached: true }),
    });

    const projectProcess: ProjectProcess = {
      process: child,
      port,
      projectId,
      status: 'starting',
      lastActive: Date.now(),
      projectDir,
    };
    this.processes.set(projectId, projectProcess);

    let stdoutBuffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuffer += text;

      // Vite outputs "Local:" or "ready in" when the server is ready
      if (
        projectProcess.status === 'starting' &&
        (stdoutBuffer.includes('Local:') || stdoutBuffer.includes('ready in'))
      ) {
        projectProcess.status = 'ready';
        projectProcess.lastActive = Date.now();
        const previewUrl = `http://127.0.0.1:${port}`;
        listener({
          status: 'ready',
          message: 'Dev server is ready!',
          previewUrl,
          port,
        });
      }

      // Forward compilation errors from stdout (Vite prints errors here too)
      if (
        text.includes('error') || text.includes('Error') ||
        text.includes('Failed to resolve') || text.includes('TS') ||
        text.includes('SyntaxError') || text.includes('Cannot find')
      ) {
        listener({ status: 'log', message: `[vite] ${text}` });
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // Forward all stderr output - Vite prints compilation errors here
      listener({ status: 'log', message: `[stderr] ${text}` });
    });

    child.on('error', (err) => {
      projectProcess.status = 'error';
      listener({ status: 'error', message: `Process error: ${err.message}` });
      this.cleanup(projectId);
    });

    child.on('exit', (code) => {
      if (projectProcess.status !== 'stopped') {
        projectProcess.status = 'error';
        listener({
          status: 'error',
          message: `Process exited with code ${code}`,
        });
      } else {
        // Graceful stop — notify so the NDJSON stream can close
        listener({ status: 'stopped', message: 'Dev server stopped' });
      }
      this.cleanup(projectId);
    });

    // Timeout: if not ready within 30s, kill and retry
    // ★ 降低超时时间：Vite 正常启动只需 <1s，30s 足够捕获依赖预打包的首次运行
    setTimeout(() => {
      if (projectProcess.status === 'starting') {
        console.log(`[ProcessManager] Vite startup timeout (30s) for project ${projectId}, killing stuck process`);
        projectProcess.status = 'error';

        // ★ 清除可能卡死的 .vite 缓存
        try {
          const viteCache = path.join(projectDir, '.vite-cache');
          const fs = require('node:fs');
          if (fs.existsSync(viteCache)) {
            fs.rmSync(viteCache, { recursive: true, force: true });
            console.log('[ProcessManager] Cleared stuck .vite-cache');
          }
          // 也清除 node_modules/.vite（可能被旧进程锁定）
          const nmVite = path.join(projectDir, 'node_modules', '.vite');
          if (fs.existsSync(nmVite)) {
            fs.rmSync(nmVite, { recursive: true, force: true });
            console.log('[ProcessManager] Cleared stuck node_modules/.vite');
          }
        } catch { /* best effort */ }

        listener({
          status: 'error',
          message: 'Dev server startup timeout (30s) — clearing cache and retrying may help',
        });
        this.stop(projectId);
      }
    }, 30_000);
  }

  /**
   * Stop a running dev server.
   */
  async stop(projectId: string): Promise<void> {
    const proc = this.processes.get(projectId);
    if (!proc) return;

    proc.status = 'stopped';

    try {
      await killProcessTree(proc.process.pid!);
    } catch {
      // Best effort
      try { proc.process.kill(); } catch { /* ignore */ }
    }

    this.cleanup(projectId);
  }

  /**
   * Stop all running dev servers (for graceful shutdown).
   */
  async stopAll(): Promise<void> {
    const ids = [...this.processes.keys()];
    await Promise.all(ids.map((id) => this.stop(id)));
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private cleanup(projectId: string) {
    const proc = this.processes.get(projectId);
    if (proc) {
      this.allocatedPorts.delete(proc.port);
      this.processes.delete(projectId);
    }
  }

  private evictLRU() {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [id, proc] of this.processes) {
      if (proc.lastActive < oldestTime) {
        oldestTime = proc.lastActive;
        oldest = id;
      }
    }
    if (oldest) {
      console.log(`[ProcessManager] Evicting LRU project ${oldest}`);
      this.stop(oldest);
    }
  }

  private async allocatePort(): Promise<number> {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (this.allocatedPorts.has(port)) continue;
      const available = await isPortAvailable(port);
      if (available) {
        this.allocatedPorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports in range');
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Kill a process and all its children.
 * On Windows, uses taskkill /T /F.
 * On Unix, kills the process group.
 */
function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const kill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        shell: true,
        windowsHide: true,
      });
      kill.on('close', () => resolve());
      kill.on('error', reject);
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
        setTimeout(() => {
          try { process.kill(-pid, 'SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, 5000);
      } catch {
        resolve();
      }
    }
  });
}

/**
 * Kill any process listening on a given port (orphan cleanup).
 * Used to clean up Vite processes left behind by hot reloads.
 */
function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // On Windows: find PID by port, then kill
      const findPid = spawn('netstat', ['-ano'], { shell: true, windowsHide: true });
      let output = '';
      findPid.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      findPid.on('close', () => {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[parts.length - 1]);
            if (pid && !isNaN(pid)) {
              console.log(`[ProcessManager] Killing orphan PID ${pid} on port ${port}`);
              const kill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
                shell: true,
                windowsHide: true,
              });
              kill.on('close', () => resolve());
              kill.on('error', () => resolve());
              return;
            }
          }
        }
        resolve();
      });
      findPid.on('error', () => resolve());
    } else {
      // On Unix: use lsof to find and kill
      const findPid = spawn('lsof', ['-t', `-i:${port}`], { shell: true });
      let output = '';
      findPid.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      findPid.on('close', () => {
        const pid = parseInt(output.trim());
        if (pid && !isNaN(pid)) {
          console.log(`[ProcessManager] Killing orphan PID ${pid} on port ${port}`);
          try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
        }
        resolve();
      });
      findPid.on('error', () => resolve());
    }
  });
}

// Singleton: persist across Next.js hot reloads
const globalForPM = globalThis as unknown as { __processManager?: ProcessManager };
export const processManager =
  globalForPM.__processManager ?? (globalForPM.__processManager = new ProcessManager());

// Graceful shutdown
if (typeof process !== 'undefined') {
  const shutdown = () => {
    processManager.stopAll().then(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
