import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

export type TaskId = 'task1' | 'task2' | 'task3';

interface PipelineFile {
  filename: string;
  code: string;
}

interface PipelineFiles {
  template: PipelineFile;
  schema: PipelineFile;
  viewSchema: PipelineFile;
  renderer: PipelineFile;
  renderView: PipelineFile;
}

/**
 * Load all pipeline files for a task from the local filesystem.
 * These get uploaded to the Anthropic container for execution.
 */
export async function loadPipelineFiles(task: TaskId): Promise<PipelineFiles | null> {
  const base = join(process.cwd(), 'pipelines', task);
  try {
    return {
      template: {
        filename: `template_${task}.py`,
        code: await readFile(join(base, `template_${task}.py`), 'utf8'),
      },
      schema: {
        filename: 'schema.json',
        code: await readFile(join(base, 'schema.json'), 'utf8'),
      },
      viewSchema: {
        filename: 'view_schema.json',
        code: await readFile(join(base, 'view_schema.json'), 'utf8'),
      },
      renderer: {
        filename: 'renderer.html',
        code: await readFile(join(base, 'renderer.html'), 'utf8'),
      },
      renderView: {
        filename: 'render_view.py',
        code: await readFile(join(base, 'render_view.py'), 'utf8'),
      },
    };
  } catch (e) {
    console.warn(`[pipeline] Failed to load files for ${task}:`, (e as Error).message);
    return null;
  }
}

/**
 * Compute SHA-256 hash of file content for cache lookup.
 */
export function hashFileContent(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
