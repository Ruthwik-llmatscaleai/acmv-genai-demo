import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'fs/promises';
import { join } from 'path';

const REGION = process.env.AWS_REGION || 'us-west-2';
const BUCKET = process.env.PIPELINES_BUCKET || '';

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

export type TaskId = 'task1' | 'task2' | 'task3';

export interface PipelineFile {
  /** Filename to materialise in the container, e.g. "pipeline_task1.py". */
  filename: string;
  /** The pipeline source code. */
  code: string;
}

/**
 * Fetch the current good pipeline for a task from S3 (`<task>/pipeline_latest.py`).
 * Falls back to local filesystem (`pipelines/<task>/pipeline_latest.py`) for dev.
 * Returns null if not configured or not found — callers fall back to LLM analysis.
 */
export async function getLatestPipeline(task: TaskId): Promise<PipelineFile | null> {
  if (BUCKET) {
    try {
      const res = await s3().send(
        new GetObjectCommand({ Bucket: BUCKET, Key: `${task}/pipeline_latest.py` })
      );
      const code = await res.Body!.transformToString();
      return { filename: `pipeline_${task}.py`, code };
    } catch (e) {
      console.warn(`[s3-pipelines] S3 fetch failed for ${task}:`, (e as Error).message);
    }
  }

  // Fallback: local filesystem (for dev without S3)
  try {
    const localPath = join(process.cwd(), 'pipelines', task, 'pipeline_latest.py');
    const code = await readFile(localPath, 'utf8');
    return { filename: `pipeline_${task}.py`, code };
  } catch {
    return null;
  }
}

export function pipelinesConfigured(): boolean {
  return !!BUCKET;
}
