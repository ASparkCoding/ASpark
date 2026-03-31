import { create } from 'zustand';
import type { ProjectFile } from '@/types';

export type PreviewStatus =
  | 'idle'
  | 'creating'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'error';

export type DeployStatus =
  | 'idle'
  | 'uploading'
  | 'building'
  | 'ready'
  | 'error';

export type WorkspaceTab = 'preview' | 'dashboard' | 'code';

// ─── Build Progress Types ───

export type BuildStepAction = 'wrote' | 'creating' | 'reading' | 'editing';
export type BuildStepCategory = 'entity' | 'page' | 'component' | 'data' | 'utility';
export type BuildPhase = 'idle' | 'building' | 'fixing_errors' | 'completed' | 'background';

export interface BuildStep {
  id: string;
  action: BuildStepAction;
  target: string;        // Display name (e.g., "Dashboard Page")
  filePath: string;      // Full path
  status: 'done' | 'running' | 'pending';
  category: BuildStepCategory;
  timestamp: number;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  fileChanges?: { path: string; action: 'create' | 'update' }[];
  /** model routing info (assistant messages) */
  modelInfo?: { provider: string; model: string; type: string };
  /** Plan Mode: message subtypes */
  messageType?: 'text' | 'plan_question' | 'plan' | 'build_progress' | 'suggestion';
  planQuestion?: PlanQuestion;
  suggestions?: string[];
}

// ─── Plan Mode Types ───

export type PlanStatus =
  | 'idle'
  | 'questioning'
  | 'generating_plan'
  | 'plan_ready'
  | 'approved'
  | 'building';

export interface PlanQuestion {
  id: string;
  question: string;
  options: { label: string; value: string }[];
  answer: string | null;
  skipped: boolean;
}

export interface PlanStructured {
  intent: string;
  audience: Array<{ role: string; description: string }>;
  coreFlows: string[];
  whatNotToDo: string[];
  techRequirements: string;
  designPreferences: string;
  entities: Array<{ name: string; fields: string[] }>;
  pages: Array<{ name: string; description: string }>;
}

interface EditorState {
  // Workspace
  activeTab: WorkspaceTab;
  visualEditMode: boolean;

  // Files
  files: ProjectFile[];
  activeFilePath: string | null;
  fileTree: FileNode[];

  // Chat
  chatMessages: ChatMessage[];
  isGenerating: boolean;

  // Plan Mode
  planMode: boolean;
  planStatus: PlanStatus;
  planSessionId: string | null;
  planOriginalPrompt: string;
  planQuestions: PlanQuestion[];
  currentQuestionIndex: number;
  planContent: string | null;
  planStructured: PlanStructured | null;
  userSupplement: string;

  // Build Progress
  buildSteps: BuildStep[];
  buildPhase: BuildPhase;

  // Post-generation validation
  validationIssues: Array<{ severity: string; category: string; message: string; file?: string; autoFixable: boolean; fixSuggestion?: string }>;

  // Preview (Local Dev Server)
  previewUrl: string | null;
  previewStatus: PreviewStatus;
  previewLogs: string[];

  // Deploy (Vercel Cloud)
  deployStatus: DeployStatus;
  deployUrl: string | null;
  deployLogs: string[];

  // Dirty file tracking (HMR diff)
  dirtyFiles: Set<string>;

  // Undo/Redo file snapshots
  fileSnapshots: Array<{
    id: string;
    timestamp: number;
    files: ProjectFile[];
    label: string;
  }>;
  redoSnapshots: Array<{
    id: string;
    timestamp: number;
    files: ProjectFile[];
    label: string;
  }>;

  // Builder Questions (smart follow-up)
  builderQuestions: string[];
  builderQuestionsContext: string | null; // original prompt that triggered questions

  // Runtime errors (from iframe postMessage)
  runtimeErrors: Array<{ type: string; message: string; file: string; line?: number }>;

  // Actions - Workspace
  setActiveTab: (tab: WorkspaceTab) => void;
  setVisualEditMode: (mode: boolean) => void;

  // Actions - Files
  setFiles: (files: ProjectFile[]) => void;
  addFile: (file: ProjectFile) => void;
  updateFile: (path: string, content: string) => void;
  removeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;

