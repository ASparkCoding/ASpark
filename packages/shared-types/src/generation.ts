export type GenerationType = 'scaffold' | 'iterate' | 'refactor' | 'complete' | 'reason';

export type LLMProvider = 'doubao' | 'deepseek' | 'kimi' | 'codex';

export type ModelId =
  | 'doubao-seed-2-0-pro-260215'
  | 'doubao-seed-1-6-flash-250115'
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'kimi-k2.5'
  | 'openai/gpt-5.3-codex';

export interface GenerationRequest {
  projectId: string;
  prompt: string;
  type: GenerationType;
  contextFiles?: string[];
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GenerationSession {
  id: string;
  project_id: string;
  model: string;
  prompt: string;
  tokens_used: number;
  cost: number;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  file_changes: FileChange[];
  created_at: string;
}

export interface FileChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  content?: string;
}

export interface ParsedFile {
  path: string;
  content: string;
}
