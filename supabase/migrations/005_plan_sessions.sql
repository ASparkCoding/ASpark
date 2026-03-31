-- Plan Sessions: 存储需求澄清问答和结构化 Plan
CREATE TABLE IF NOT EXISTS plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'questioning'
    CHECK (status IN ('questioning', 'plan_generated', 'approved', 'building', 'completed')),
  original_prompt TEXT NOT NULL DEFAULT '',
  questions JSONB NOT NULL DEFAULT '[]',
  answers JSONB NOT NULL DEFAULT '{}',
  plan_content TEXT,
  plan_structured JSONB,
  user_supplement TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_plan_sessions_project_id ON plan_sessions(project_id);

-- RLS
ALTER TABLE plan_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_sessions_policy ON plan_sessions
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Service role full access
CREATE POLICY plan_sessions_service_policy ON plan_sessions
  FOR ALL USING (true) WITH CHECK (true);
