import * as XLSX from 'xlsx';
import type { TaskId } from '@/lib/s3-pipelines';

// Minimal column signatures used to route an uploaded dataset to a task pipeline.
// Only confident matches return a task; everything else returns null so the LLM
// detects/handles it as before.
const SIGNATURES: { task: TaskId; required: string[] }[] = [
  { task: 'task1', required: ['CHWS_Temperature', 'Cooling_Power', 'Valve_Feedback'] },
  { task: 'task2', required: ['ahu_power_kW', 'cooling_load_RT', 'airside_efficiency_kW_per_RT'] },
  // task3 signature is added when its dataset/contract is defined.
];

function headerFromXlsx(buf: Buffer): string[] {
  try {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    const first = (rows[0] as unknown[]) || [];
    return first.map((c) => (c == null ? '' : String(c).trim()));
  } catch {
    return [];
  }
}

function headerFromCsv(buf: Buffer): string[] {
  const text = buf.toString('utf8').split(/\r?\n/)[0] || '';
  return text.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
}

/**
 * Inspect an uploaded file's header row and return the matching task id, or null.
 * Server-side only (uses the file bytes available at upload time).
 */
export function detectTask(buf: Buffer, filename: string): TaskId | null {
  const lower = filename.toLowerCase();
  let header: string[] = [];
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) header = headerFromXlsx(buf);
  else if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) header = headerFromCsv(buf);
  if (header.length === 0) return null;

  // Exact match first (preserves existing behavior for task1)
  const exactSet = new Set(header);
  for (const sig of SIGNATURES) {
    if (sig.required.every((c) => exactSet.has(c))) return sig.task;
  }

  // Case-insensitive + underscore-normalized fallback for real-world variants
  const normalizedSet = new Set(header.map((h) => h.toLowerCase().replace(/[\s-]+/g, '_')));
  for (const sig of SIGNATURES) {
    const normalizedRequired = sig.required.map((c) => c.toLowerCase().replace(/[\s-]+/g, '_'));
    if (normalizedRequired.every((c) => normalizedSet.has(c))) return sig.task;
  }

  return null;
}
