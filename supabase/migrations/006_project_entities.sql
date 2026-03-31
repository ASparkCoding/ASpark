-- Project entities: tracks data models generated for each project
CREATE TABLE IF NOT EXISTS project_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- Entity name, e.g. "Customer"
  display_name TEXT NOT NULL,            -- Display name, e.g. "客户"
  fields JSONB NOT NULL DEFAULT '[]',    -- Field definitions: [{ name, type, required, default, description }]
  table_name TEXT NOT NULL,              -- Corresponding database table name
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, name)
);

-- RLS
ALTER TABLE project_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_entities_policy ON project_entities
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Index for fast lookup by project
CREATE INDEX IF NOT EXISTS idx_project_entities_project_id ON project_entities(project_id);
