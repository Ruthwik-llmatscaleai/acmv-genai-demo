# How We Save Tokens — Simple Flowchart

## The Problem

Every time you ask the AI a question, it costs tokens (= money). The more text the AI reads and writes, the more it costs.

**Old way:** AI does ALL the math, writes ALL the code, generates ALL the HTML every single time. Expensive.

**Our way:** AI only decides WHAT to do. Fixed scripts do the actual work. Results are saved so follow-ups cost almost nothing.

---

## First Question (User uploads a file)

```
┌─────────────────────────────────────────────────────────┐
│  USER: "Analyse this AHU data"  + uploads CSV           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 1: AI reads the column names (tiny task)          │
│                                                         │
│  AI output: a small JSON mapping file (~20 lines)       │
│  "power column = ahu_power_kW, period column = period"  │
│                                                         │
│  💰 Cost: ~200 tokens (just filling a template)         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 2: Fixed Python script runs (ZERO tokens)         │
│                                                         │
│  template_task2.py does ALL the math:                   │
│  • Average power before/after                           │
│  • Energy savings %                                     │
│  • Efficiency in kW/RT                                  │
│  • Statistical significance                             │
│  • Financial projections                                │
│                                                         │
│  Output: kpis.json (all results in one file)            │
│                                                         │
│  💰 Cost: $0 (no AI involved — deterministic code)      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 3: AI fills a view template (~30 lines)           │
│                                                         │
│  AI reads kpis.json and decides:                        │
│  • Which cards to show                                  │
│  • What charts to display                              │
│  • What the conclusion says                             │
│                                                         │
│  💰 Cost: ~300 tokens (just filling another template)   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 4: Fixed script renders dashboard (ZERO tokens)   │
│                                                         │
│  render_view.py produces:                               │
│  • HTML dashboard with charts                           │
│  • PPTX presentation (if requested)                     │
│                                                         │
│  💰 Cost: $0 (no AI involved — template rendering)      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 5: Save results to database                       │
│                                                         │
│  kpis.json stored → ready for follow-up questions       │
│                                                         │
│  💰 Cost: $0                                            │
└─────────────────────────────────────────────────────────┘
```

---

## Follow-up Questions (No file, just a question)

```
┌─────────────────────────────────────────────────────────┐
│  USER: "Does it meet the BCA target?"                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  System loads saved kpis.json from database              │
│  (small JSON, ~50 lines of numbers)                     │
│                                                         │
│  AI reads the numbers → answers directly                │
│                                                         │
│  No file re-upload. No re-computation.                  │
│  No pipeline re-run. Just read and answer.              │
│                                                         │
│  💰 Cost: ~100 tokens                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Why This Is Cheap

| What happens                     | Who does it?     | Token cost |
|----------------------------------|------------------|------------|
| Read column names, fill mapping  | AI (small task)  | ~200       |
| Compute all KPIs (math)          | Python script    | 0          |
| Decide what to show on dashboard | AI (small task)  | ~300       |
| Render HTML / PPTX               | Python script    | 0          |
| Answer follow-up questions       | AI (reads JSON)  | ~100       |

**Total first analysis: ~500 tokens of AI work**
**Each follow-up: ~100 tokens**

---

## Three Key Tricks

### 1. AI fills templates, not writes code
The AI never writes Python or calculates formulas. It just fills in blanks in a JSON template. This means:
- It can't hallucinate wrong math
- It uses very few tokens (small output)
- Results are always formatted correctly

### 2. Compute once, answer forever
The Python script runs ONCE and saves all results. Every future question in that conversation reads from the saved file. No re-computation needed.

### 3. Prompt caching
The system prompt (instructions to the AI) is the same every time. Anthropic caches it after the first call — so subsequent calls in the same conversation get a 90% discount on reading those instructions.

---

## Visual Summary

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   FIRST MESSAGE                FOLLOW-UPS            │
│                                                      │
│   User → AI → JSON             User → AI → Answer   │
│            ↓                          ↑              │
│        Python script            Saved kpis.json      │
│            ↓                                         │
│        kpis.json → DB                                │
│            ↓                                         │
│        AI → view JSON                                │
│            ↓                                         │
│        Python → Dashboard                            │
│                                                      │
│   AI work: 2 small fills       AI work: 1 lookup    │
│   Scripts: 2 runs (free)       Scripts: 0            │
│                                                      │
└──────────────────────────────────────────────────────┘
```
