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
