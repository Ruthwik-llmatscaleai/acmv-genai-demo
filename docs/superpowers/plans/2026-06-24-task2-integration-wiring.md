# Task 2 Integration — Wiring Pipeline into Chat App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the deterministic Task 2 pipeline (schema.json → template_task2.py → render_view.py) into the live chat application so it works end-to-end: user uploads file → system produces dashboard + PPTX with zero LLM code generation.

**Architecture:** LLM fills two JSONs (schema + view), server runs deterministic scripts, results served as artifacts. kpis.json stored in conversation metadata for follow-ups. Strict separation: LLM decides WHAT (content), templates decide HOW (layout).

**Tech Stack:** Next.js 16 + TypeScript, Prisma 7.3 + PostgreSQL, Anthropic API (Claude Sonnet 4.5), Python 3 (pandas, scipy, python-pptx), Vercel AI SDK.

## Global Constraints

- Follow existing code style: TypeScript strict, consistent with patterns in `app/api/chat/route.ts`
- Python scripts must use ONLY Anthropic container-available libraries
- All new TypeScript files must have JSDoc comments on exported functions
- Pipeline output contract: `kpis.json` schema is the source of truth
- No auto-detection of columns — LLM MUST fill schema.json explicitly
- Error messages must be user-friendly (no stack traces in UI)
- Tests: at minimum, unit tests for new utility functions
- File/folder naming: kebab-case for files, descriptive names
- Remove `__pycache__` and any generated files from git tracking
- Update CLAUDE.md in relevant directories when adding new patterns

## Folder Cleanup (before starting)

```
RENAME/REORGANIZE:
  pipelines/task2/ → keep as-is (it's the pipeline scripts)
  
REMOVE from git:
  pipelines/task2/__pycache__/
  pipelines/task2/test_kpis.json (generated output, not source)
  
ADD to .gitignore:
  __pycache__/
  *.pyc
  pipelines/*/kpis.json
  pipelines/*/cleaned_data.csv
  pipelines/*/dashboard.html
  pipelines/*/*.pptx
```

---

### Task 1: Cleanup — Remove Generated Files, Update .gitignore, Add CLAUDE.md

**Files:**
- Modify: `.gitignore`
- Remove: `pipelines/task2/__pycache__/`, `pipelines/task2/test_kpis.json`
- Create: `pipelines/CLAUDE.md`
- Create: `pipelines/task2/CLAUDE.md`

**Interfaces:**
- Produces: Clean repo state, documented pipeline directory

- [ ] **Step 1: Update .gitignore**

Add to `.gitignore`:
```
# Pipeline outputs (generated, not source)
__pycache__/
*.pyc
pipelines/*/kpis.json
pipelines/*/cleaned_data.csv
pipelines/*/dashboard.html
pipelines/*/*.pptx
```

- [ ] **Step 2: Remove cached/generated files from git**

```bash
git rm -r --cached pipelines/task2/__pycache__/ 2>/dev/null
git rm --cached pipelines/task2/test_kpis.json 2>/dev/null
```

- [ ] **Step 3: Create pipelines/CLAUDE.md**

```markdown
# Pipelines Directory

## Architecture

Each task has a deterministic analysis pipeline:
- `schema.json` — Column mapping template (LLM fills this)
- `template_<task>.py` — Fixed math logic (never modified by LLM)
- `view_schema.json` — View configuration template (LLM fills this)
- `renderer.html` — Dashboard template (renders any view.json)
- `render_view.py` — Produces HTML + PPTX from view.json

## Flow

1. LLM inspects uploaded data → fills `schema.json` (column mapping)
2. Server runs `template_task2.py <data> <schema.json>` → `kpis.json`
3. LLM reads `kpis.json` → fills `view.json` (what to show)
4. Server runs `render_view.py <view.json> --html --pptx` → outputs

## Coding Standards

- Python 3.10+ compatible
- Type hints on all function signatures
- Docstrings on all public functions (one line + params if needed)
- No auto-detection or heuristics — LLM must explicitly fill mappings
- All math formulas are FIXED — never trust LLM-generated calculations
- Null-safe: always handle missing columns gracefully with explicit notes
- Tests: `python <script> --help` must show usage without crashing
```

