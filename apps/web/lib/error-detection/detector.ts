/**
 * 错误检测模块：解析 Vite 编译输出和运行时日志，提取结构化错误
 */

export interface DetectedError {
  type: 'typescript' | 'import' | 'runtime' | 'syntax' | 'vite';
  file: string;
  line?: number;
  column?: number;
  message: string;
  rawLog: string;
}

/**
 * 不应触发自动修复的误报模式：
 * - 网络错误（Supabase fetch 失败等，不是代码 bug）
 * - HMR 重载失败（模板文件热更新问题，刷新即可）
 * - node_modules 内部错误（不是用户代码）
 * - Vite 内部 dep 优化日志
 * - WebSocket 连接错误（开发环境常见，非代码 bug）
 */
function isNoisyLog(log: string): boolean {
  if (log.includes('Failed to fetch') && log.includes('supabase')) return true;
  if (log.includes('[hmr]') && log.includes('Failed to reload')) return true;
  if (log.includes('node_modules/.vite/deps/')) return true;
  if (log.includes('dep-') && log.includes('.js:')) return true;
  if (log.includes('net::ERR_')) return true;
  if (log.includes('favicon.ico')) return true;
  // WebSocket / HMR 连接错误
  if (log.includes('WebSocket') && log.includes('connection')) return true;
  if (log.includes('[vite] connecting...')) return true;
  if (log.includes('[vite] connected.')) return true;
  // Vite 内部预转换警告
  if (log.includes('Pre-transform error') && log.includes('node_modules')) return true;
  // npm install 输出
  if (log.includes('added') && log.includes('packages in')) return true;
  if (log.includes('npm warn') || log.includes('npm WARN')) return true;
  // Dev server 状态日志
  if (log.includes('Dev server ready at')) return true;
  if (log.includes('Files updated (HMR)')) return true;
  if (log.includes('Using cached dependencies')) return true;
  return false;
}

/**
 * 从预览日志中检测错误
 */
