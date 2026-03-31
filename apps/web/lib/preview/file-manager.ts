import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** Base directory for all generated project files */
const PROJECTS_BASE = path.join(process.cwd(), '.generated-projects');
const GOLDEN_TEMPLATE_DIR = path.join(PROJECTS_BASE, '.golden-template');

/** Ensure the base directory exists */
function ensureBaseDir() {
  fs.mkdirSync(PROJECTS_BASE, { recursive: true });
}

/**
 * Get the local directory path for a project.
 */
export function getProjectDir(projectId: string): string {
  // Sanitize projectId to prevent path traversal
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(PROJECTS_BASE, `project-${safe}`);
}

/**
 * Error-capturing script injected into generated app's index.html.
 * Captures runtime errors and sends them to the parent window via postMessage.
 */
const ERROR_CAPTURE_SCRIPT = `<script>
(function(){
  var posted = {};
  function send(msg) {
    var key = msg.substring(0, 200);
    if (posted[key]) return;
    posted[key] = 1;
    try { window.parent.postMessage({ type: 'preview-error', message: msg }, '*'); } catch(e) {}
  }
  window.onerror = function(msg, src, line, col) {
    send('Error: ' + msg + ' at ' + (src||'unknown') + ':' + (line||0) + ':' + (col||0));
  };
  window.addEventListener('unhandledrejection', function(e) {
    send('UnhandledRejection: ' + (e.reason ? (e.reason.message || e.reason) : 'unknown'));
  });
  var origError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var msg = args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a).substring(0,500) : String(a); }).join(' ');
    if (msg.length > 10) send('console.error: ' + msg.substring(0, 800));
    origError.apply(console, arguments);
  };
})();
</script>`;

/**
 * Write all files to the project directory.
 * Creates directories as needed.
 * Automatically injects error-capture script into index.html.
 */
export async function writeProjectFiles(
  projectDir: string,
  files: { path: string; content: string }[]
): Promise<void> {
  for (const file of files) {
    // Sanitize: remove leading slashes, prevent traversal
    const normalized = file.path.replace(/^\/+/, '').replace(/\.\./g, '');
    const fullPath = path.join(projectDir, normalized);
    const dir = path.dirname(fullPath);

    // Verify the resolved path is still within projectDir
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(projectDir))) {
      console.warn(`[FileManager] Skipping path traversal attempt: ${file.path}`);
      continue;
    }

    let content = file.content;

    // Inject error-capture script into index.html
    if (normalized === 'index.html') {
      content = content.replace('<head>', '<head>' + ERROR_CAPTURE_SCRIPT);
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}

/**
 * Create a project directory from the golden template (if available)
 * or from scratch.
 */