- [ ] **Step 4: Create pipelines/task2/CLAUDE.md**

```markdown
# Task 2 — AHU Airside Optimization Pipeline

## Files

| File | Purpose | Modified by LLM? |
|------|---------|-------------------|
| `schema.json` | Column mapping template | YES — LLM fills column names |
| `template_task2.py` | Compute KPIs (fixed math) | NO — deterministic |
| `view_schema.json` | View configuration template | YES — LLM fills content |
| `renderer.html` | Dashboard HTML renderer | NO — fixed layout |
| `render_view.py` | Produce HTML + PPTX | NO — deterministic |
| `generate_pptx.py` | Standalone PPTX (simpler) | NO — deterministic |

## BCA Targets (hardcoded in template_task2.py)

- Airside efficiency: ≤ 0.14 kW/RT
- Total system efficiency: ≤ 0.74 kW/RT
- Plantroom assumed: 0.60 kW/RT
- Comfort: 22–24.5°C, RH ≤ 75%
- Tariff: S$0.25/kWh

## Testing

```bash
python template_task2.py test_data/sample_500rows.csv schema_filled.json
python render_view.py view_filled.json --html --pptx
```
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: cleanup generated files, add pipeline documentation"
```

---

### Task 2: Database Schema — Add PipelineResult Model

**Files:**
- Modify: `prisma/schema.prisma`
- Run: `npm run db:generate`

**Interfaces:**
- Produces: `PipelineResult` model for storing kpis.json per conversation
- Consumed by: chat route (store after pipeline run, load for follow-ups)

- [ ] **Step 1: Add PipelineResult model to schema.prisma**

```prisma
// Pipeline results — stored kpis.json for follow-up queries
model PipelineResult {
  id             String   @id @default(uuid())
  conversationId String   @unique @map("conversation_id")
  taskType       String   @map("task_type")  // 'task1' | 'task2' | 'task3'
  fileHash       String?  @map("file_hash")  // SHA-256 of input file (for cache hits)
  kpis           Json                         // Full kpis.json content
  schema         Json?                        // The filled schema.json used
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([fileHash])
  @@map("pipeline_results")
}
```

- [ ] **Step 2: Add relation to Conversation model**

```prisma
// Add to Conversation model:
pipelineResult PipelineResult?
```

- [ ] **Step 3: Generate Prisma client**

```bash
npm run db:generate
```

- [ ] **Step 4: Create migration**

```bash
npm run db:migrate -- --name add_pipeline_results
```

- [ ] **Step 5: Add CRUD helpers to lib/storage.ts**

```typescript
/**
 * Store pipeline result for a conversation.
 */
export async function storePipelineResult(
  conversationId: string,
  taskType: string,
  kpis: Record<string, unknown>,
  schema?: Record<string, unknown>,
  fileHash?: string
) {
  return db.pipelineResult.upsert({
    where: { conversationId },
    create: { conversationId, taskType, kpis, schema, fileHash },
    update: { kpis, schema, taskType, fileHash },
  });
}

/**
 * Get stored pipeline result for a conversation (for follow-up queries).
 */
export async function getPipelineResult(conversationId: string) {
  return db.pipelineResult.findUnique({ where: { conversationId } });
}

/**
 * Check if we've seen this exact file before (cache hit by hash).
 */
export async function getPipelineResultByFileHash(fileHash: string) {
  return db.pipelineResult.findFirst({ where: { fileHash } });
}
```

- [ ] **Step 6: Commit**

```bash
git add prisma/ lib/storage.ts && git commit -m "feat: add PipelineResult model for kpis.json persistence"
```

---

### Task 3: Update System Prompt — Instruct LLM to Fill JSONs

**Files:**
- Modify: `lib/system-prompts.ts`

**Interfaces:**
- Consumes: Existing system prompt structure
- Produces: Updated prompt that instructs LLM to fill schema.json + view.json

- [ ] **Step 1: Add Task 2 pipeline instructions to system prompt**

In `lib/system-prompts.ts`, add a new section to `BASE_PROMPT` after the use-case signatures:

