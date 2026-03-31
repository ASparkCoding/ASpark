/**
 * ASpark LSP Integration - TypeScript Language Service
 * 实时类型检查、诊断、代码补全
 *
 * 通过 TypeScript Language Service API 实现（非进程通信），
 * 直接在 Node.js 中运行，无需启动独立的 LSP 服务器。
 */

import ts from 'typescript';
import path from 'path';

// ======================== Types ========================

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  category: 'error' | 'warning' | 'info' | 'suggestion';
  code: number;
  source: string;
}

export interface CompletionItem {
  label: string;
  kind: string;
  detail?: string;
  insertText: string;
  sortText?: string;
}

export interface QuickFix {
  description: string;
  changes: Array<{ file: string; textChanges: Array<{ start: number; end: number; newText: string }> }>;
}

export interface HoverInfo {
  text: string;
  documentation?: string;
  range?: { start: { line: number; column: number }; end: { line: number; column: number } };
}

// ======================== TypeScript Service ========================

const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  baseUrl: '.',
  paths: {
    '@/*': ['./src/*'],
  },
};

class TypeScriptService {
  private services: Map<string, ts.LanguageService> = new Map();
  private fileContents: Map<string, Map<string, { content: string; version: number }>> = new Map();

  /**
   * 为项目创建或获取 Language Service 实例
   */
  getOrCreateService(projectId: string, files: Record<string, string>): ts.LanguageService {
    // 更新文件内容缓存
    if (!this.fileContents.has(projectId)) {
      this.fileContents.set(projectId, new Map());
    }
    const fileCache = this.fileContents.get(projectId)!;

    for (const [filePath, content] of Object.entries(files)) {
      const existing = fileCache.get(filePath);
      if (!existing || existing.content !== content) {
        fileCache.set(filePath, {
          content,
          version: (existing?.version || 0) + 1,
        });
      }
    }

    // 如果 service 已存在，直接复用
    if (this.services.has(projectId)) {
      return this.services.get(projectId)!;
    }

    // 创建 Language Service Host
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(fileCache.keys()).filter(f => /\.(tsx?|jsx?)$/.test(f)),
      getScriptVersion: (fileName) => String(fileCache.get(fileName)?.version || 0),
      getScriptSnapshot: (fileName) => {
        const cached = fileCache.get(fileName);
        if (cached) {
          return ts.ScriptSnapshot.fromString(cached.content);
        }
        return undefined;
      },
      getCurrentDirectory: () => '/',
      getCompilationSettings: () => DEFAULT_COMPILER_OPTIONS,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => fileCache.has(fileName),
      readFile: (fileName) => fileCache.get(fileName)?.content,
      readDirectory: () => Array.from(fileCache.keys()),
    };

    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    this.services.set(projectId, service);
    return service;
  }

  /**
   * 获取所有诊断信息（错误和警告）
   */
  getDiagnostics(projectId: string, files: Record<string, string>): Diagnostic[] {
    const service = this.getOrCreateService(projectId, files);
    const diagnostics: Diagnostic[] = [];

    for (const filePath of Object.keys(files)) {
      if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;

      try {
        const syntactic = service.getSyntacticDiagnostics(filePath);
        const semantic = service.getSemanticDiagnostics(filePath);

        for (const diag of [...syntactic, ...semantic]) {
          if (diag.file && diag.start !== undefined) {
            const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
            const endPos = diag.start + (diag.length || 0);
            const end = diag.file.getLineAndCharacterOfPosition(endPos);

            diagnostics.push({
              file: filePath,
              line: line + 1,
              column: character + 1,
              endLine: end.line + 1,
              endColumn: end.character + 1,
              message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
              category: this.mapCategory(diag.category),
              code: diag.code,
              source: 'typescript',
            });
          }
        }
      } catch {
        // 个别文件解析失败不影响其他文件
      }
    }

    return diagnostics;
  }

  /**
   * 获取指定文件的诊断
   */
  getFileDiagnostics(projectId: string, filePath: string, files: Record<string, string>): Diagnostic[] {
    return this.getDiagnostics(projectId, files).filter(d => d.file === filePath);
  }

  /**
   * 获取代码补全建议
   */
  getCompletions(
    projectId: string,
    filePath: string,
    position: number,
    files: Record<string, string>
  ): CompletionItem[] {
    const service = this.getOrCreateService(projectId, files);

    try {
      const completions = service.getCompletionsAtPosition(filePath, position, {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
      });

      if (!completions) return [];

      return completions.entries.slice(0, 50).map(entry => ({
        label: entry.name,
        kind: ts.ScriptElementKind[entry.kind] || entry.kind,
        detail: entry.labelDetails?.description,
        insertText: entry.insertText || entry.name,
        sortText: entry.sortText,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取悬停信息
   */
  getHoverInfo(
    projectId: string,
    filePath: string,
    position: number,
    files: Record<string, string>
  ): HoverInfo | null {
    const service = this.getOrCreateService(projectId, files);

    try {
      const info = service.getQuickInfoAtPosition(filePath, position);
      if (!info) return null;

      return {
        text: ts.displayPartsToString(info.displayParts),
        documentation: ts.displayPartsToString(info.documentation),
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取快速修复建议
   */
  getQuickFixes(
    projectId: string,
    filePath: string,
    start: number,
    end: number,
    errorCodes: number[],
    files: Record<string, string>
  ): QuickFix[] {
    const service = this.getOrCreateService(projectId, files);

    try {
      const fixes = service.getCodeFixesAtPosition(
        filePath,
        start,
        end,
        errorCodes,
        {},
        {}
      );

      return fixes.map(fix => ({
        description: fix.description,
        changes: fix.changes.map(change => ({
          file: change.fileName,
          textChanges: change.textChanges.map(tc => ({
            start: tc.span.start,
            end: tc.span.start + tc.span.length,
            newText: tc.newText,
          })),
        })),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取定义跳转
   */
  getDefinition(
    projectId: string,
    filePath: string,
    position: number,
    files: Record<string, string>
  ): Array<{ file: string; line: number; column: number }> {
    const service = this.getOrCreateService(projectId, files);

    try {
      const defs = service.getDefinitionAtPosition(filePath, position);
      if (!defs) return [];

      return defs.map(def => {
        const sourceFile = service.getProgram()?.getSourceFile(def.fileName);
        if (sourceFile) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(def.textSpan.start);
          return { file: def.fileName, line: line + 1, column: character + 1 };
        }
        return { file: def.fileName, line: 1, column: 1 };
      });
    } catch {
      return [];
    }
  }

  /**
   * 获取引用查找
   */
  getReferences(
    projectId: string,
    filePath: string,
    position: number,
    files: Record<string, string>
  ): Array<{ file: string; line: number; column: number }> {
    const service = this.getOrCreateService(projectId, files);

    try {
      const refs = service.getReferencesAtPosition(filePath, position);
      if (!refs) return [];

      return refs.map(ref => {
        const sourceFile = service.getProgram()?.getSourceFile(ref.fileName);
        if (sourceFile) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(ref.textSpan.start);
          return { file: ref.fileName, line: line + 1, column: character + 1 };
        }
        return { file: ref.fileName, line: 1, column: 1 };
      });
    } catch {
      return [];
    }
  }

  /**
   * 将诊断结果格式化为 Auto-Fix 可消费的错误信息
   */
  formatDiagnosticsForAutoFix(diagnostics: Diagnostic[]): string[] {
    return diagnostics
      .filter(d => d.category === 'error')
      .map(d => `${d.file}:${d.line}:${d.column} - TS${d.code}: ${d.message}`);
  }

  /**
   * 清理项目的 Language Service 缓存
   */
  disposeProject(projectId: string): void {
    const service = this.services.get(projectId);
    if (service) {
      service.dispose();
      this.services.delete(projectId);
    }
    this.fileContents.delete(projectId);
  }

  /**
   * 清理所有缓存
   */
  disposeAll(): void {
    for (const [id] of this.services) {
      this.disposeProject(id);
    }
  }

  // ======================== Private ========================

  private mapCategory(category: ts.DiagnosticCategory): Diagnostic['category'] {
    switch (category) {
      case ts.DiagnosticCategory.Error: return 'error';
      case ts.DiagnosticCategory.Warning: return 'warning';
      case ts.DiagnosticCategory.Suggestion: return 'suggestion';
      default: return 'info';
    }
  }
}

/** 全局单例 */
export const typescriptService = new TypeScriptService();
