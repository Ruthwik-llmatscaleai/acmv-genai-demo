#!/usr/bin/env python3
"""
validate_kpis_schema.py — Validates kpis.json structure against expected schema

This verifies the pipeline output format is correct.
"""

import json
import sys

REQUIRED_KEYS = {
    'task',
    'dataset_info',
    'level1_raw',
    'level2_derived',
    'level3_verdicts',
    'level4_financial',
    'series'
}

REQUIRED_LEVEL1 = {
    'avg_power_before_kW',
    'avg_power_after_kW',
    'peak_power_before_kW',
    'peak_power_after_kW',
    'total_energy_before_kWh',
    'total_energy_after_kWh',
    'operating_hours_before',
    'operating_hours_after'
}

REQUIRED_LEVEL2 = {
    'saving_pct',
    'saving_kWh',
    'airside_eff_after_kW_per_RT',
    'target_airside_kW_per_RT',
    'target_total_kW_per_RT',
    'plantroom_assumed_kW_per_RT'
}

REQUIRED_LEVEL3 = {
    'meets_sle_airside',
    'meets_platinum_total',
    'comfort_ok',
    'saving_statistically_significant',
    'p_value'
}

REQUIRED_LEVEL4 = {
    'annual_saving_kWh',
    'annual_saving_sgd',
    'per_ahu_annual_sgd',
    'tariff_sgd_per_kWh'
}


def validate_kpis_json(filepath):
    """Validate kpis.json structure."""
    try:
        with open(filepath, 'r') as f:
            kpis = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: File not found: {filepath}")
        return False
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}")
        return False

    # Check top-level keys
    missing_top = REQUIRED_KEYS - set(kpis.keys())
    if missing_top:
        print(f"ERROR: Missing top-level keys: {missing_top}")
        return False

    # Check task identifier
    if kpis['task'] != 'task2':
        print(f"ERROR: Expected task='task2', got '{kpis['task']}'")
        return False

    # Check level1
    missing_l1 = REQUIRED_LEVEL1 - set(kpis['level1_raw'].keys())
    if missing_l1:
        print(f"ERROR: Missing level1_raw keys: {missing_l1}")
        return False

    # Check level2
    missing_l2 = REQUIRED_LEVEL2 - set(kpis['level2_derived'].keys())
    if missing_l2:
        print(f"ERROR: Missing level2_derived keys: {missing_l2}")
        return False

    # Check level3
    missing_l3 = REQUIRED_LEVEL3 - set(kpis['level3_verdicts'].keys())
    if missing_l3:
        print(f"ERROR: Missing level3_verdicts keys: {missing_l3}")
        return False

    # Check level4
    missing_l4 = REQUIRED_LEVEL4 - set(kpis['level4_financial'].keys())
    if missing_l4:
        print(f"ERROR: Missing level4_financial keys: {missing_l4}")
        return False

    # Verify boolean types
    if not isinstance(kpis['level3_verdicts']['meets_sle_airside'], bool):
        print("ERROR: meets_sle_airside must be boolean")
        return False

    if not isinstance(kpis['level3_verdicts']['meets_platinum_total'], bool):
        print("ERROR: meets_platinum_total must be boolean")
        return False

    print("SUCCESS: kpis.json structure is valid")
    print(f"  - Task: {kpis['task']}")
    print(f"  - Dataset: {kpis['dataset_info'].get('rows', 'N/A')} rows")
    print(f"  - Meets SLE: {kpis['level3_verdicts']['meets_sle_airside']}")
    print(f"  - Meets Platinum: {kpis['level3_verdicts']['meets_platinum_total']}")
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python validate_kpis_schema.py <kpis.json>")
        sys.exit(1)

    filepath = sys.argv[1]
    success = validate_kpis_json(filepath)
    sys.exit(0 if success else 1)
