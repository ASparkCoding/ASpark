import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read DATABASE_URL from apps/web/.env.local
const envPath = join(rootDir, 'apps', 'web', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const match = envContent.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
if (!match) {
  console.error('No DATABASE_URL found in apps/web/.env.local');
  process.exit(1);
}
const DB_URL = match[1];

const migrationFiles = [
  '001_init_users.sql',
  '002_projects.sql',
  '003_project_files.sql',
  '004_generation_sessions.sql',
  '005_plan_sessions.sql',
  '006_project_entities.sql',
  '007_project_messages.sql',
  '008_app_settings.sql',
  '000_seed_user.sql',
];

async function runMigrations() {
  const postgres = (await import('postgres')).default;
  const sql = postgres(DB_URL, { ssl: 'require' });

  try {
    console.log('Connected to database');

    for (const file of migrationFiles) {
      const content = readFileSync(join(rootDir, 'supabase', 'migrations', file), 'utf8');
      console.log(`Running migration: ${file}`);
      await sql.unsafe(content);
      console.log(`  ✓ ${file} completed`);
    }

    console.log('\nAll migrations completed successfully!');
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    await sql.end();
  }
}

runMigrations();