```typescript
// Add after "### Use-case signatures and required outputs"

## Pipeline Execution Protocol (Task 2 — Airside Optimization)

When you detect a Task 2 dataset (AHU power, cooling load, before/after periods), follow this EXACT protocol:

### Step A: Fill schema.json
Inspect the uploaded file's columns and produce a JSON mapping:
\`\`\`json
{
  "file_info": {"sheet_name": null, "data_start_row": 0, "delimiter": ","},
  "columns": {
    "power": {"column": "<actual column name for AHU power in kW>", "required": true},
    "load": {"column": "<column for cooling load in RT, or null>", "required": false},
    "timestamp": {"column": "<timestamp column, or null>", "required": false},
    "return_temp": {"column": "<return air temp column, or null>", "required": false},
    "return_rh": {"column": "<return air RH column, or null>", "required": false},
    "status": {"column": "<AHU on/off column, or null>", "required": false}
  },
  "period_split": {
    "method": "column|date_range",
    "column": "<period column name>",
    "before_value": "<value meaning 'before'>",
    "after_value": "<value meaning 'after'>"
  },
  "unit_conversions": {"power_multiply_by": 1.0, "load_multiply_by": 1.0}
}
\`\`\`
Write this as schema_filled.json, then run:
\`python template_task2.py "<datafile>" "schema_filled.json"\`

### Step B: Read kpis.json
The pipeline produces kpis.json with all computed metrics. Read it.

### Step C: Fill view.json
Based on the user's question and kpis.json results, produce a view configuration:
\`\`\`json
{
  "title": "<dashboard title>",
  "subtitle": "<one-line summary>",
  "cards": [
    {"id": "saving", "label": "Energy Saving", "value": "<from kpis>", "sub": "<detail>", "status": "pass|fail|neutral", "visible": true}
  ],
  "charts": [
    {"id": "power_comparison", "type": "bar", "title": "...", "visible": true, "data": {"categories": [...], "series": [...]}}
  ],
  "table": {"visible": true, "headers": [...], "rows": [...]},
  "narrative": {"title": "Conclusion", "status": "pass|fail|partial", "text": "<plain FM language>", "findings": ["...", "..."]}
}
\`\`\`
Write this as view_filled.json, then run:
\`python render_view.py "view_filled.json" --html\`
The output dashboard.html is your artifact.

### Step D: For PPTX deliverable
Run: \`python render_view.py "view_filled.json" --pptx\`

### Rules
- NEVER write your own math for KPIs — the pipeline does all calculations
- NEVER generate dashboard HTML manually — always use render_view.py
- If the pipeline errors, fix schema_filled.json and re-run (don't write new Python)
- For follow-up questions: read kpis.json, answer directly or update view.json
```

- [ ] **Step 2: Verify prompt length is still cacheable (≥1024 tokens for Sonnet)**

```bash
node -e "const {getSystemPrompt} = require('./lib/system-prompts'); console.log('System prompt tokens (approx):', getSystemPrompt().split(/\s+/).length)"
```

Should be well over 1024 words (~2000+ tokens). Caching will work.

- [ ] **Step 3: Commit**

```bash
git add lib/system-prompts.ts && git commit -m "feat: update system prompt with Task 2 pipeline protocol"
```

---

### Task 4: Chat Route Integration — Pipeline Orchestration

**Files:**
- Modify: `app/api/chat/route.ts`
- Create: `lib/pipeline-orchestrator.ts`

**Interfaces:**
- Consumes: Detected taskType from upload, conversation state
- Produces: Pipeline scripts injected into container, kpis.json stored after run

- [ ] **Step 1: Create lib/pipeline-orchestrator.ts**

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

export type TaskId = 'task1' | 'task2' | 'task3';