  // Actions - Chat
  addChatMessage: (message: ChatMessage) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  updateLastAssistantMessage: (content: string) => void;
  setIsGenerating: (generating: boolean) => void;
  clearChat: () => void;
  removeMessagesFromId: (messageId: string) => void;

  // Actions - Plan Mode
  enterPlanMode: (prompt: string) => void;
  setPlanStatus: (status: PlanStatus) => void;
  setPlanSessionId: (id: string) => void;
  addPlanQuestion: (question: PlanQuestion) => void;
  answerPlanQuestion: (questionId: string, answer: string | null, skipped: boolean) => void;
  advanceQuestion: () => void;
  setPlanContent: (content: string) => void;
  setPlanStructured: (data: PlanStructured | null) => void;
  setUserSupplement: (text: string) => void;
  approvePlan: () => void;
  goBackToQuestion: (index: number) => void;
  exitPlanMode: () => void;

  // Actions - Build Progress
  addBuildStep: (step: BuildStep) => void;
  updateBuildStep: (id: string, updates: Partial<BuildStep>) => void;
  setBuildPhase: (phase: BuildPhase) => void;
  clearBuildProgress: () => void;

  // Actions - Validation
  setValidationIssues: (issues: Array<{ severity: string; category: string; message: string; file?: string; autoFixable: boolean; fixSuggestion?: string }>) => void;

  // Actions - Preview
  setPreviewUrl: (url: string | null) => void;
  setPreviewStatus: (status: PreviewStatus) => void;
  appendPreviewLog: (line: string) => void;
  clearPreviewLogs: () => void;

  // Actions - Dirty Files (HMR diff)
  markFileDirty: (path: string) => void;
  clearDirtyFiles: () => void;
  getDirtyFileContents: () => { path: string; content: string }[];

  // Actions - Deploy
  setDeployStatus: (status: DeployStatus) => void;
  setDeployUrl: (url: string | null) => void;
  appendDeployLog: (line: string) => void;
  clearDeployLogs: () => void;

  // Actions - Undo/Redo
  pushSnapshot: (label: string) => void;
  undo: () => void;
  redo: () => void;

  // Actions - Builder Questions
  setBuilderQuestions: (questions: string[], originalPrompt: string) => void;
  clearBuilderQuestions: () => void;

  // Actions - Runtime Errors
  addRuntimeErrors: (errors: Array<{ type: string; message: string; file: string; line?: number }>) => void;
  clearRuntimeErrors: () => void;

  // Actions - Reset
  resetEditor: () => void;
}

function buildFileTree(files: ProjectFile[]): FileNode[] {
  const root: FileNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const existing = current.find((n) => n.name === part);

      if (existing) {
        if (!isFile && existing.children) {
          current = existing.children;
        }
      } else {
        const node: FileNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : [],
        };
        current.push(node);
        if (!isFile) {
          current = node.children!;
        }
      }
    }
  }

  return sortTree(root);
}

function sortTree(nodes: FileNode[]): FileNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  }).map((n) => ({
    ...n,
    children: n.children ? sortTree(n.children) : undefined,
  }));
}

const initialPlanState = {
  planMode: false,
  planStatus: 'idle' as PlanStatus,
  planSessionId: null as string | null,
  planOriginalPrompt: '',
  planQuestions: [] as PlanQuestion[],
  currentQuestionIndex: 0,
  planContent: null as string | null,
  planStructured: null as PlanStructured | null,
  userSupplement: '',
};

