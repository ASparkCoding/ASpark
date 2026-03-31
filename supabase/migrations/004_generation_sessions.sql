-- 生成会话记录
CREATE TABLE IF NOT EXISTS generation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 对话消息
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES generation_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  file_changes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 部署记录
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_repo TEXT,
  vercel_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'success', 'failed')),
  deployed_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE generation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON generation_sessions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = generation_sessions.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "Users can create own sessions"
  ON generation_sessions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = generation_sessions.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM generation_sessions gs
      JOIN projects p ON p.id = gs.project_id
      WHERE gs.id = messages.session_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own messages"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM generation_sessions gs
      JOIN projects p ON p.id = gs.project_id
      WHERE gs.id = messages.session_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own deployments"
  ON deployments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = deployments.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "Users can create own deployments"
  ON deployments FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = deployments.project_id AND projects.user_id = auth.uid())
  );

-- 索引
CREATE INDEX idx_generation_sessions_project ON generation_sessions(project_id);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_deployments_project ON deployments(project_id);
