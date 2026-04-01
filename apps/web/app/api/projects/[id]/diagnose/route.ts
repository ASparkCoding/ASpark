/**
 * POST /api/projects/[id]/diagnose
 * LSP 诊断 API - TypeScript 类型检查、代码补全
 */

import { NextRequest, NextResponse } from 'next/server';
import { typescriptService } from '@/lib/lsp/typescript-service';
import { requireAuth, handleAuthError } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const { files, action, filePath, position, errorCodes } = await req.json() as {
      files: Record<string, string>;
      action: 'diagnostics' | 'completions' | 'hover' | 'definition' | 'quickfix';
      filePath?: string;
      position?: number;
      errorCodes?: number[];
    };

    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const projectId = params.id;

    switch (action) {
      case 'diagnostics': {
        const diagnostics = filePath
          ? typescriptService.getFileDiagnostics(projectId, filePath, files)
          : typescriptService.getDiagnostics(projectId, files);
        const autoFixLines = typescriptService.formatDiagnosticsForAutoFix(diagnostics);
        return NextResponse.json({ diagnostics, autoFixLines });
      }

      case 'completions': {
        if (!filePath || position === undefined) {
          return NextResponse.json({ error: 'filePath and position required' }, { status: 400 });
        }
        const completions = typescriptService.getCompletions(projectId, filePath, position, files);
        return NextResponse.json({ completions });
      }

      case 'hover': {
        if (!filePath || position === undefined) {
          return NextResponse.json({ error: 'filePath and position required' }, { status: 400 });
        }
        const hover = typescriptService.getHoverInfo(projectId, filePath, position, files);
        return NextResponse.json({ hover });
      }

      case 'definition': {
        if (!filePath || position === undefined) {
          return NextResponse.json({ error: 'filePath and position required' }, { status: 400 });
        }
        const definitions = typescriptService.getDefinition(projectId, filePath, position, files);
        return NextResponse.json({ definitions });
      }

      case 'quickfix': {
        if (!filePath || position === undefined || !errorCodes) {
          return NextResponse.json({ error: 'filePath, position and errorCodes required' }, { status: 400 });
        }
        const fixes = typescriptService.getQuickFixes(projectId, filePath, position, position, errorCodes, files);
        return NextResponse.json({ fixes });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error('[Diagnose API Error]', error);
    return NextResponse.json({ error: 'Diagnosis failed' }, { status: 500 });
  }
}
