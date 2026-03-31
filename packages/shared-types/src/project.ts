export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'deployed' | 'error';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  tech_stack: string[];
  status: ProjectStatus;
  preview_url: string | null;
  prod_url: string | null;
  app_settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  path: string;
  content: string;
  version: number;
  created_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}
