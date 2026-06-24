import { NextRequest, NextResponse } from 'next/server';
import { toFile } from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/auth-middleware';
import { getAnthropicFilesClient, inferMimeType } from '@/lib/anthropic-files';
import { detectTask } from '@/lib/task-detect';

export const maxDuration = 120;

// Files the code-execution container can usefully work with.
const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const ALLOWED_EXT = /\.(csv|tsv|txt|xlsx|xlsm|xlsb|xls|ods|json|xml|parquet|pdf|docx|pptx|png|jpe?g|webp|gif|bmp|tiff?)$/i;
const ALLOWED_MIME = /(spreadsheet|csv|excel|text\/|json|xml|officedocument|pdf|image\/|octet-stream)/i;

function isAllowed(name: string, mime: string): boolean {
  return ALLOWED_EXT.test(name) || (!!mime && ALLOWED_MIME.test(mime));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB)` },
      { status: 413 }
    );
  }
  const detectedMime = file.type || inferMimeType(file.name);
  if (!isAllowed(file.name, detectedMime)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: "${file.name}" (${detectedMime || 'unknown type'}). ` +
          `Allowed: data (csv, tsv, xlsx, xls, xlsm, ods, json, xml, parquet), documents (pdf, docx, pptx) and images.`,
      },
      { status: 415 }
    );
  }

  try {
    const client = getAnthropicFilesClient();
    const mimeType = detectedMime;

    // Upload to the Anthropic Files API so the code-execution container can
    // materialise the file on disk (referenced later by a container_upload block).
    const bytes = Buffer.from(await file.arrayBuffer());

    // Route the dataset to a predefined task pipeline by inspecting its header.
    const taskType = detectTask(bytes, file.name);

    const uploadable = await toFile(bytes, file.name, { type: mimeType });

    const uploaded = await client.beta.files.upload(
      { file: uploadable },
      { headers: { 'anthropic-beta': 'files-api-2025-04-14' } }
    );

    return NextResponse.json({
      fileId: uploaded.id,
      filename: uploaded.filename || file.name,
      mimeType: uploaded.mime_type || mimeType,
      sizeBytes: uploaded.size_bytes ?? file.size,
      taskType,
    });
  } catch (error: unknown) {
    console.error('[Files] Upload error:', error);
    const status = (error as { status?: number })?.status;
    if (status === 413) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
