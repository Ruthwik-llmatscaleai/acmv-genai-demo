#!/usr/bin/env python3
"""
template_task2.py — Deterministic AHU Airside Optimization Template

Architecture:
  1. LLM fills schema.json (column mapping + period split logic)
  2. This template executes FIXED math using that mapping
  3. Output: kpis.json with nulls where data is missing

The LLM cannot hallucinate math — formulas are fixed here.
The LLM cannot hide missing data — template forces null + notes.
The LLM CAN adapt to any file format — just fills the mapping.

Usage: python template_task2.py <dataset> <schema.json>
       python template_task2.py <dataset>  (uses default mapping heuristics)
"""

import sys
import json
import pandas as pd
import numpy as np
from scipy import stats

# ============================================================
# FIXED CONSTANTS (never change, from BCA requirements)
# ============================================================
TARGET_AIRSIDE_KW_PER_RT = 0.14
TARGET_TOTAL_KW_PER_RT = 0.74
PLANTROOM_ASSUMED_KW_PER_RT = 0.60
TARIFF_SGD_PER_KWH = 0.25
COMFORT_TEMP_MIN = 22.0
COMFORT_TEMP_MAX = 24.5
COMFORT_RH_MAX = 75.0


# ============================================================
# STEP 1: LOAD DATA (adapts to schema mapping)
# ============================================================
def load_data(filepath, schema):
    """Load file using schema instructions."""
    file_info = schema.get("file_info", {})
    start_row = file_info.get("data_start_row", 0)

    if filepath.endswith(('.xlsx', '.xls')):
        sheet = file_info.get("sheet_name") or 0
        df = pd.read_excel(filepath, sheet_name=sheet, skiprows=start_row)
    else:
        delimiter = file_info.get("delimiter", ",")
        df = pd.read_csv(filepath, skiprows=start_row, sep=delimiter)

    return df


# ============================================================
# STEP 2: RESOLVE COLUMNS (map schema names to actual columns)
# ============================================================
def resolve_columns(df, schema):
    """Map schema column names to actual dataframe columns."""
    columns = schema.get("columns", {})
    resolved = {}

    for key, spec in columns.items():
        col_name = spec.get("column")
        if col_name and col_name in df.columns:
            resolved[key] = col_name
        elif col_name:
            # Try case-insensitive match
            lower_map = {c.lower(): c for c in df.columns}
            if col_name.lower() in lower_map:
                resolved[key] = lower_map[col_name.lower()]
            else:
                resolved[key] = None
        else:
            resolved[key] = None

    return resolved


# ============================================================
# STEP 3: APPLY UNIT CONVERSIONS (fixed logic)
# ============================================================
def apply_conversions(df, resolved, schema):
    """Apply unit conversions from schema."""
    conversions = schema.get("unit_conversions", {})

    if resolved.get("power") and conversions.get("power_multiply_by", 1.0) != 1.0:
        df[resolved["power"]] = df[resolved["power"]] * conversions["power_multiply_by"]

    if resolved.get("load") and conversions.get("load_multiply_by", 1.0) != 1.0:
        df[resolved["load"]] = df[resolved["load"]] * conversions["load_multiply_by"]

    if resolved.get("return_temp") and conversions.get("temp_offset", 0.0) != 0.0:
        df[resolved["return_temp"]] = df[resolved["return_temp"]] + conversions["temp_offset"]

    return df


# ============================================================
# STEP 4: FILTER TO AHU-ON PERIODS (fixed logic)
# ============================================================
def filter_active(df, resolved, schema):
    """Filter to AHU operating periods."""
    filters = schema.get("filters", {})

    # Filter specific AHU if multiple
    if filters.get("multiple_ahus") and filters.get("ahu_filter_column"):
        col = filters["ahu_filter_column"]
        val = filters["ahu_filter_value"]
        if col in df.columns:
            df = df[df[col] == val].copy()

    # Filter to AHU-on
    if resolved.get("status") and resolved["status"] in df.columns:
        df = df[df[resolved["status"]] == 1].copy()
    elif resolved.get("power"):
        df = df[df[resolved["power"]] > 0].copy()

    return df


