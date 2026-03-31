'use client';

import { useState, useCallback } from 'react';
import {
  Download,
  Loader2,
  Rocket,
  ExternalLink,
  Check,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import { exportProjectAsZip } from '@/lib/export';
import type { DeployStatus } from '@/store/editorStore';

export function DeployButton({ projectId }: { projectId: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const { files } = useEditorStore();
  const {
    deployStatus,
    deployUrl,
    setDeployStatus,
    setDeployUrl,
    appendDeployLog,
    clearDeployLogs,
  } = useEditorStore();
  const { currentProject } = useProjectStore();

  const projectName = currentProject?.name || `project-${projectId.slice(0, 8)}`;

  const handleExport = async () => {
    if (files.length === 0) return;
    setIsExporting(true);
    try {
      const parsedFiles = files.map((f) => ({ path: f.path, content: f.content }));
      await exportProjectAsZip(parsedFiles, projectName);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeploy = useCallback(async () => {
    const currentStatus = useEditorStore.getState().deployStatus;
    const latestFiles = useEditorStore.getState().files;

    if (latestFiles.length === 0 || currentStatus === 'uploading' || currentStatus === 'building') return;

    clearDeployLogs();
    setDeployStatus('uploading');
    setDeployUrl(null);
    setErrorDetail(null);

    try {
      const parsedFiles = latestFiles.map((f) => ({
        path: f.path,
        content: f.content,
      }));

      console.log(`[Deploy] Sending ${parsedFiles.length} files to /api/projects/${projectId}/deploy`);

      const response = await fetch(`/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: parsedFiles,
          projectName,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[Deploy] Response not ok:', response.status, errText);
        throw new Error(errText || `HTTP ${response.status}`);
      }

      // Read streaming NDJSON status
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line) as Record<string, unknown>;
              processEvent(data);
            } catch {
              // skip malformed lines
            }
          }
        }

        if (buffer.trim()) {
          try {
            processEvent(JSON.parse(buffer));
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[Deploy] Error:', msg);
      setDeployStatus('error');
      setErrorDetail(msg);
      appendDeployLog(`Deploy failed: ${msg}`);
    }
  }, [projectId, projectName, clearDeployLogs, setDeployStatus, setDeployUrl, appendDeployLog]);

  /** Process a single NDJSON event from the deploy stream */
  function processEvent(data: Record<string, unknown>) {
    const message = (data.message as string) || '';
    appendDeployLog(message);

    switch (data.status) {
      case 'uploading':
        setDeployStatus('uploading');
        break;
      case 'building':
        setDeployStatus('building');
        if (data.deploymentUrl) {
          setDeployUrl(data.deploymentUrl as string);
        }
        break;
      case 'ready':
        setDeployStatus('ready');
        if (data.deploymentUrl) {
          setDeployUrl(data.deploymentUrl as string);
        }
        setErrorDetail(null);
        break;
      case 'error':
        setDeployStatus('error');
        setErrorDetail(message);
        break;
    }
  }

  const isDeploying = deployStatus === 'uploading' || deployStatus === 'building';
  const disabled = files.length === 0;

  return (
    <div className="flex items-center gap-2">
      {/* Deploy status indicator */}
      {deployStatus !== 'idle' && (
        <DeployStatusBadge
          status={deployStatus}
          url={deployUrl}
          errorDetail={errorDetail}
        />
      )}

      {/* Main action group */}
      <div className="flex items-center">
        <Button
          onClick={handleDeploy}
          disabled={disabled || isDeploying}
          size="sm"
          className="gap-2 rounded-r-none"
        >
          {isDeploying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          {deployStatus === 'uploading'
            ? '上传中...'
            : deployStatus === 'building'
              ? '构建中...'
              : '发布'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="rounded-l-none border-l border-primary-foreground/20 px-2"
              disabled={disabled}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDeploy} disabled={isDeploying}>
              <Rocket className="h-4 w-4 mr-2" />
              部署到 Vercel
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? '导出中...' : '导出为 ZIP'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function DeployStatusBadge({
  status,
  url,
  errorDetail,
}: {
  status: DeployStatus;
  url: string | null;
  errorDetail: string | null;
}) {
  if (status === 'ready' && url) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-green-600 hover:text-green-700 h-7 px-2"
        onClick={() => window.open(url, '_blank')}
      >
        <Check className="h-3.5 w-3.5" />
        <span className="text-xs max-w-[150px] truncate">
          {url.replace('https://', '')}
        </span>
        <ExternalLink className="h-3 w-3" />
      </Button>
    );
  }

  if (status === 'error') {
    return (
      <span
        className="text-xs text-red-500 flex items-center gap-1 max-w-[250px] truncate cursor-help"
        title={errorDetail || '部署失败'}
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {errorDetail || '部署失败'}
      </span>
    );
  }

  return null;
}