const initialState = {
  activeTab: 'preview' as WorkspaceTab,
  visualEditMode: false,
  files: [] as ProjectFile[],
  activeFilePath: null as string | null,
  fileTree: [] as FileNode[],
  chatMessages: [] as ChatMessage[],
  isGenerating: false,
  ...initialPlanState,
  buildSteps: [] as BuildStep[],
  buildPhase: 'idle' as BuildPhase,
  validationIssues: [] as Array<{ severity: string; category: string; message: string; file?: string; autoFixable: boolean; fixSuggestion?: string }>,
  previewUrl: null as string | null,
  previewStatus: 'idle' as PreviewStatus,
  previewLogs: [] as string[],
  deployStatus: 'idle' as DeployStatus,
  deployUrl: null as string | null,
  deployLogs: [] as string[],
  dirtyFiles: new Set<string>(),
  fileSnapshots: [] as Array<{ id: string; timestamp: number; files: ProjectFile[]; label: string }>,
  redoSnapshots: [] as Array<{ id: string; timestamp: number; files: ProjectFile[]; label: string }>,
  builderQuestions: [] as string[],
  builderQuestionsContext: null as string | null,
  runtimeErrors: [] as Array<{ type: string; message: string; file: string; line?: number }>,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setVisualEditMode: (mode) => set({ visualEditMode: mode }),

  setFiles: (files) => {
    const tree = buildFileTree(files);
    set({ files, fileTree: tree });
    if (!get().activeFilePath && files.length > 0) {
      const firstFile = findFirstFile(tree);
      if (firstFile) {
        set({ activeFilePath: firstFile });
      }
    }
  },

  addFile: (file) => {
    const existing = get().files.find((f) => f.path === file.path);
    let files: ProjectFile[];
    if (existing) {
      files = get().files.map((f) =>
        f.path === file.path ? { ...f, content: file.content, version: file.version } : f
      );
    } else {
      files = [...get().files, file];
    }
    set({
      files,
      fileTree: buildFileTree(files),
      dirtyFiles: new Set([...get().dirtyFiles, file.path]),
    });
  },

  updateFile: (path, content) => {
    const files = get().files.map((f) =>
      f.path === path ? { ...f, content } : f
    );
    set({
      files,
      fileTree: buildFileTree(files),
      dirtyFiles: new Set([...get().dirtyFiles, path]),
    });
  },

  removeFile: (path) => {
    const files = get().files.filter((f) => f.path !== path);
    set({
      files,
      fileTree: buildFileTree(files),
      activeFilePath: get().activeFilePath === path ? null : get().activeFilePath,
    });
  },

  setActiveFile: (path) => set({ activeFilePath: path }),

  addChatMessage: (message) =>
    set({ chatMessages: [...get().chatMessages, message] }),

  setChatMessages: (messages) => set({ chatMessages: messages }),

  updateLastAssistantMessage: (content) => {
    const messages = [...get().chatMessages];
    const lastIdx = messages.length - 1;
    if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
      messages[lastIdx] = { ...messages[lastIdx], content };
      set({ chatMessages: messages });
    }
  },

  setIsGenerating: (generating) => set({ isGenerating: generating }),
  addBuildStep: (step) =>
    set((state) => ({ buildSteps: [...state.buildSteps, step] })),

  updateBuildStep: (id, updates) =>
    set((state) => ({
      buildSteps: state.buildSteps.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  setBuildPhase: (phase) => set({ buildPhase: phase }),

  clearBuildProgress: () => set({ buildSteps: [], buildPhase: 'idle' }),

  setValidationIssues: (issues) => set({ validationIssues: issues }),

  setPreviewUrl: (url) => set({ previewUrl: url }),
  setPreviewStatus: (status) => set({ previewStatus: status }),
  appendPreviewLog: (line) =>
    set((state) => ({
      previewLogs: [...state.previewLogs.slice(-200), line],
    })),
  clearPreviewLogs: () => set({ previewLogs: [] }),

  setDeployStatus: (status) => set({ deployStatus: status }),
  setDeployUrl: (url) => set({ deployUrl: url }),
  appendDeployLog: (line) =>
    set((state) => ({
      deployLogs: [...state.deployLogs.slice(-200), line],
    })),
  clearDeployLogs: () => set({ deployLogs: [] }),

  markFileDirty: (path) =>
    set((state) => ({
      dirtyFiles: new Set([...state.dirtyFiles, path]),
    })),

  clearDirtyFiles: () => set({ dirtyFiles: new Set() }),

  getDirtyFileContents: () => {
    const { files, dirtyFiles } = get();
    return files
      .filter((f) => dirtyFiles.has(f.path))
      .map((f) => ({ path: f.path, content: f.content }));
  },

  clearChat: () => set({ chatMessages: [] }),

  removeMessagesFromId: (messageId) => {
    const msgs = get().chatMessages;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    set({ chatMessages: msgs.slice(0, idx) });
  },

  // Plan Mode actions
  enterPlanMode: (prompt) =>
    set({
      planMode: true,
      planStatus: 'questioning',
      planOriginalPrompt: prompt,
      planQuestions: [],
      currentQuestionIndex: 0,
      planContent: null,
      planStructured: null,
      userSupplement: '',
    }),

  setPlanStatus: (status) => set({ planStatus: status }),
  setPlanSessionId: (id) => set({ planSessionId: id }),

  addPlanQuestion: (question) =>
    set((state) => ({
      planQuestions: [...state.planQuestions, question],
    })),

  answerPlanQuestion: (questionId, answer, skipped) =>
    set((state) => ({
      planQuestions: state.planQuestions.map((q) =>
        q.id === questionId ? { ...q, answer, skipped } : q
      ),
    })),

  advanceQuestion: () =>
    set((state) => ({
      currentQuestionIndex: state.currentQuestionIndex + 1,
    })),

  setPlanContent: (content) => set({ planContent: content }),
  setPlanStructured: (data) => set({ planStructured: data }),
  setUserSupplement: (text) => set({ userSupplement: text }),

  approvePlan: () =>
    set({ planStatus: 'approved' }),

  goBackToQuestion: (index) =>
    set((state) => ({
      currentQuestionIndex: index,
      planContent: null,
      planStructured: null,
      // ★ 清除该问题的 answer，使 PlanQuestionCard 回到可交互状态
      planQuestions: state.planQuestions.map((q, i) =>
        i === index ? { ...q, answer: null, skipped: false } : q
      ),
    })),

  exitPlanMode: () => set(initialPlanState),

  // Undo/Redo
  pushSnapshot: (label) => {
    const { files, fileSnapshots } = get();
    if (files.length === 0) return;
    set({
      fileSnapshots: [
        ...fileSnapshots.slice(-9),
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          files: files.map((f) => ({ ...f })),
          label,
        },
      ],
      redoSnapshots: [], // clear redo stack on new action
    });
  },

  undo: () => {
    const { files, fileSnapshots, redoSnapshots } = get();
    if (fileSnapshots.length === 0) return;
    const lastSnapshot = fileSnapshots[fileSnapshots.length - 1];
    const tree = buildFileTree(lastSnapshot.files);
    set({
      files: lastSnapshot.files,
      fileTree: tree,
      fileSnapshots: fileSnapshots.slice(0, -1),
      redoSnapshots: [
        ...redoSnapshots.slice(-9),
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          files: files.map((f) => ({ ...f })),
          label: 'Redo point',
        },
      ],
    });
  },

  redo: () => {
    const { files, fileSnapshots, redoSnapshots } = get();
    if (redoSnapshots.length === 0) return;
    const nextSnapshot = redoSnapshots[redoSnapshots.length - 1];
    const tree = buildFileTree(nextSnapshot.files);
    set({
      files: nextSnapshot.files,
      fileTree: tree,
      redoSnapshots: redoSnapshots.slice(0, -1),
      fileSnapshots: [
        ...fileSnapshots.slice(-9),
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          files: files.map((f) => ({ ...f })),
          label: 'Undo point',
        },
      ],
    });
  },

  // Builder Questions
  setBuilderQuestions: (questions, originalPrompt) =>
    set({ builderQuestions: questions, builderQuestionsContext: originalPrompt }),

  clearBuilderQuestions: () =>
    set({ builderQuestions: [], builderQuestionsContext: null }),

  // Runtime Errors
  addRuntimeErrors: (errors) =>
    set((state) => ({
      runtimeErrors: [...state.runtimeErrors, ...errors].slice(-20),
    })),

  clearRuntimeErrors: () => set({ runtimeErrors: [] }),

  resetEditor: () => set(initialState),
}));

function findFirstFile(nodes: FileNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'file') return node.path;
    if (node.children) {
      const found = findFirstFile(node.children);
      if (found) return found;
    }
  }
  return null;
}