# ============================================================
# STEP 5: SPLIT BEFORE/AFTER (adapts to schema method)
# ============================================================
def split_periods(df, resolved, schema):
    """Split data into before and after periods."""
    split = schema.get("period_split", {})
    method = split.get("method")

    if method == "column" and split.get("column"):
        col = split["column"]
        if col not in df.columns:
            # Try case-insensitive
            lower_map = {c.lower(): c for c in df.columns}
            col = lower_map.get(col.lower(), col)

        before_val = split.get("before_value")
        after_val = split.get("after_value")

        before = df[df[col].astype(str).str.lower().str.contains(str(before_val).lower())]
        after = df[df[col].astype(str).str.lower().str.contains(str(after_val).lower())]

    elif method == "date_range" and resolved.get("timestamp"):
        ts_col = resolved["timestamp"]
        df[ts_col] = pd.to_datetime(df[ts_col], errors='coerce')

        before_start = pd.to_datetime(split.get("before_date_start"))
        before_end = pd.to_datetime(split.get("before_date_end"))
        after_start = pd.to_datetime(split.get("after_date_start"))
        after_end = pd.to_datetime(split.get("after_date_end"))

        before = df[(df[ts_col] >= before_start) & (df[ts_col] <= before_end)]
        after = df[(df[ts_col] >= after_start) & (df[ts_col] <= after_end)]

    else:
        # Fallback: try to auto-detect from column values
        # Look for any column with before/after-like values
        for col in df.columns:
            unique = df[col].dropna().unique()
            if len(unique) == 2:
                str_vals = [str(v).lower() for v in unique]
                if any('before' in s or 'baseline' in s or 'bms' in s for s in str_vals):
                    before_val = [v for v in unique if 'before' in str(v).lower() or 'baseline' in str(v).lower() or 'bms' in str(v).lower()][0]
                    after_val = [v for v in unique if v != before_val][0]
                    before = df[df[col] == before_val]
                    after = df[df[col] == after_val]
                    return before, after, {"method": "auto_detected", "column": col}

        # Last resort: split in half by index
        mid = len(df) // 2
        before = df.iloc[:mid]
        after = df.iloc[mid:]
        return before, after, {"method": "index_split", "note": "No period column found, split by row index"}

    return before, after, {"method": method}


