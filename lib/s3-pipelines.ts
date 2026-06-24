import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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
 * Returns null if not configured or not found — callers fall back to LLM analysis.
 */
export async function getLatestPipeline(task: TaskId): Promise<PipelineFile | null> {
  if (!BUCKET) return null;
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${task}/pipeline_latest.py` })
    );
    const code = await res.Body!.transformToString();
    return { filename: `pipeline_${task}.py`, code };
  } catch (e) {
    console.warn(`[s3-pipelines] no pipeline for ${task}:`, (e as Error).message);
    return null;
  }
}

export function pipelinesConfigured(): boolean {
  return !!BUCKET;
}