export async function initProjectDir(
  projectId: string,
  files: { path: string; content: string }[]
): Promise<string> {
  ensureBaseDir();
  const projectDir = getProjectDir(projectId);

  // Clean up if exists
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  // Check if golden template exists and has node_modules
  const goldenNodeModules = path.join(GOLDEN_TEMPLATE_DIR, 'node_modules');
  if (fs.existsSync(goldenNodeModules)) {
    // Copy golden template structure (without node_modules)
    fs.mkdirSync(projectDir, { recursive: true });

    // Create a junction/symlink to golden template's node_modules
    const targetNodeModules = path.join(projectDir, 'node_modules');
    try {
      if (process.platform === 'win32') {
        fs.symlinkSync(goldenNodeModules, targetNodeModules, 'junction');
      } else {
        fs.symlinkSync(goldenNodeModules, targetNodeModules);
      }
    } catch {
      // If symlink fails, we'll fall back to npm install later
      console.warn('[FileManager] Failed to create node_modules symlink');
    }

    // ★ 清除 golden template 中残留的 .vite 缓存（防止多项目锁冲突）
    const goldenViteCache = path.join(goldenNodeModules, '.vite');
    if (fs.existsSync(goldenViteCache)) {
      try {
        fs.rmSync(goldenViteCache, { recursive: true, force: true });
      } catch {
        console.warn('[FileManager] Failed to clear golden template .vite cache');
      }
    }
  } else {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // Write all project files
  await writeProjectFiles(projectDir, files);

  return projectDir;
}

/**
 * Compare project's package.json dependencies with golden template's.
 * Returns an array of missing package names (e.g. ["date-fns", "recharts"]).
 */
function findMissingDeps(projectDir: string): string[] {
  try {
    const projectPkgPath = path.join(projectDir, 'package.json');
    const goldenPkgPath = path.join(GOLDEN_TEMPLATE_DIR, 'package.json');

    if (!fs.existsSync(projectPkgPath) || !fs.existsSync(goldenPkgPath)) {
      return [];
    }

    const projectPkg = JSON.parse(fs.readFileSync(projectPkgPath, 'utf-8'));
    const goldenPkg = JSON.parse(fs.readFileSync(goldenPkgPath, 'utf-8'));

    const projectDeps = {
      ...projectPkg.dependencies,
      ...projectPkg.devDependencies,
    };
    const goldenDeps = {
      ...goldenPkg.dependencies,
      ...goldenPkg.devDependencies,
    };

    const missing: string[] = [];
    for (const dep of Object.keys(projectDeps)) {
      if (!goldenDeps[dep]) {
        missing.push(dep);
      }
    }
    return missing;
  } catch {
    return [];
  }
}

/**
 * Install dependencies in the project directory.
 * Returns a promise that resolves when installation is complete.
 */
export function installDependencies(
  projectDir: string,
  onLog: (msg: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const nodeModulesPath = path.join(projectDir, 'node_modules');
    const hasNodeModules = fs.existsSync(nodeModulesPath);

    // If node_modules exists (from golden template junction), check for missing deps
    if (hasNodeModules) {
      const isSymlink = fs.lstatSync(nodeModulesPath).isSymbolicLink();
      if (isSymlink) {
        const missingDeps = findMissingDeps(projectDir);
        if (missingDeps.length === 0) {
          onLog('Using cached dependencies from template...\n');
          resolve();
          return;
        }

        // Has extra deps → remove symlink and do a real install
        onLog(`Found ${missingDeps.length} additional dependencies: ${missingDeps.join(', ')}\n`);
        onLog('Removing template link, running full install...\n');
        try {
          fs.unlinkSync(nodeModulesPath);
        } catch {
          // If unlink fails, try rmSync
          fs.rmSync(nodeModulesPath, { recursive: true, force: true });
        }
      }
    }

    onLog('Installing dependencies (this may take a moment)...\n');

    const child = spawn('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: projectDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
      ...(process.platform === 'win32' ? { windowsHide: true } : {}),
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      onLog(chunk.toString());
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // npm outputs progress to stderr
      if (!text.includes('WARN')) {
        onLog(text);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`npm install failed: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install exited with code ${code}`));
      }
    });

    // Timeout after 180s
    setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('npm install timeout (180s)'));
    }, 180_000);
  });
}

/**
 * Build the golden template by installing common dependencies once.
 * Called on first project creation if template doesn't exist.
 */
export async function ensureGoldenTemplate(
  packageJsonContent: string,
  onLog: (msg: string) => void
): Promise<void> {
  const goldenNodeModules = path.join(GOLDEN_TEMPLATE_DIR, 'node_modules');
  if (fs.existsSync(goldenNodeModules)) return;

  onLog('Building dependency cache (first time only)...\n');

  ensureBaseDir();
  fs.mkdirSync(GOLDEN_TEMPLATE_DIR, { recursive: true });

  // Write the package.json
  fs.writeFileSync(
    path.join(GOLDEN_TEMPLATE_DIR, 'package.json'),
    packageJsonContent,
    'utf-8'
  );

  // Install dependencies
  await installDependencies(GOLDEN_TEMPLATE_DIR, onLog);
}

/**
 * Update specific files in an existing project directory.
 * Used for HMR updates when the user modifies code.
 */
export async function updateProjectFiles(
  projectDir: string,
  files: { path: string; content: string }[]
): Promise<void> {
  if (!fs.existsSync(projectDir)) {
    throw new Error('Project directory does not exist');
  }
  await writeProjectFiles(projectDir, files);
}
