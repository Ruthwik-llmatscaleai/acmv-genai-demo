#!/usr/bin/env python3
"""
pipeline_task2.py — Deterministic AHU Airside Optimization Analysis Pipeline

Computes all KPIs for Task 2 (BCA SLE airside optimization) and outputs:
  - kpis.json: Full metrics table (levels 0-4) + downsampled chart series
  - cleaned_data.csv: Tidy dataset with derived columns

Usage: python pipeline_task2.py <dataset.csv>

This pipeline is deterministic: same input → same output, zero LLM tokens.
"""

import sys
import json
import pandas as pd
import numpy as np
from scipy import stats

# --- Configuration (BCA targets) ---
TARGET_AIRSIDE_KW_PER_RT = 0.14
TARGET_TOTAL_KW_PER_RT = 0.74
PLANTROOM_ASSUMED_KW_PER_RT = 0.60
TARIFF_SGD_PER_KWH = 0.25
COMFORT_TEMP_MIN = 22.0
COMFORT_TEMP_MAX = 24.5
COMFORT_RH_MAX = 75.0

# --- Column mapping (handles common variants) ---
COLUMN_MAP = {
    'ahu_power_kw': ['ahu_power_kW', 'AHU_Power_kW', 'AHU_Power', 'Fan_Power_kW', 'fan_power_kw', 'power_kw'],
    'cooling_load_rt': ['cooling_load_RT', 'Cooling_Load_RT', 'Cooling_Load', 'Load_RT', 'cooling_load'],
    'period': ['period', 'Period', 'scenario', 'Scenario', 'phase', 'Phase'],
    'ahu_status': ['ahu_status', 'AHU_Status', 'status', 'on_off'],
    'return_air_temp': ['return_air_temp_C', 'Return_Air_Temp', 'RAT', 'return_temp'],
    'return_air_rh': ['return_air_rh_pct', 'Return_Air_RH', 'return_rh', 'RAH'],
    'timestamp': ['timestamp', 'Timestamp', 'datetime', 'DateTime', 'date_time', 'Time'],
    'airflow': ['airflow_CMH', 'Airflow', 'airflow_cmh', 'Air_Flow'],
    'fan_speed': ['fan_speed_pct', 'Fan_Speed', 'fan_speed'],
    'supply_temp': ['supply_air_temp_C', 'Supply_Air_Temp', 'SAT', 'supply_temp'],
}


def resolve_column(df, canonical_name):
    """Find the actual column name in df matching the canonical name."""
    candidates = COLUMN_MAP.get(canonical_name, [canonical_name])
    for c in candidates:
        if c in df.columns:
            return c
    # Try case-insensitive
    lower_map = {col.lower().replace(' ', '_'): col for col in df.columns}
    for c in candidates:
        if c.lower().replace(' ', '_') in lower_map:
            return lower_map[c.lower().replace(' ', '_')]
    return None


def load_and_clean(filepath):
    """Load dataset, resolve columns, filter to AHU-on periods."""
    df = pd.read_csv(filepath)

    # Resolve required columns
    col_power = resolve_column(df, 'ahu_power_kw')
    col_load = resolve_column(df, 'cooling_load_rt')
    col_period = resolve_column(df, 'period')
    col_status = resolve_column(df, 'ahu_status')
    col_ts = resolve_column(df, 'timestamp')
    col_rat = resolve_column(df, 'return_air_temp')
    col_rh = resolve_column(df, 'return_air_rh')
    col_airflow = resolve_column(df, 'airflow')
    col_fan = resolve_column(df, 'fan_speed')
    col_sat = resolve_column(df, 'supply_temp')

    if not col_power:
        raise ValueError("Cannot find AHU power column. Expected one of: " + str(COLUMN_MAP['ahu_power_kw']))
    if not col_period:
        raise ValueError("Cannot find period/scenario column. Expected one of: " + str(COLUMN_MAP['period']))

    # Parse timestamp
    if col_ts:
        df[col_ts] = pd.to_datetime(df[col_ts], errors='coerce')
        df = df.sort_values(col_ts).reset_index(drop=True)

    # Filter to AHU-on periods
    if col_status:
        df_on = df[df[col_status] == 1].copy()
    else:
        df_on = df[df[col_power] > 0].copy()

    # Identify before/after periods
    periods = df_on[col_period].unique()
    before_label = [p for p in periods if 'before' in str(p).lower() or 'baseline' in str(p).lower() or 'bms' in str(p).lower()]
    after_label = [p for p in periods if 'after' in str(p).lower() or 'optimiz' in str(p).lower() or 'mpc' in str(p).lower()]

    if not before_label or not after_label:
        # Assume first period is before, second is after
        before_label = [periods[0]]
        after_label = [periods[-1]] if len(periods) > 1 else [periods[0]]

    before = df_on[df_on[col_period].isin(before_label)]
    after = df_on[df_on[col_period].isin(after_label)]

    return df, df_on, before, after, {
        'power': col_power, 'load': col_load, 'period': col_period,
        'status': col_status, 'timestamp': col_ts, 'rat': col_rat,
        'rh': col_rh, 'airflow': col_airflow, 'fan': col_fan, 'sat': col_sat
    }


