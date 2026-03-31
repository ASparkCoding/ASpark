export type DeployStatus = 'pending' | 'building' | 'success' | 'failed';

export interface Deployment {
  id: string;
  project_id: string;
  github_repo: string | null;
  vercel_url: string | null;
  status: DeployStatus;
  deployed_at: string;
}

export interface DeployRequest {
  projectId: string;
  repoName?: string;
}
