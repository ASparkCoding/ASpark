-- MVP 阶段默认用户（后续接入 Auth 后移除）
INSERT INTO users (id, email, name, plan, credits)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'dev@aiapp.local',
  'MVP Developer',
  'pro',
  9999
) ON CONFLICT (id) DO NOTHING;