export function detectErrors(logs: string[]): DetectedError[] {
  const errors: DetectedError[] = [];
  const seen = new Set<string>();

  for (const log of logs) {
    // 过滤误报日志
    if (isNoisyLog(log)) continue;

    const detected = parseSingleLog(log);
    for (const err of detected) {
      // 过滤 node_modules 和 template UI 组件中的错误（不是用户代码）
      if (err.file.includes('node_modules')) continue;
      if (err.file.includes('components/ui/') && err.message.includes('Failed to reload')) continue;

      // 去重：同一文件同一消息只保留一条
      const key = `${err.file}:${err.line || ''}:${err.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        errors.push(err);
      }
    }
  }

  return errors;
}

function parseSingleLog(log: string): DetectedError[] {
  const errors: DetectedError[] = [];

  // Vite 错误：[plugin:vite:import-analysis] Failed to resolve import
  if (log.includes('Failed to resolve import') || log.includes('Could not resolve')) {
    const importMatch = log.match(/Failed to resolve import "([^"]+)" from "([^"]+)"/);
    const resolveMatch = log.match(/Could not resolve "([^"]+)".*?in\s+"?([^\s"]+)"?/);
    const m = importMatch || resolveMatch;
    if (m) {
      errors.push({
        type: 'import',
        file: normalizeFilePath(m[2]),
        message: `Cannot resolve import "${m[1]}"`,
        rawLog: log,
      });
    } else {
      errors.push({
        type: 'import',
        file: extractFileFromLog(log),
        message: log.trim().slice(0, 200),
        rawLog: log,
      });
    }
  }

  // Module not found
  if (log.includes('Module not found') || log.includes('Cannot find module')) {
    const modMatch = log.match(/(?:Module not found|Cannot find module)\s*['"]?([^'";\s]+)/);
    errors.push({
      type: 'import',
      file: extractFileFromLog(log),
      message: modMatch ? `Module not found: "${modMatch[1]}"` : log.trim().slice(0, 200),
      rawLog: log,
    });
  }

  // TypeScript 错误：TS2xxx, TS7xxx 等
  if (/TS\d{4}/.test(log) && /error/.test(log)) {
    const tsMatch = log.match(/([^\s(]+\.tsx?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/);
    if (tsMatch) {
      errors.push({
        type: 'typescript',
        file: normalizeFilePath(tsMatch[1]),
        line: parseInt(tsMatch[2]),
        column: parseInt(tsMatch[3]),
        message: `${tsMatch[4]}: ${tsMatch[5].trim()}`,
        rawLog: log,
      });
    } else {
      // 备选格式
      const altMatch = log.match(/(TS\d+):\s*(.+)/);
      if (altMatch) {
        errors.push({
          type: 'typescript',
          file: extractFileFromLog(log),
          message: `${altMatch[1]}: ${altMatch[2].trim()}`,
          rawLog: log,
        });
      }
    }
  }

  // ★ Vite Internal server error（浏览器请求文件时触发的编译错误）
  if (log.includes('Internal server error') && !errors.length) {
    const internalMatch = log.match(/Internal server error:\s*(.+)/);
    if (internalMatch) {
      errors.push({
        type: 'vite',
        file: extractFileFromLog(log),
        message: internalMatch[1].trim().slice(0, 300),
        rawLog: log,
      });
    }
  }

  // ★ RollupError（Vite 底层打包错误）
  if (log.includes('RollupError') && !errors.length) {
    const rollupMatch = log.match(/RollupError:\s*(.+)/);
    errors.push({
      type: 'vite',
      file: extractFileFromLog(log),
      message: rollupMatch ? `RollupError: ${rollupMatch[1].trim().slice(0, 200)}` : 'RollupError',
      rawLog: log,
    });
  }

  // ★ Vite transform/esbuild 错误
  if (log.includes('Transform failed') && !errors.length) {
    const transformMatch = log.match(/Transform failed.*?:\s*(.+)/);
    errors.push({
      type: 'syntax',
      file: extractFileFromLog(log),
      message: transformMatch ? transformMatch[1].trim().slice(0, 200) : 'Transform failed',
      rawLog: log,
    });
  }

  // Vite 编译错误: x]  / [vite] 格式
  if (log.includes('[vite]') && (log.includes('error') || log.includes('Error'))) {
    if (!errors.length) {
      errors.push({
        type: 'vite',
        file: extractFileFromLog(log),
        message: log.replace(/\[vite\]\s*/, '').trim().slice(0, 300),
        rawLog: log,
      });
    }
  }

  // SyntaxError
  if (log.includes('SyntaxError')) {
    const synMatch = log.match(/SyntaxError:\s*(.+?)(?:\s+\(|$)/);
    errors.push({
      type: 'syntax',
      file: extractFileFromLog(log),
      message: synMatch ? `SyntaxError: ${synMatch[1]}` : 'SyntaxError',
      rawLog: log,
    });
  }

  // ReferenceError
  if (log.includes('ReferenceError')) {
    const refMatch = log.match(/ReferenceError:\s*(.+?)(?:\s+at|$)/);
    errors.push({
      type: 'runtime',
      file: extractFileFromLog(log),
      message: refMatch ? `ReferenceError: ${refMatch[1]}` : 'ReferenceError',
      rawLog: log,
    });
  }

  // TypeError
  if (log.includes('TypeError') && !log.includes('[vite]') && !errors.length) {
    const typeMatch = log.match(/TypeError:\s*(.+?)(?:\s+at|$)/);
    errors.push({
      type: 'runtime',
      file: extractFileFromLog(log),
      message: typeMatch ? `TypeError: ${typeMatch[1]}` : 'TypeError',
      rawLog: log,
    });
  }

  // Vite [plugin:xxx] 格式
  if (log.includes('[plugin:') && (log.includes('error') || log.includes('Error')) && !errors.length) {
    const pluginMatch = log.match(/\[plugin:([^\]]+)\]\s*(.*)/);
    if (pluginMatch) {
      errors.push({
        type: 'vite',
        file: extractFileFromLog(log),
        message: `[${pluginMatch[1]}] ${pluginMatch[2].trim().slice(0, 200)}`,
        rawLog: log,
      });
    }
  }

  // ★ Process exited with error code（Vite 进程崩溃）
  if (log.includes('Process exited with code') && !errors.length) {
    const codeMatch = log.match(/Process exited with code (\d+)/);
    const code = codeMatch ? codeMatch[1] : 'unknown';
    if (code !== '0') {
      errors.push({
        type: 'vite',
        file: 'unknown',
        message: `Vite dev server crashed (exit code ${code})`,
        rawLog: log,
      });
    }
  }

  // ★ Runtime errors from iframe postMessage (prefixed with [runtime])
  if (log.startsWith('[runtime]') && !errors.length) {
    const runtimeMsg = log.replace('[runtime] ', '').trim();
    // Parse "Error: msg at file:line:col" format
    const atMatch = runtimeMsg.match(/(?:Error|console\.error|UnhandledRejection):\s*(.+?)(?:\s+at\s+([^\s:]+):(\d+)(?::(\d+))?)?$/);
    if (atMatch) {
      errors.push({
        type: 'runtime',
        file: atMatch[2] ? normalizeFilePath(atMatch[2]) : 'unknown',
        line: atMatch[3] ? parseInt(atMatch[3]) : undefined,
        column: atMatch[4] ? parseInt(atMatch[4]) : undefined,
        message: atMatch[1].trim().slice(0, 300),
        rawLog: log,
      });
    } else if (runtimeMsg.length > 10) {
      errors.push({
        type: 'runtime',
        file: extractFileFromLog(runtimeMsg),
        message: runtimeMsg.slice(0, 300),
        rawLog: log,
      });
    }
  }

  // 通用 "error" in Vite output with file path
  if (log.toLowerCase().includes('error') && !errors.length) {
    const filePathMatch = log.match(/(?:\/|src\/)[\w/.@-]+\.(?:tsx?|jsx?|css|json)/);
    if (filePathMatch) {
      errors.push({
        type: 'vite',
        file: normalizeFilePath(filePathMatch[0]),
        message: log.trim().slice(0, 300),
        rawLog: log,
      });
    }
  }

  return errors;
}

/**
 * 从日志行中尽力提取文件路径
 */
function extractFileFromLog(log: string): string {
  // 匹配 src/xxx.tsx 或 /xxx/xxx.ts 格式
  const pathMatch = log.match(/(?:\/|src\/)[\w/.@-]+\.(?:tsx?|jsx?|css|json|vue|svelte)/);
  if (pathMatch) return normalizeFilePath(pathMatch[0]);

  // 匹配 from "xxx" 格式
  const fromMatch = log.match(/from\s+["']([^"']+)["']/);
  if (fromMatch) return normalizeFilePath(fromMatch[1]);

  return 'unknown';
}

/**
 * 标准化文件路径：去掉前导 / 和 ./，保持相对路径
 */
function normalizeFilePath(path: string): string {
  return path.replace(/^[./\\]+/, '').replace(/\\/g, '/');
}

// ─── Auto-fix 分级策略 ───

type FixStrategy = 'precise' | 'expanded' | 'alternative' | 'fallback';

function getFixStrategy(round: number): FixStrategy {
  if (round <= 3) return 'precise';
  if (round <= 6) return 'expanded';
  if (round <= 8) return 'alternative';
  return 'fallback';
}

const STRATEGY_INSTRUCTIONS: Record<FixStrategy, string> = {
  precise: `策略：精准修复
- 只修改出错的文件，最小改动
- 保持所有现有功能不变
- 只修复类型错误和 import 路径`,

  expanded: `策略：扩大修复范围
- 前几轮修复未能解决问题，需要检查关联文件
- 如果类型定义有问题，修改类型定义文件
- 如果组件接口不匹配，修改调用方或被调用方`,

  alternative: `策略：替代方案
- 之前的修复方式没有奏效，需要换个思路
- 如果是第三方库导致的问题，改用原生 JS 或项目已有库实现
- 如果组件设计有问题，可以简化组件实现
- 允许移除复杂的功能实现，用简单版本替代`,

  fallback: `策略：兜底保证编译通过
- 这是最后几轮修复机会，优先保证应用能编译运行
- 可以用占位实现替代复杂功能（如 // TODO: implement later）
- 可以注释掉有问题的代码块
- 移除无法修复的 import 和组件引用
- 目标是让应用至少能显示一个可运行的页面`,
};

/**
 * 构建自动修复 Prompt
 *
 * @param errors - 检测到的错误列表
 * @param fileContents - 相关文件内容
 * @param allFilePaths - 项目中所有文件路径（可选，帮助 LLM 了解项目结构）
 * @param round - 当前修复轮次（用于策略演进）
 * @param previousAttempts - 前几轮修复历史（避免重复同一思路）
 */
export function buildAutoFixPrompt(
  errors: DetectedError[],
  fileContents: Array<{ path: string; content: string }>,
  allFilePaths?: string[],
  round: number = 1,
  previousAttempts: string[] = []
): string {
  const strategy = getFixStrategy(round);

  // ★ 识别 npm 包缺失错误，给 LLM 更明确的指导
  const npmPkgErrors: string[] = [];
  for (const e of errors) {
    if (e.type === 'import') {
      const m = e.message.match(/Cannot resolve import "([^"]+)"/);
      if (m && !m[1].startsWith('.') && !m[1].startsWith('@/') && !m[1].startsWith('src/')) {
        npmPkgErrors.push(m[1]);
      }
    }
  }

  let prompt = `以下文件存在编译/运行时错误，请修复所有错误。只输出需要修改的文件。

## 修复轮次：第 ${round} 轮（共 10 轮上限）

## ${STRATEGY_INSTRUCTIONS[strategy]}
`;

  if (npmPkgErrors.length > 0) {
    prompt += `
## ⚠️ 重要：检测到 npm 包缺失
以下 npm 包无法导入：${npmPkgErrors.map(p => `"${p}"`).join(', ')}

**解决方案（必须严格执行）：**
1. 首先检查 package.json 是否已包含该包。如果已包含，则只需确保 import 语句正确即可（平台会自动安装）
2. 如果 package.json 中没有该包，你必须将所有使用该包的代码替换为原生 JS 实现或项目已有的依赖
3. 必须检查并修复 **所有文件** 中对该包的引用，不能只修复报错的那一个文件
4. 如果 package.json 需要添加该依赖，也要输出修改后的 package.json

常见替代方案：
- date-fns → new Date().toLocaleDateString() / Intl.DateTimeFormat
- axios → fetch API
- lodash → 原生 JS Array/Object 方法
- moment → Intl.DateTimeFormat / Date 原生方法
`;
  }

  prompt += `
## 错误列表
${errors.map((e) => `- [${e.type}] ${e.file}${e.line ? `:${e.line}` : ''}: ${e.message}`).join('\n')}
`;

  // 附加前几轮修复历史
  if (previousAttempts.length > 0) {
    prompt += `\n## 之前的修复尝试（已失败，请换不同思路）
${previousAttempts.map((a, i) => `### 第 ${i + 1} 轮尝试\n${a}`).join('\n')}
`;
  }

  prompt += `\n## 相关文件内容
${fileContents.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}`;

  // ★ 提供项目文件列表，帮助 LLM 理解项目结构和可用模块
  if (allFilePaths && allFilePaths.length > 0) {
    prompt += `\n\n## 项目中已有的文件
${allFilePaths.map((p) => `- ${p}`).join('\n')}`;
  }

  // ★ D5: 提供已安装依赖列表，帮助 LLM 判断 npm 包是否可用
  const pkgFile = fileContents.find(f => f.path === 'package.json');
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const deps = Object.keys(pkg.dependencies || {}).join(', ');
      if (deps) {
        prompt += `\n\n## 项目已安装的 npm 依赖（可以直接 import）
${deps}

如果代码中使用了不在上述列表中的 npm 包，要么将其添加到 package.json，要么改用已有依赖实现。`;
      }
    } catch { /* package.json 解析失败，忽略 */ }
  }

  prompt += `

要求：
1. 确保所有 import 路径正确（使用 @/ 别名或相对路径）
2. 确保所有类型定义完整
3. 如果缺少依赖组件，创建空的占位实现或使用已有替代
4. 如果是"Failed to resolve import"类的npm包缺失错误（如 date-fns, recharts, axios 等），有两种修复方式：
   a) **优先方式**：确保该包在 package.json 的 dependencies 中（如果缺少则输出修改后的 package.json），平台会自动重新安装
   b) **备选方式**：用原生 JS 或项目已有依赖替代，需要修改 **所有** 引用了该包的文件，不能遗漏
5. 修复所有 TypeScript 类型错误
6. 输出格式仍为 <file path="...">content</file>
7. 只输出需要修改的文件，不要输出未改动的文件
8. 如果错误是 "Vite dev server crashed"，检查 vite.config.ts 和入口文件（main.tsx/App.tsx）是否有语法错误
9. 如果错误涉及缺少的组件或模块，请参考"项目中已有的文件"列表确认正确的 import 路径
10. 对于 npm 包缺失错误，必须搜索所有相关文件并一次性修复完毕，不能只修单个文件导致其他文件仍然报错

## 回复格式要求（非常重要）
你的文字回复必须简洁精炼，像这样：
- 用一句话说明修复了什么问题
- 不要在回复文字中包含任何代码片段、代码块或文件内容
- 不要重复错误日志内容
- 不要解释你的修复思路或分析过程
- 只输出 <file> 标签修改文件 + 一句话总结

好的回复示例：
"已修复所有构建错误：补全了缺失的 import 语句，并将不存在的图标替换为 Monitor。"

差的回复示例（不要这样）：
"我发现问题在于 xxx 文件中的 yyy 函数没有正确导入...这是因为..."（太啰嗦）`;

  return prompt;
}