# ============================================================
# STEP 6: COMPUTE KPIs (FIXED MATH — cannot be changed)
# ============================================================
def compute_kpis(before, after, resolved, schema):
    """
    FIXED FORMULAS. The LLM cannot modify these.

    Efficiency = Power / Load
    Saving % = (Before - After) / Before × 100
    Meets SLE = Efficiency <= 0.14 kW/RT
    Annual saving = daily_saving × 365
    """
    power_col = resolved.get("power")
    load_col = resolved.get("load")
    temp_col = resolved.get("return_temp")
    rh_col = resolved.get("return_rh")
    ts_col = resolved.get("timestamp")

    kpis = {}
    missing = []
    notes = {}

    # --- POWER (required) ---
    if not power_col or power_col not in before.columns:
        return {"error": "Power column not found or not mapped", "kpis": None}

    avg_power_before = float(before[power_col].mean())
    avg_power_after = float(after[power_col].mean())
    peak_power_before = float(before[power_col].max())
    peak_power_after = float(after[power_col].max())

    # Detect interval
    interval_hours = 5 / 60  # default 5-min
    if ts_col and ts_col in before.columns:
        ts = pd.to_datetime(before[ts_col], errors='coerce').dropna()
        if len(ts) > 1:
            gap = ts.diff().median().total_seconds() / 3600
            if gap > 0:
                interval_hours = gap

    total_energy_before = float(before[power_col].sum() * interval_hours)
    total_energy_after = float(after[power_col].sum() * interval_hours)
    operating_hours_before = len(before) * interval_hours
    operating_hours_after = len(after) * interval_hours

    # FIXED FORMULA: saving
    saving_pct = (avg_power_before - avg_power_after) / avg_power_before * 100 if avg_power_before > 0 else 0
    saving_kwh = total_energy_before - total_energy_after

    kpis["avg_power_before_kW"] = round(avg_power_before, 3)
    kpis["avg_power_after_kW"] = round(avg_power_after, 3)
    kpis["peak_power_before_kW"] = round(peak_power_before, 3)
    kpis["peak_power_after_kW"] = round(peak_power_after, 3)
    kpis["total_energy_before_kWh"] = round(total_energy_before, 1)
    kpis["total_energy_after_kWh"] = round(total_energy_after, 1)
    kpis["saving_pct"] = round(saving_pct, 1)
    kpis["saving_kWh"] = round(saving_kwh, 1)
    kpis["operating_hours_before"] = round(operating_hours_before, 1)
    kpis["operating_hours_after"] = round(operating_hours_after, 1)
    kpis["interval_minutes"] = round(interval_hours * 60, 1)

    # --- EFFICIENCY (only if load available) ---
    if load_col and load_col in before.columns:
        avg_load = float(pd.concat([before[load_col], after[load_col]]).mean())
        if avg_load > 0:
            eff_before = avg_power_before / avg_load
            eff_after = avg_power_after / avg_load
            total_eff_after = PLANTROOM_ASSUMED_KW_PER_RT + eff_after

            # FIXED FORMULA: meets target
            meets_sle = eff_after <= TARGET_AIRSIDE_KW_PER_RT
            meets_platinum = total_eff_after <= TARGET_TOTAL_KW_PER_RT

            kpis["avg_cooling_load_RT"] = round(avg_load, 2)
            kpis["airside_eff_before_kW_per_RT"] = round(eff_before, 4)
            kpis["airside_eff_after_kW_per_RT"] = round(eff_after, 4)
            kpis["total_system_eff_after_kW_per_RT"] = round(total_eff_after, 4)
            kpis["meets_sle_airside"] = meets_sle
            kpis["meets_platinum_total"] = meets_platinum
        else:
            kpis["airside_eff_after_kW_per_RT"] = None
            kpis["meets_sle_airside"] = None
            notes["efficiency"] = "Cooling load is zero or invalid"
            missing.append("valid_cooling_load")
    else:
        kpis["avg_cooling_load_RT"] = None
        kpis["airside_eff_before_kW_per_RT"] = None
        kpis["airside_eff_after_kW_per_RT"] = None
        kpis["total_system_eff_after_kW_per_RT"] = None
        kpis["meets_sle_airside"] = None
        kpis["meets_platinum_total"] = None
        notes["efficiency"] = "Cooling load column not available. Cannot compute kW/RT."
        missing.append("cooling_load")

    # --- COMFORT (only if temp/rh available) ---
    comfort_ok = None
    if temp_col and temp_col in after.columns:
        avg_temp = float(after[temp_col].dropna().mean())
        kpis["avg_return_temp_C"] = round(avg_temp, 1)
        comfort_ok = COMFORT_TEMP_MIN <= avg_temp <= COMFORT_TEMP_MAX
        if not comfort_ok:
            notes["comfort_temp"] = f"Return air {avg_temp:.1f}°C outside {COMFORT_TEMP_MIN}-{COMFORT_TEMP_MAX}°C range"
    else:
        kpis["avg_return_temp_C"] = None
        missing.append("return_air_temp")

    if rh_col and rh_col in after.columns:
        avg_rh = float(after[rh_col].dropna().mean())
        kpis["avg_return_rh_pct"] = round(avg_rh, 1)
        if avg_rh > COMFORT_RH_MAX:
            comfort_ok = False
            notes["comfort_rh"] = f"Return air RH {avg_rh:.1f}% exceeds {COMFORT_RH_MAX}% limit"
    else:
        kpis["avg_return_rh_pct"] = None
        missing.append("return_air_rh")

    kpis["comfort_ok"] = comfort_ok

    # --- STATISTICAL SIGNIFICANCE (fixed: Welch's t-test) ---
    before_power = before[power_col].dropna()
    after_power = after[power_col].dropna()
    if len(before_power) > 1 and len(after_power) > 1:
        t_stat, p_value = stats.ttest_ind(before_power, after_power, equal_var=False)
        kpis["t_statistic"] = round(float(t_stat), 2)
        kpis["p_value"] = round(float(p_value), 6)
        kpis["saving_statistically_significant"] = p_value < 0.05
    else:
        kpis["t_statistic"] = None
        kpis["p_value"] = None
        kpis["saving_statistically_significant"] = None
        notes["statistics"] = "Insufficient data points for t-test"

    # --- FINANCIAL PROJECTION (fixed formulas) ---
    hours_per_day = operating_hours_before / (len(before) * interval_hours / (len(before) * interval_hours)) if operating_hours_before > 0 else 12
    # Estimate from data: operating hours / days
    days_in_period = operating_hours_before / 12 if operating_hours_before > 0 else 14
    daily_saving_kwh = saving_kwh / max(days_in_period, 1)
    annual_saving_kwh = daily_saving_kwh * 365
    annual_saving_sgd = annual_saving_kwh * TARIFF_SGD_PER_KWH

    kpis["annual_saving_kWh"] = round(annual_saving_kwh, 0)
    kpis["annual_saving_sgd"] = round(annual_saving_sgd, 0)
    kpis["per_ahu_annual_sgd"] = round(annual_saving_sgd, 0)
    kpis["building_40_ahus_annual_sgd"] = round(annual_saving_sgd * 40, 0)
    kpis["ten_year_40_ahus_sgd"] = round(annual_saving_sgd * 40 * 10, 0)
    kpis["tariff_sgd_per_kWh"] = TARIFF_SGD_PER_KWH

    # --- TARGETS (fixed reference values) ---
    kpis["target_airside_kW_per_RT"] = TARGET_AIRSIDE_KW_PER_RT
    kpis["target_total_kW_per_RT"] = TARGET_TOTAL_KW_PER_RT
    kpis["plantroom_assumed_kW_per_RT"] = PLANTROOM_ASSUMED_KW_PER_RT

    # --- METADATA ---
    kpis["_missing"] = missing
    kpis["_notes"] = notes
    kpis["_confidence"] = "full" if not missing else "partial"
    kpis["_rows_before"] = len(before)
    kpis["_rows_after"] = len(after)

    return {"error": None, "kpis": kpis}


