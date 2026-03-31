/**
 * ASpark Task Manager
 * 任务生命周期管理、并行生成、任务依赖拓扑排序
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'frontend' | 'backend' | 'database' | 'validate' | 'fix' | 'deploy' | 'custom';

export interface Task {
  id: string;
  type: TaskType;
  name: string;
  description: string;
  status: TaskStatus;
  progress: number; // 0-100
  result?: TaskResult;
  error?: string;
  /** 依赖的任务 ID */
  dependencies: string[];
  /** 任务创建时间 */
  createdAt: number;
  /** 任务开始时间 */
  startedAt?: number;
  /** 任务完成时间 */
  completedAt?: number;
  /** 任务执行函数 */
  execute: () => Promise<TaskResult>;
  /** 进度回调 */
  onProgress?: (progress: number, message?: string) => void;
}

export interface TaskResult {
  files?: Record<string, string>;
  data?: unknown;
  logs?: string[];
}

export interface TaskGroup {
  id: string;
  name: string;
  tasks: Task[];
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
}

export interface TaskManagerEvents {
  onTaskStart?: (task: Task) => void;
  onTaskProgress?: (task: Task, progress: number, message?: string) => void;
  onTaskComplete?: (task: Task, result: TaskResult) => void;
  onTaskFail?: (task: Task, error: string) => void;
  onGroupComplete?: (group: TaskGroup) => void;
}

