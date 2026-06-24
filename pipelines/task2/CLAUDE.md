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