# ============================================================
# STEP 7: CHART SERIES (downsampled for dashboard rendering)
# ============================================================
def compute_series(before, after, resolved):
    """Produce downsampled chart data. Fixed logic."""
    power_col = resolved.get("power")
    ts_col = resolved.get("timestamp")
    series = {}

    if not power_col:
        return series

    for label, data in [("before", before), ("after", after)]:
        if ts_col and ts_col in data.columns:
            ts_data = data[[ts_col, power_col]].copy()
            ts_data[ts_col] = pd.to_datetime(ts_data[ts_col], errors='coerce')
            ts_data = ts_data.dropna()
            # Resample to hourly
            hourly = ts_data.set_index(ts_col).resample('1h').mean().dropna().reset_index()
            # Downsample to max 200 points
            step = max(1, len(hourly) // 200)
            sampled = hourly.iloc[::step]
            series[f"power_{label}_hourly"] = {
                "timestamps": sampled[ts_col].dt.strftime('%Y-%m-%d %H:%M').tolist(),
                "values": [round(v, 2) for v in sampled[power_col].tolist()]
            }
        else:
            # No timestamps — just provide distribution
            vals = data[power_col].dropna().tolist()
            step = max(1, len(vals) // 100)
            series[f"power_{label}_values"] = [round(v, 2) for v in vals[::step]]

    return series


# ============================================================
# MAIN: Load schema → Execute template → Output kpis.json
# ============================================================
def auto_fill_schema(df):
    """Heuristic auto-fill when no schema.json provided by LLM."""
    schema = {
        "file_info": {"data_start_row": 0},
        "columns": {},
        "period_split": {},
        "filters": {},
        "unit_conversions": {"power_multiply_by": 1.0, "load_multiply_by": 1.0, "temp_offset": 0.0}
    }

    # Auto-detect columns by common naming patterns
    col_lower_map = {col.lower().replace(' ', '_').replace('(', '').replace(')', ''): col for col in df.columns}

    power_patterns = ['ahu_power_kw', 'ahu_power', 'fan_power_kw', 'fan_power', 'power_kw', 'motor_power']
    load_patterns = ['cooling_load_rt', 'cooling_load', 'load_rt', 'chilled_load']
    temp_patterns = ['return_air_temp_c', 'return_air_temp', 'rat', 'return_temp', 'room_temp']
    rh_patterns = ['return_air_rh_pct', 'return_air_rh', 'return_rh', 'rah', 'room_rh']
    ts_patterns = ['timestamp', 'datetime', 'date_time', 'time', 'date']
    status_patterns = ['ahu_status', 'status', 'on_off', 'running']
    period_patterns = ['period', 'scenario', 'phase', 'mode', 'condition']
    airflow_patterns = ['airflow_cmh', 'airflow', 'air_flow', 'supply_air_flow']
    fan_patterns = ['fan_speed_pct', 'fan_speed', 'vsd_speed', 'vsd_feedback']

    def find_match(patterns):
        for p in patterns:
            if p in col_lower_map:
                return col_lower_map[p]
        return None

    schema["columns"] = {
        "power": {"column": find_match(power_patterns), "required": True},
        "load": {"column": find_match(load_patterns), "required": False},
        "timestamp": {"column": find_match(ts_patterns), "required": False},
        "return_temp": {"column": find_match(temp_patterns), "required": False},
        "return_rh": {"column": find_match(rh_patterns), "required": False},
        "airflow": {"column": find_match(airflow_patterns), "required": False},
        "fan_speed": {"column": find_match(fan_patterns), "required": False},
        "status": {"column": find_match(status_patterns), "required": False},
    }

    # Auto-detect period split
    period_col = find_match(period_patterns)
    if period_col:
        unique = df[period_col].dropna().unique()
        before_val = next((v for v in unique if 'before' in str(v).lower() or 'baseline' in str(v).lower() or 'bms' in str(v).lower()), None)
        after_val = next((v for v in unique if 'after' in str(v).lower() or 'optim' in str(v).lower() or 'mpc' in str(v).lower()), None)
        if before_val and after_val:
            schema["period_split"] = {"method": "column", "column": period_col, "before_value": str(before_val), "after_value": str(after_val)}

    return schema


def main():
    if len(sys.argv) < 2:
        print("Usage: python template_task2.py <dataset> [schema.json]")
        sys.exit(1)

    filepath = sys.argv[1]
    schema_path = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"[template_task2] Loading: {filepath}")

    # Load schema (LLM-provided or auto-detect)
    if schema_path:
        with open(schema_path) as f:
            schema = json.load(f)
        print(f"[template_task2] Schema: {schema_path} (LLM-provided)")
    else:
        # Auto-detect mode
        df_peek = pd.read_csv(filepath, nrows=5) if filepath.endswith('.csv') else pd.read_excel(filepath, nrows=5)
        schema = auto_fill_schema(df_peek)
        print(f"[template_task2] Schema: auto-detected")

    # STEP 1: Load
    df = load_data(filepath, schema)
    print(f"[template_task2] Loaded: {len(df)} rows, {len(df.columns)} columns")

    # STEP 2: Resolve columns
    resolved = resolve_columns(df, schema)
    print(f"[template_task2] Resolved columns: {json.dumps({k:v for k,v in resolved.items() if v}, indent=2)}")
    print(f"[template_task2] Missing columns: {[k for k,v in resolved.items() if not v]}")

    # STEP 3: Unit conversions
    df = apply_conversions(df, resolved, schema)

    # STEP 4: Filter to active
    df_active = filter_active(df, resolved, schema)
    print(f"[template_task2] Active rows: {len(df_active)}")

    # STEP 5: Split periods
    before, after, split_info = split_periods(df_active, resolved, schema)
    print(f"[template_task2] Split: {len(before)} before, {len(after)} after ({split_info.get('method', 'unknown')})")

    if len(before) == 0 or len(after) == 0:
        print("[template_task2] ERROR: Cannot split into before/after periods")
        error_result = {
            "task": "task2",
            "error": "Cannot identify before/after periods in dataset",
            "kpis": None,
            "_schema_used": schema
        }
        with open("kpis.json", "w") as f:
            json.dump(error_result, f, indent=2)
        sys.exit(1)

    # STEP 6: Compute KPIs (FIXED MATH)
    result = compute_kpis(before, after, resolved, schema)

    if result["error"]:
        print(f"[template_task2] ERROR: {result['error']}")
        with open("kpis.json", "w") as f:
            json.dump({"task": "task2", "error": result["error"], "kpis": None}, f, indent=2)
        sys.exit(1)

    kpis = result["kpis"]

    # STEP 7: Chart series
    series = compute_series(before, after, resolved)

    # Build final output
    output = {
        "task": "task2",
        "error": None,
        "kpis": kpis,
        "series": series,
        "_schema_used": schema,
        "_split_info": split_info,
    }

    # Write outputs
    with open("kpis.json", "w") as f:
        json.dump(output, f, indent=2, default=str)
    print("[template_task2] Written: kpis.json")

    # Write cleaned data
    df_active.to_csv("cleaned_data.csv", index=False)
    print("[template_task2] Written: cleaned_data.csv")

    # Print summary
    print(f"\n{'='*60}")
    print(f"TASK 2 RESULTS")
    print(f"{'='*60}")
    print(f"Power: {kpis['avg_power_before_kW']} kW → {kpis['avg_power_after_kW']} kW")
    print(f"Saving: {kpis['saving_pct']}%")
    if kpis.get('airside_eff_after_kW_per_RT'):
        print(f"Airside Efficiency: {kpis['airside_eff_after_kW_per_RT']} kW/RT (target ≤{TARGET_AIRSIDE_KW_PER_RT})")
        print(f"Meets SLE: {'YES' if kpis['meets_sle_airside'] else 'NO'}")
    else:
        print(f"Airside Efficiency: CANNOT COMPUTE (cooling load missing)")
    if kpis.get('comfort_ok') is not None:
        print(f"Comfort: {'OK' if kpis['comfort_ok'] else 'ISSUE'}")
    print(f"Confidence: {kpis['_confidence']}")
    if kpis['_missing']:
        print(f"Missing data: {', '.join(kpis['_missing'])}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