def compute_kpis(before, after, cols):
    """Compute all KPI levels."""
    cp = cols['power']
    cl = cols['load']

    # --- Level 1: Raw statistics ---
    avg_power_before = before[cp].mean()
    avg_power_after = after[cp].mean()
    peak_power_before = before[cp].max()
    peak_power_after = after[cp].max()

    # Estimate interval in hours (from timestamps or assume 5-min)
    interval_hours = 5 / 60  # default 5-min
    if cols['timestamp'] and cols['timestamp'] in before.columns:
        ts = pd.to_datetime(before[cols['timestamp']])
        if len(ts) > 1:
            median_gap = ts.diff().median().total_seconds() / 3600
            if median_gap > 0:
                interval_hours = median_gap

    total_energy_before = before[cp].sum() * interval_hours
    total_energy_after = after[cp].sum() * interval_hours
    operating_hours_before = len(before) * interval_hours
    operating_hours_after = len(after) * interval_hours

    avg_load = None
    if cl and cl in before.columns:
        load_all = pd.concat([before[cl], after[cl]]).dropna()
        avg_load = load_all.mean() if len(load_all) > 0 else None

    level1 = {
        'avg_power_before_kW': round(avg_power_before, 3),
        'avg_power_after_kW': round(avg_power_after, 3),
        'peak_power_before_kW': round(peak_power_before, 3),
        'peak_power_after_kW': round(peak_power_after, 3),
        'total_energy_before_kWh': round(total_energy_before, 1),
        'total_energy_after_kWh': round(total_energy_after, 1),
        'avg_cooling_load_RT': round(avg_load, 2) if avg_load else None,
        'operating_hours_before': round(operating_hours_before, 1),
        'operating_hours_after': round(operating_hours_after, 1),
        'interval_minutes': round(interval_hours * 60, 1),
    }

    # --- Level 2: Derived metrics ---
    saving_pct = (avg_power_before - avg_power_after) / avg_power_before * 100 if avg_power_before > 0 else 0
    saving_kwh = total_energy_before - total_energy_after

    eff_before = avg_power_before / avg_load if avg_load and avg_load > 0 else None
    eff_after = avg_power_after / avg_load if avg_load and avg_load > 0 else None
    total_eff_after = (PLANTROOM_ASSUMED_KW_PER_RT + eff_after) if eff_after else None

    level2 = {
        'saving_pct': round(saving_pct, 1),
        'saving_kWh': round(saving_kwh, 1),
        'airside_eff_before_kW_per_RT': round(eff_before, 4) if eff_before else None,
        'airside_eff_after_kW_per_RT': round(eff_after, 4) if eff_after else None,
        'target_airside_kW_per_RT': TARGET_AIRSIDE_KW_PER_RT,
        'target_total_kW_per_RT': TARGET_TOTAL_KW_PER_RT,
        'plantroom_assumed_kW_per_RT': PLANTROOM_ASSUMED_KW_PER_RT,
        'total_system_eff_after_kW_per_RT': round(total_eff_after, 4) if total_eff_after else None,
    }

    # --- Level 3: Verdicts ---
    meets_sle = eff_after is not None and eff_after <= TARGET_AIRSIDE_KW_PER_RT
    meets_platinum = total_eff_after is not None and total_eff_after <= TARGET_TOTAL_KW_PER_RT

    # Comfort check
    avg_rat = None
    avg_rh = None
    comfort_ok = True
    if cols['rat'] and cols['rat'] in after.columns:
        rat_data = after[cols['rat']].dropna()
        avg_rat = rat_data.mean() if len(rat_data) > 0 else None
        if avg_rat and (avg_rat < COMFORT_TEMP_MIN or avg_rat > COMFORT_TEMP_MAX):
            comfort_ok = False
    if cols['rh'] and cols['rh'] in after.columns:
        rh_data = after[cols['rh']].dropna()
        avg_rh = rh_data.mean() if len(rh_data) > 0 else None
        if avg_rh and avg_rh > COMFORT_RH_MAX:
            comfort_ok = False

    # Statistical significance (Welch's t-test)
    t_stat, p_value = stats.ttest_ind(before[cp].dropna(), after[cp].dropna(), equal_var=False)
    significant = p_value < 0.05

    level3 = {
        'meets_sle_airside': meets_sle,
        'meets_platinum_total': meets_platinum,
        'comfort_ok': comfort_ok,
        'avg_return_temp_C': round(avg_rat, 1) if avg_rat else None,
        'avg_return_rh_pct': round(avg_rh, 1) if avg_rh else None,
        'saving_statistically_significant': significant,
        'p_value': round(p_value, 6),
        't_statistic': round(t_stat, 2),
    }

    # --- Level 4: Financial projection ---
    # Annualize based on operating hours
    hours_per_year = 365 * 12  # assume 12 operating hours/day
    annual_saving_kwh = (avg_power_before - avg_power_after) * hours_per_year
    annual_saving_sgd = annual_saving_kwh * TARIFF_SGD_PER_KWH

    level4 = {
        'annual_saving_kWh': round(annual_saving_kwh, 0),
        'annual_saving_sgd': round(annual_saving_sgd, 0),
        'per_ahu_annual_sgd': round(annual_saving_sgd, 0),
        'building_20_floors_2_ahus_annual_sgd': round(annual_saving_sgd * 40, 0),
        'ten_year_sgd': round(annual_saving_sgd * 40 * 10, 0),
        'tariff_sgd_per_kWh': TARIFF_SGD_PER_KWH,
        'assumed_operating_hours_per_day': 12,
    }

    return level1, level2, level3, level4