interface PipelineFiles {
  template: { filename: string; code: string };
  schema: { filename: string; code: string };
  viewSchema: { filename: string; code: string };
  renderer: { filename: string; code: string };
  renderView: { filename: string; code: string };
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
```

- [ ] **Step 2: Update chat route to inject ALL pipeline files**

In `app/api/chat/route.ts`, replace the current pipeline injection logic (lines ~160-200) with:

```typescript
import { loadPipelineFiles, hashFileContent } from '@/lib/pipeline-orchestrator';
import { getPipelineResult } from '@/lib/storage';

// Inside the attachments handling section:
if (detected?.taskType) {
  // Check if we already have results for this conversation
  const existingResult = conversationId
    ? await getPipelineResult(conversationId)
    : null;

  if (existingResult) {
    // Inject kpis.json directly — no need to re-run pipeline
    const kpisFile = await toFile(
      Buffer.from(JSON.stringify(existingResult.kpis), 'utf8'),
      'kpis.json',
      { type: 'application/json' }
    );
    const kpisUpload = await filesClient.beta.files.upload(
      { file: kpisFile },
      { headers: { 'anthropic-beta': 'files-api-2025-04-14' } }
    );
    containerFileIds.push(kpisUpload.id);
    pipelineNote = `\n\nPrevious analysis results (kpis.json) are in the working directory. Answer from these results directly. Only re-run the pipeline if the user uploads NEW data.`;
  } else {
    // First time — inject full pipeline files
    const pipelineFiles = await loadPipelineFiles(detected.taskType as TaskId);
    if (pipelineFiles) {
      for (const [key, file] of Object.entries(pipelineFiles)) {
        const uploadable = await toFile(
          Buffer.from(file.code, 'utf8'),
          file.filename,
          { type: key.endsWith('.py') ? 'text/x-python' : 'application/json' }
        );
        const up = await filesClient.beta.files.upload(
          { file: uploadable },
          { headers: { 'anthropic-beta': 'files-api-2025-04-14' } }
        );
        containerFileIds.push(up.id);
      }

      const dataName = detected.filename;
      pipelineNote =
        `\n\nPipeline files are in the working directory for ${detected.taskType}:` +
        `\n- template_${detected.taskType}.py (fixed math — run this)` +
        `\n- schema.json (template — fill this with column mapping)` +
        `\n- view_schema.json (template — fill this for dashboard)` +
        `\n- renderer.html + render_view.py (rendering — run after view.json is ready)` +
        `\n\nFollow the Pipeline Execution Protocol in your instructions. Data file: "${dataName}"`;
    }
  }
}
```

- [ ] **Step 3: Store kpis.json after pipeline run completes**

In the `onFinish` callback, after the message is persisted, check if code execution produced a kpis.json:

```typescript
// In onFinish, after message persistence:
if (conversationId && detected?.taskType) {
  // Look for kpis.json in tool results
  for (const step of steps) {
    if (step.toolResults) {
      for (const tr of step.toolResults) {
        const resultStr = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result);
        // Check if output mentions kpis.json was written
        if (resultStr.includes('[template_task2] Written: kpis.json') ||
            resultStr.includes('"task": "task2"')) {
          // Try to extract kpis from the output
          try {
            // The LLM usually reads kpis.json and includes it in text
            const kpisMatch = text.match(/```json\n(\{[\s\S]*?"task":\s*"task2"[\s\S]*?\})\n```/);
            if (kpisMatch) {
              const kpis = JSON.parse(kpisMatch[1]);
              await storePipelineResult(conversationId, detected.taskType, kpis);
              console.log('[Chat] Stored pipeline result for', conversationId);
            }
          } catch { /* best effort */ }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/pipeline-orchestrator.ts app/api/chat/route.ts && git commit -m "feat: wire pipeline orchestration into chat route"
```

---

### Task 5: Follow-up Query Handling — Inject kpis.json Into Context

**Files:**
- Modify: `app/api/chat/route.ts`

**Interfaces:**
- Consumes: Stored PipelineResult from DB
- Produces: kpis.json injected into system prompt for follow-ups

- [ ] **Step 1: Load kpis.json for existing conversations**

Before the `streamText` call, check if this conversation has stored results:

```typescript
// Before building streamConfig:
let kpisContext = '';
if (conversationId) {
  const result = await getPipelineResult(conversationId);
  if (result) {
    kpisContext = `\n\n## Analysis Results (source of truth — cite numbers from here)\n\`\`\`json\n${JSON.stringify(result.kpis, null, 2)}\n\`\`\`\n\nFor follow-up questions, answer directly from these pre-computed results. Do NOT re-run the pipeline unless the user uploads a new file.`;
  }
}

// Append to system prompt:
const systemPrompt = buildSystemPromptWithTools(toolNames, mcpToolDescriptions) + kpisContext;
```

- [ ] **Step 2: Verify caching still works**

The kpis.json section changes per conversation, but the base system prompt (2500+ tokens) is still a cacheable prefix. The kpis addition (~800 tokens) comes after and varies — this is fine, only the prefix is cached.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts && git commit -m "feat: inject stored kpis.json into follow-up context"
```

---

### Task 6: Error Handling — Schema Validation + Retry Flow

**Files:**
- Create: `lib/schema-validator.ts`
- Modify: system prompt (add error handling instructions)

**Interfaces:**
- Consumes: LLM-generated schema.json
- Produces: Validation result (pass/fail + error message)

- [ ] **Step 1: Create lib/schema-validator.ts**

```typescript
/**
 * Validate a filled schema.json before running the pipeline.
 * Returns null if valid, or an error message if invalid.
 */
export function validateFilledSchema(schema: Record<string, unknown>): string | null {
  // Must have columns section
  const columns = schema.columns as Record<string, unknown> | undefined;
  if (!columns) return 'Missing "columns" section in schema';

  // Power column is required
  const power = columns.power as { column?: string } | undefined;
  if (!power?.column) return 'Missing required "power" column mapping';

  // Period split must have a method
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

  return null; // Valid
}

/**
 * Validate a filled view.json before rendering.
 */
export function validateFilledView(view: Record<string, unknown>): string | null {
  if (!view.title) return 'Missing "title" in view.json';
  if (!view.narrative) return 'Missing "narrative" section in view.json';
  return null;
}
```

- [ ] **Step 2: Add retry instruction to system prompt**

Add to the pipeline protocol section:

```
### Error Handling
- If template_task2.py errors with "Cannot find power column": your schema.json has wrong column name. Re-inspect the file and fix.
- If template_task2.py errors with "Cannot split periods": your period_split is wrong. Check the actual values in the period column.
- If render_view.py errors: your view.json is malformed. Check JSON syntax.
- NEVER write custom Python to work around a pipeline error. Fix the schema and re-run.
- Maximum 2 retry attempts. If still failing, report the error to the user and ask for clarification.
```

- [ ] **Step 3: Commit**

```bash
git add lib/schema-validator.ts lib/system-prompts.ts && git commit -m "feat: add schema validation + retry instructions for pipeline errors"
```

---

### Task 7: Tests — Unit Tests for New Modules

**Files:**
- Create: `tests/lib/pipeline-orchestrator.test.ts`
- Create: `tests/lib/schema-validator.test.ts`
- Create: `tests/lib/data-sufficiency.test.ts`
- Create: `tests/lib/task-detect.test.ts`

**Interfaces:**
- Validates: All new utility functions work correctly

- [ ] **Step 1: Create test for task-detect.ts**

```typescript
import { detectTask } from '@/lib/task-detect';

describe('detectTask', () => {
  it('returns task2 for exact column match', () => {
    const csv = 'timestamp,period,ahu_power_kW,cooling_load_RT,airside_efficiency_kW_per_RT\n1,before,7,25,0.28';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBe('task2');
  });

  it('returns task2 for case-insensitive match', () => {
    const csv = 'Timestamp,Period,AHU_Power_kW,Cooling_Load_RT,Airside_Efficiency_kW_per_RT\n1,before,7,25,0.28';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBe('task2');
  });

  it('returns task1 for task1 columns', () => {
    const csv = 'CHWS_Temperature,Cooling_Power,Valve_Feedback\n7.5,100,50';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBe('task1');
  });

  it('returns null for unknown columns', () => {
    const csv = 'temperature,humidity,pressure\n25,60,101';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Create test for schema-validator.ts**

```typescript
import { validateFilledSchema, validateFilledView } from '@/lib/schema-validator';

describe('validateFilledSchema', () => {
  it('passes valid schema', () => {
    const schema = {
      columns: { power: { column: 'ahu_power_kW', required: true } },
      period_split: { method: 'column', column: 'period', before_value: 'Before', after_value: 'After' },
    };
    expect(validateFilledSchema(schema)).toBeNull();
  });

  it('fails when power column missing', () => {
    const schema = { columns: { power: { column: null } }, period_split: { method: 'column', column: 'p', before_value: 'B', after_value: 'A' } };
    expect(validateFilledSchema(schema)).toContain('power');
  });

  it('fails when period_split method missing', () => {
    const schema = { columns: { power: { column: 'power' } }, period_split: {} };
    expect(validateFilledSchema(schema)).toContain('period_split');
  });
});

describe('validateFilledView', () => {
  it('passes valid view', () => {
    expect(validateFilledView({ title: 'Test', narrative: { text: 'ok' } })).toBeNull();
  });

  it('fails without title', () => {
    expect(validateFilledView({ narrative: { text: 'ok' } })).toContain('title');
  });
});
```

- [ ] **Step 3: Create test for data-sufficiency.ts**

```typescript
import { answerFromData, type KPIs } from '@/lib/data-sufficiency';

const mockKpis: KPIs = {
  task: 'task2',
  level1_raw: { avg_power_before_kW: 7.02, avg_power_after_kW: 3.45 },
  level2_derived: { saving_pct: 50.9, saving_kWh: 666.7, airside_eff_after_kW_per_RT: 0.130, total_system_eff_after_kW_per_RT: 0.73 },
  level3_verdicts: { meets_sle_airside: true, comfort_ok: true, avg_return_temp_C: 23.5, avg_return_rh_pct: 62, p_value: 0.0001, t_statistic: 45.2, saving_statistically_significant: true },
  level4_financial: { annual_saving_sgd: 5864, building_20_floors_2_ahus_annual_sgd: 234560, ten_year_sgd: 2345600 },
};

describe('answerFromData', () => {
  it('answers SLE question', () => {
    const answer = answerFromData('Does it meet the SLE target?', mockKpis);
    expect(answer).toContain('Yes');
    expect(answer).toContain('0.130');
  });

  it('answers savings question', () => {
    const answer = answerFromData('How much energy was saved?', mockKpis);
    expect(answer).toContain('50.9%');
  });

  it('returns null for novel questions', () => {
    const answer = answerFromData('Why does power spike on humid days?', mockKpis);
    expect(answer).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/lib/ --passWithNoTests
```

- [ ] **Step 5: Commit**

```bash
git add tests/ && git commit -m "test: add unit tests for pipeline orchestrator, schema validator, data sufficiency"
```

---

### Task 8: Update Root CLAUDE.md — Document New Architecture

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: Updated project documentation reflecting the pipeline architecture

- [ ] **Step 1: Add pipeline architecture section to CLAUDE.md**

Add after the "Architecture" section:

```markdown
### Pipeline Architecture (Task 2+)

For HVAC analysis tasks, the system uses a deterministic pipeline approach:

1. **Routing:** `lib/task-detect.ts` identifies the task from file headers
2. **Schema:** LLM fills `schema.json` (column mapping for the uploaded file)
3. **Computation:** `template_task2.py` runs fixed math → produces `kpis.json`
4. **View:** LLM fills `view.json` (what to show, what narrative to write)
5. **Rendering:** `render_view.py` produces HTML dashboard + PPTX from `view.json`
6. **Persistence:** `kpis.json` stored in DB for follow-up queries

Key principles:
- LLM decides WHAT (content), templates decide HOW (layout)
- Math formulas are FIXED in Python — LLM cannot hallucinate calculations
- Missing data reported as null with explicit notes
- Follow-ups read from stored kpis.json — fixed context, never grows

Pipeline files: `pipelines/<task>/`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md && git commit -m "docs: update CLAUDE.md with pipeline architecture"
```

---

## Implementation Order & Dependencies

```
Task 1 (cleanup) → independent, do first
Task 2 (DB schema) → independent, do early (others depend on it)
Task 3 (system prompt) → independent
Task 4 (chat route) → depends on Task 2 + Task 3
Task 5 (follow-up handling) → depends on Task 2 + Task 4
Task 6 (error handling) → depends on Task 3
Task 7 (tests) → depends on all code being written
Task 8 (docs) → do last
```

## Success Criteria

After all tasks are complete:
1. Upload `AHU_Airside_Optimisation_Dataset.csv` → system auto-detects Task 2
2. LLM fills schema.json → template runs → kpis.json produced
3. LLM fills view.json → dashboard renders in artifact panel
4. PPTX is downloadable
5. Follow-up questions answered from stored kpis.json (not re-running pipeline)
6. All tests pass
7. No TypeScript lint errors
