/**
 * Scaffold 基础模板文件
 * 服务端：从磁盘读取 shadcn/ui 组件、工具函数、CSS 变量、Tailwind 配置等
 * 客户端：仅提供模板路径列表（用于过滤），完整内容通过 SSE 流获取
 *
 * 在 scaffold 生成时自动注入，LLM 无需重复生成这些标准文件
 */

export interface TemplateFile {
  path: string;
  content: string;
}

/**
 * 模板文件路径常量（客户端安全，无 fs 依赖）
 */
export const SCAFFOLD_TEMPLATE_PATHS: string[] = [
  // shadcn/ui components (25 total)
  'src/components/ui/button.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/label.tsx',
  'src/components/ui/card.tsx',
  'src/components/ui/badge.tsx',
  'src/components/ui/textarea.tsx',
  'src/components/ui/separator.tsx',
  'src/components/ui/table.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/tabs.tsx',
  'src/components/ui/dropdown-menu.tsx',
  'src/components/ui/avatar.tsx',
  'src/components/ui/switch.tsx',
  // NEW shadcn/ui components
  'src/components/ui/skeleton.tsx',
  'src/components/ui/alert.tsx',
  'src/components/ui/alert-dialog.tsx',
  'src/components/ui/sheet.tsx',
  'src/components/ui/form.tsx',
  'src/components/ui/popover.tsx',
  'src/components/ui/checkbox.tsx',
  'src/components/ui/scroll-area.tsx',
  'src/components/ui/tooltip.tsx',
  'src/components/ui/radio-group.tsx',
  'src/components/ui/progress.tsx',
  // infrastructure files (pre-injected, LLM should not regenerate)
  'src/components/ErrorBoundary.tsx',
  'src/components/Loading.tsx',
  'src/components/EmptyState.tsx',
  'src/types/index.ts',
  'src/lib/supabase.ts',
  'src/lib/data-service.ts',
  'src/lib/auth.tsx',
  'src/lib/storage.ts',
  'src/main.tsx',
  // critical config files (must always exist for Vite to boot)
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'index.html',
  // other config files
  'tailwind.config.js',
  'postcss.config.js',
  'src/index.css',
  'src/lib/utils.ts',
  'src/vite-env.d.ts',
  'vercel.json',
];

let cachedTemplates: TemplateFile[] | null = null;

/**
 * 获取 scaffold 模板文件列表（含内容）
 * 服务端：从磁盘读取 + 内存缓存
 * 客户端：返回空数组（模板通过 SSE 流注入）
 */
export function getScaffoldTemplateFiles(): TemplateFile[] {
  if (cachedTemplates) return cachedTemplates;

  // 客户端环境：无法读取文件系统
  if (typeof window !== 'undefined') {
    return [];
  }

  try {
    // 动态 require 避免客户端打包报错
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');

    const templateDir = path.join(process.cwd(), 'lib', 'templates', 'shadcn-files');
    const configDir = path.join(process.cwd(), 'lib', 'templates', 'config-files');

    const files: TemplateFile[] = [];

    // 读取 shadcn UI 组件文件
    if (fs.existsSync(templateDir)) {
      for (const file of fs.readdirSync(templateDir)) {
        if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          files.push({
            path: `src/components/ui/${file}`,
            content: fs.readFileSync(path.join(templateDir, file), 'utf-8'),
          });
        }
      }
    }

    // 读取配置文件
    if (fs.existsSync(configDir)) {
      const configMap: Record<string, string> = {
        // Critical files: Vite cannot boot without these
        'package.json': 'package.json',
        'vite.config.ts': 'vite.config.ts',
        'tsconfig.json': 'tsconfig.json',
        'tsconfig.node.json': 'tsconfig.node.json',
        'index.html': 'index.html',
        // Other config files
        'tailwind.config.js': 'tailwind.config.js',
        'postcss.config.js': 'postcss.config.js',
        'index.css': 'src/index.css',
        'utils.ts': 'src/lib/utils.ts',
        'vite-env.d.ts': 'src/vite-env.d.ts',
        'vercel.json': 'vercel.json',
      };
      for (const [filename, targetPath] of Object.entries(configMap)) {
        const filePath = path.join(configDir, filename);
        if (fs.existsSync(filePath)) {
          files.push({
            path: targetPath,
            content: fs.readFileSync(filePath, 'utf-8'),
          });
        }
      }
    }

    // 读取基础设施文件
    const infraDir = path.join(process.cwd(), 'lib', 'templates', 'infra-files');
    if (fs.existsSync(infraDir)) {
      const infraMap: Record<string, string> = {
        'error-boundary.tsx': 'src/components/ErrorBoundary.tsx',
        'loading.tsx': 'src/components/Loading.tsx',
        'empty-state.tsx': 'src/components/EmptyState.tsx',
        'types.ts': 'src/types/index.ts',
        'supabase-client.ts': 'src/lib/supabase.ts',
        'data-service.ts': 'src/lib/data-service.ts',
        'auth.tsx': 'src/lib/auth.tsx',
        'storage.ts': 'src/lib/storage.ts',
        'main.tsx': 'src/main.tsx',
      };
      for (const [filename, targetPath] of Object.entries(infraMap)) {
        const filePath = path.join(infraDir, filename);
        if (fs.existsSync(filePath)) {
          files.push({
            path: targetPath,
            content: fs.readFileSync(filePath, 'utf-8'),
          });
        }
      }
    }

    cachedTemplates = files;
    return files;
  } catch {
    // 如果 fs 不可用（某些边缘情况），返回空数组
    return [];
  }
}

/**
 * 清除模板缓存（开发时用于热重载）
 */
export function clearTemplateCache(): void {
  cachedTemplates = null;
}