def compute_chart_series(before, after, cols, max_points=200):
    """Downsample time-series for chart rendering."""
    cp = cols['power']
    cl = cols['load']
    ct = cols['timestamp']

    series = {}

    # Power time-series (downsample to max_points)
    for label, data in [('before', before), ('after', after)]:
        if ct and ct in data.columns:
            ts_data = data[[ct, cp]].dropna().copy()
            ts_data[ct] = pd.to_datetime(ts_data[ct])
            # Resample to hourly
            ts_data = ts_data.set_index(ct).resample('1h').mean().dropna().reset_index()
            step = max(1, len(ts_data) // max_points)
            sampled = ts_data.iloc[::step]
            series[f'power_{label}_hourly'] = {
                'timestamps': sampled[ct].dt.strftime('%Y-%m-%d %H:%M').tolist(),
                'values': sampled[cp].round(2).tolist()
            }

    # Efficiency daily (if cooling load available)
    if cl and cl in before.columns:
        for label, data in [('before', before), ('after', after)]:
            if ct and ct in data.columns:
                eff_data = data[[ct, cp, cl]].dropna().copy()
                eff_data[ct] = pd.to_datetime(eff_data[ct])
                eff_data['efficiency'] = eff_data[cp] / eff_data[cl].replace(0, np.nan)
                daily = eff_data.set_index(ct).resample('1D')['efficiency'].mean().dropna().reset_index()
                series[f'efficiency_{label}_daily'] = {
                    'timestamps': daily[ct].dt.strftime('%Y-%m-%d').tolist(),
                    'values': daily['efficiency'].round(4).tolist()
                }

    return series


def main():
    if len(sys.argv) < 2:
        print("Usage: python pipeline_task2.py <dataset.csv>")
        sys.exit(1)

    filepath = sys.argv[1]
    print(f"[pipeline_task2] Loading: {filepath}")

    # Load and clean
    df_full, df_on, before, after, cols = load_and_clean(filepath)
    print(f"[pipeline_task2] Rows: {len(df_full)} total, {len(df_on)} AHU-on, {len(before)} before, {len(after)} after")

    # Compute KPIs
    level1, level2, level3, level4 = compute_kpis(before, after, cols)

    # Compute chart data
    series = compute_chart_series(before, after, cols)

    # Dataset info
    time_range = ""
    if cols['timestamp'] and cols['timestamp'] in df_full.columns:
        ts = pd.to_datetime(df_full[cols['timestamp']].dropna())
        if len(ts) > 0:
            time_range = f"{ts.min().strftime('%Y-%m-%d')} to {ts.max().strftime('%Y-%m-%d')}"

    kpis = {
        'task': 'task2',
        'dataset_info': {
            'rows': len(df_full),
            'rows_ahu_on': len(df_on),
            'columns': len(df_full.columns),
            'time_range': time_range,
            'interval_minutes': level1['interval_minutes'],
        },
        'level1_raw': level1,
        'level2_derived': level2,
        'level3_verdicts': level3,
        'level4_financial': level4,
        'series': series,
    }

    # Write outputs
    with open('kpis.json', 'w') as f:
        json.dump(kpis, f, indent=2, default=str)
    print("[pipeline_task2] Written: kpis.json")

    # Cleaned CSV
    df_on.to_csv('cleaned_data.csv', index=False)
    print("[pipeline_task2] Written: cleaned_data.csv")

    # Print summary
    print(f"\n{'='*60}")
    print(f"TASK 2 RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"Avg Power: {level1['avg_power_before_kW']} kW (before) → {level1['avg_power_after_kW']} kW (after)")
    print(f"Saving: {level2['saving_pct']}%")
    print(f"Airside Efficiency: {level2['airside_eff_before_kW_per_RT']} → {level2['airside_eff_after_kW_per_RT']} kW/RT")
    print(f"Target: ≤{TARGET_AIRSIDE_KW_PER_RT} kW/RT")
    print(f"Meets SLE: {'YES ✓' if level3['meets_sle_airside'] else 'NO ✗'}")
    print(f"Comfort OK: {'YES ✓' if level3['comfort_ok'] else 'NO ✗'}")
    print(f"Statistically Significant: {'YES (p={:.4f})'.format(level3['p_value']) if level3['saving_statistically_significant'] else 'NO'}")
    print(f"Annual Saving (1 AHU): S${level4['annual_saving_sgd']:,.0f}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
