-- Add app_settings JSONB column to projects table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'app_settings'
  ) THEN
    ALTER TABLE projects ADD COLUMN app_settings JSONB DEFAULT '{
      "visibility": "private",
      "requireLogin": false,
      "showBadge": true
    }';
  END IF;
END $$;
