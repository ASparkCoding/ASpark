const fs = require('fs');
const path = require('path');

// 读取 .env.local，处理 Windows 换行和引号
const envPath = path.resolve(__dirname, '../apps/web/.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^([^=#]+)=(.*)$/);
  if (m) {
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL found');
  process.exit(1);
}

console.log('DATABASE_URL found, connecting...');
const sql = require('postgres')(url, { max: 1, connect_timeout: 15 });

const migrationFile = path.resolve(__dirname, '../supabase/migrations/005_plan_sessions.sql');
const migrationSql = fs.readFileSync(migrationFile, 'utf-8');

console.log('Executing migration 005_plan_sessions.sql ...');
sql.unsafe(migrationSql)
  .then(() => {
    console.log('Migration completed successfully!');
    return sql.end();
  })
  .catch((err) => {
    if (err.message && err.message.includes('already exists')) {
      console.log('Table/policy already exists (idempotent). OK.');
    } else {
      console.error('Migration failed:', err.message);
    }
    return sql.end();
  });
