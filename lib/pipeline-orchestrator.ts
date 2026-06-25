import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export type TaskId = 'task1' | 'task2' | 'task3';

const REGION = process.env.AWS_REGION || 'us-west-2';
const BUCKET = process.env.PIPELINES_BUCKET || '';

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

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

const TASK_FILES: Record<TaskId, { key: string; filename: string; field: keyof PipelineFiles }[]> = {
  task1: [
    { key: 'pipeline_latest.py', filename: 'pipeline_task1.py', field: 'template' },
  ],
  task2: [
    { key: 'template_task2.py', filename: 'template_task2.py', field: 'template' },
    { key: 'schema.json', filename: 'schema.json', field: 'schema' },
    { key: 'view_schema.json', filename: 'view_schema.json', field: 'viewSchema' },
    { key: 'renderer.html', filename: 'renderer.html', field: 'renderer' },
    { key: 'render_view.py', filename: 'render_view.py', field: 'renderView' },
  ],
  task3: [],
};

async function fetchFromS3(task: TaskId, key: string): Promise<string | null> {
  if (!BUCKET) return null;
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${task}/${key}` })
    );
    return await res.Body!.transformToString();
  } catch (e) {
    console.warn(`[pipeline] S3 fetch failed for ${task}/${key}:`, (e as Error).message);
    return null;
  }
}

async function fetchFromLocal(task: TaskId, filename: string): Promise<string | null> {
  try {
    const localPath = join(process.cwd(), 'pipelines', task, filename);
    return await readFile(localPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Load pipeline files for a task. Tries S3 first, falls back to local disk.
 */
export async function loadPipelineFiles(task: TaskId): Promise<PipelineFiles | null> {
  const fileList = TASK_FILES[task];
  if (!fileList || fileList.length === 0) return null;

  const result: Partial<PipelineFiles> = {};

  for (const { key, filename, field } of fileList) {
    const code = await fetchFromS3(task, key) ?? await fetchFromLocal(task, key);
    if (!code) {
      console.warn(`[pipeline] Could not load ${task}/${key} from S3 or local`);
      if (field === 'template') return null; // template is required
      continue;
    }
    result[field] = { filename, code };
  }

  if (!result.template) return null;
  return result as PipelineFiles;
}

/**
 * Compute SHA-256 hash of file content for cache lookup.
 */
export function hashFileContent(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
