/**
 * Validate a filled schema.json before running the pipeline.
 * Returns null if valid, or an error message if invalid.
 */
export function validateFilledSchema(schema: Record<string, unknown>): string | null {
  const columns = schema.columns as Record<string, unknown> | undefined;
  if (!columns) return 'Missing "columns" section in schema';

  const power = columns.power as { column?: string } | undefined;
  if (!power?.column) return 'Missing required "power" column mapping';

  const split = schema.period_split as Record<string, unknown> | undefined;
  if (!split?.method) return 'Missing "period_split.method" — must be "column" or "date_range"';

  const method = split.method as string;
  if (method === 'column') {
    if (!split.column) return 'period_split.method is "column" but no column name specified';
    if (!split.before_value) return 'period_split.method is "column" but no before_value specified';
    if (!split.after_value) return 'period_split.method is "column" but no after_value specified';
  } else if (method === 'date_range') {
    if (!split.before_date_start || !split.before_date_end) return 'period_split.method is "date_range" but before dates not specified';
    if (!split.after_date_start || !split.after_date_end) return 'period_split.method is "date_range" but after dates not specified';
  } else {
    return `Invalid period_split.method: "${method}". Must be "column" or "date_range"`;
  }

  return null;
}

/**
 * Validate a filled view.json before rendering.
 * Returns null if valid, or an error message if invalid.
 */
export function validateFilledView(view: Record<string, unknown>): string | null {
  if (!view.title) return 'Missing "title" in view.json';
  if (!view.narrative) return 'Missing "narrative" section in view.json';
  return null;
}
