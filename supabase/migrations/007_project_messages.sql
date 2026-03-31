-- Project chat messages: persists conversation across page refreshes
CREATE TABLE IF NOT EXISTS project_messages (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT DEFAULT 'text',
  model_info JSONB,
  file_changes JSONB,
  metadata JSONB,            -- planQuestion, suggestions, etc.
  created_at BIGINT NOT NULL -- client timestamp (ms)
);

-- RLS
ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_messages_policy ON project_messages
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_messages_project ON project_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_order ON project_messages(project_id, created_at);