class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private groups: Map<string, TaskGroup> = new Map();
  private events: TaskManagerEvents = {};
  private runningTasks: Set<string> = new Set();
  private maxConcurrent: number = 5;
  private idCounter: number = 0;

  /**
   * 注册事件处理器
   */
  setEventHandlers(events: TaskManagerEvents): void {
    this.events = events;
  }

  /**
   * 设置最大并发数
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
  }

  /**
   * 创建单个任务
   */
  createTask(config: {
    type: TaskType;
    name: string;
    description: string;
    dependencies?: string[];
    execute: () => Promise<TaskResult>;
    onProgress?: (progress: number, message?: string) => void;
  }): Task {
    const task: Task = {
      id: `task_${++this.idCounter}_${Date.now().toString(36)}`,
      type: config.type,
      name: config.name,
      description: config.description,
      status: 'pending',
      progress: 0,
      dependencies: config.dependencies || [],
      createdAt: Date.now(),
      execute: config.execute,
      onProgress: config.onProgress,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * 创建任务组（支持并行和依赖）
   */
  createTaskGroup(name: string, tasks: Task[]): TaskGroup {
    const group: TaskGroup = {
      id: `group_${++this.idCounter}_${Date.now().toString(36)}`,
      name,
      tasks,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.groups.set(group.id, group);
    return group;
  }

  /**
   * 执行任务组（自动处理依赖和并行）
   */
  async executeGroup(groupId: string): Promise<Map<string, TaskResult>> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Task group ${groupId} not found`);

    group.status = 'running';
    const results = new Map<string, TaskResult>();

    // 拓扑排序
    const sorted = this.topologicalSort(group.tasks);

    // 按层级执行（同层可并行）
    for (const layer of sorted) {
      const layerPromises = layer.map(async (task) => {
        // 检查依赖是否全部完成
        const depsOk = task.dependencies.every(depId => {
          const dep = this.tasks.get(depId);
          return dep && dep.status === 'completed';
        });

        if (!depsOk) {
          task.status = 'cancelled';
          task.error = '依赖任务未完成';
          return;
        }

        try {
          await this.executeTask(task);
          if (task.result) {
            results.set(task.id, task.result);
          }
        } catch (error) {
          task.status = 'failed';
          task.error = error instanceof Error ? error.message : String(error);
          this.events.onTaskFail?.(task, task.error);
        }
      });

      // 同层并行执行，但限制并发数
      await this.executeConcurrent(layerPromises);
    }

    // 更新组状态
    const allCompleted = group.tasks.every(t => t.status === 'completed');
    const anyFailed = group.tasks.some(t => t.status === 'failed');

    group.status = allCompleted ? 'completed' : anyFailed ? 'failed' : 'completed';
    group.completedAt = Date.now();
    this.events.onGroupComplete?.(group);

    return results;
  }

  /**
   * 执行单个任务
   */
  async executeTask(task: Task): Promise<TaskResult> {
    task.status = 'running';
    task.startedAt = Date.now();
    task.progress = 0;
    this.runningTasks.add(task.id);

    this.events.onTaskStart?.(task);

    // 包装进度回调
    const originalOnProgress = task.onProgress;
    task.onProgress = (progress: number, message?: string) => {
      task.progress = progress;
      originalOnProgress?.(progress, message);
      this.events.onTaskProgress?.(task, progress, message);
    };

    try {
      const result = await task.execute();
      task.status = 'completed';
      task.progress = 100;
      task.result = result;
      task.completedAt = Date.now();

      this.events.onTaskComplete?.(task, result);
      return result;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      this.events.onTaskFail?.(task, task.error);
      throw error;
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && (task.status === 'pending' || task.status === 'running')) {
      task.status = 'cancelled';
    }
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取任务组状态
   */
  getGroup(groupId: string): TaskGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * 获取所有正在运行的任务
   */
  getRunningTasks(): Task[] {
    return Array.from(this.runningTasks)
      .map(id => this.tasks.get(id))
      .filter((t): t is Task => t !== undefined);
  }

  /**
   * 获取组进度百分比
   */
  getGroupProgress(groupId: string): number {
    const group = this.groups.get(groupId);
    if (!group || group.tasks.length === 0) return 0;

    const totalProgress = group.tasks.reduce((sum, task) => sum + task.progress, 0);
    return Math.round(totalProgress / group.tasks.length);
  }

  /**
   * 合并多个任务的文件结果
   */
  mergeTaskResults(results: Map<string, TaskResult>): Record<string, string> {
    const merged: Record<string, string> = {};

    for (const [, result] of results) {
      if (result.files) {
        Object.assign(merged, result.files);
      }
    }

    return merged;
  }

  /**
   * 清理已完成的任务
   */
  cleanup(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') {
        this.tasks.delete(id);
      }
    }
    for (const [id, group] of this.groups) {
      if (group.status === 'completed' || group.status === 'failed') {
        this.groups.delete(id);
      }
    }
  }

  /**
   * 重置所有任务
   */
  reset(): void {
    this.tasks.clear();
    this.groups.clear();
    this.runningTasks.clear();
    this.idCounter = 0;
  }

  // ======================== Private ========================

  /**
   * 拓扑排序：将任务按依赖关系分层
   * 同层的任务可以并行执行
   */
  private topologicalSort(tasks: Task[]): Task[][] {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // 初始化
    for (const task of tasks) {
      inDegree.set(task.id, 0);
      adjList.set(task.id, []);
    }

    // 构建依赖图
    for (const task of tasks) {
      for (const dep of task.dependencies) {
        if (taskMap.has(dep)) {
          adjList.get(dep)!.push(task.id);
          inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        }
      }
    }

    // BFS 分层
    const layers: Task[][] = [];
    let queue = tasks
      .filter(t => (inDegree.get(t.id) || 0) === 0)
      .map(t => t.id);

    while (queue.length > 0) {
      const currentLayer = queue.map(id => taskMap.get(id)!);
      layers.push(currentLayer);

      const nextQueue: string[] = [];
      for (const id of queue) {
        for (const neighbor of adjList.get(id) || []) {
          const newDegree = (inDegree.get(neighbor) || 0) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) {
            nextQueue.push(neighbor);
          }
        }
      }
      queue = nextQueue;
    }

    return layers;
  }

  /**
   * 限制并发数执行 Promise
   */
  private async executeConcurrent(promises: Promise<void>[]): Promise<void> {
    const executing: Promise<void>[] = [];

    for (const p of promises) {
      const wrapped = p.then(() => {
        executing.splice(executing.indexOf(wrapped), 1);
      });
      executing.push(wrapped);

      if (executing.length >= this.maxConcurrent) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
  }
}

/** 全局单例 */
export const taskManager = new TaskManager();

// ======================== 便捷工厂函数 ========================

/**
 * 为代码生成创建并行任务组
 */
export function createGenerationTaskGroup(
  projectName: string,
  configs: Array<{
    type: TaskType;
    name: string;
    description: string;
    execute: () => Promise<TaskResult>;
    dependencies?: string[];
  }>
): TaskGroup {
  const tasks: Task[] = [];

  for (const config of configs) {
    const task = taskManager.createTask({
      type: config.type,
      name: config.name,
      description: config.description,
      dependencies: config.dependencies,
      execute: config.execute,
    });
    tasks.push(task);
  }

  return taskManager.createTaskGroup(`Generate: ${projectName}`, tasks);
}
