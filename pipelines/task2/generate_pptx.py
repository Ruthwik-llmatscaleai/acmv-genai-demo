#!/usr/bin/env python3
"""
generate_pptx.py — Deterministic PPTX generator for Task 2

Takes kpis.json → produces a ready-to-submit presentation.
Fixed slide layout. Fixed formatting. Zero LLM tokens.

Usage: python generate_pptx.py <kpis.json> [output.pptx]
"""

import sys
import json
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.chart import XL_CHART_TYPE
from pptx.chart.data import CategoryChartData


# ============================================================
# SLIDE TEMPLATES (fixed structure)
# ============================================================

def add_title_slide(prs, kpis):
    """Slide 1: Title"""
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = "AHU Airside Optimization\nBCA Super Low Energy Analysis"
    slide.placeholders[1].text = (
        f"Task 2 — AI-Assisted ACMV Analysis\n"
        f"Dataset: {kpis.get('_rows_before', 0) + kpis.get('_rows_after', 0)} data points\n"
        f"Confidence: {kpis.get('_confidence', 'unknown')}"
    )


def add_objective_slide(prs):
    """Slide 2: Objective"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Objective"
    body = slide.placeholders[1]
    tf = body.text_frame
    tf.text = "Determine whether AHU airside optimization can help the building meet the BCA Super Low Energy (SLE) target."
    p = tf.add_paragraph()
    p.text = ""
    for line in [
        "Compare AHU power consumption before and after optimization",
        "Calculate energy saving and airside efficiency (kW/RT)",
        "Verify against BCA targets: airside ≤0.14 kW/RT, total ≤0.74 kW/RT",
        "Check thermal comfort is maintained",
        "Quantify annual cost savings",
    ]:
        p = tf.add_paragraph()
        p.text = line
        p.level = 1


def add_dataset_slide(prs, kpis):
    """Slide 3: Dataset Description"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Dataset Description"
    body = slide.placeholders[1]
    tf = body.text_frame
    tf.text = "AHU/ACMV airside operating dataset — before and after optimization"

    details = [
        f"Data points: {kpis.get('_rows_before', '?')} (before) + {kpis.get('_rows_after', '?')} (after)",
        f"Sampling interval: {kpis.get('interval_minutes', '?')} minutes",
        f"Operating hours: {kpis.get('operating_hours_before', '?')} hrs (before), {kpis.get('operating_hours_after', '?')} hrs (after)",
    ]

    missing = kpis.get('_missing', [])
    if missing:
        details.append(f"Missing data: {', '.join(missing)}")

    for line in details:
        p = tf.add_paragraph()
        p.text = line
        p.level = 1


def add_comparison_slide(prs, kpis):
    """Slide 4: Before vs After Comparison"""
    slide = prs.slides.add_slide(prs.slide_layouts[5])  # Blank layout

    # Title
    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.8))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    p.text = "Before vs After Optimization"
    p.font.size = Pt(24)
    p.font.bold = True

    # Chart: bar comparison
    chart_data = CategoryChartData()
    chart_data.categories = ['Avg Power (kW)', 'Peak Power (kW)']
    chart_data.add_series('Before', (kpis['avg_power_before_kW'], kpis['peak_power_before_kW']))
    chart_data.add_series('After', (kpis['avg_power_after_kW'], kpis['peak_power_after_kW']))

    chart = slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        Inches(0.5), Inches(1.2), Inches(5), Inches(4),
        chart_data
    ).chart

    chart.has_legend = True
    plot = chart.plots[0]
    plot.series[0].format.fill.solid()
    plot.series[0].format.fill.fore_color.rgb = RGBColor(0xEF, 0x44, 0x44)
    plot.series[1].format.fill.solid()
    plot.series[1].format.fill.fore_color.rgb = RGBColor(0x22, 0xC5, 0x5E)

    # Summary box
    txBox2 = slide.shapes.add_textbox(Inches(5.8), Inches(1.5), Inches(4), Inches(3.5))
    tf2 = txBox2.text_frame
    tf2.word_wrap = True

    lines = [
        f"Average Power:",
        f"  Before: {kpis['avg_power_before_kW']} kW",
        f"  After: {kpis['avg_power_after_kW']} kW",
        f"",
        f"Peak Power:",
        f"  Before: {kpis['peak_power_before_kW']} kW",
        f"  After: {kpis['peak_power_after_kW']} kW",
        f"",
        f"Energy Saving: {kpis['saving_pct']}%",
    ]
    for i, line in enumerate(lines):
        if i == 0:
            tf2.paragraphs[0].text = line
            tf2.paragraphs[0].font.size = Pt(14)
        else:
            p = tf2.add_paragraph()
            p.text = line
            p.font.size = Pt(14)


def add_energy_saving_slide(prs, kpis):
    """Slide 5: Energy Saving Calculation"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Energy Saving"
    body = slide.placeholders[1]
    tf = body.text_frame

    tf.text = f"Total Energy Saving: {kpis['saving_pct']}%"
    tf.paragraphs[0].font.size = Pt(20)
    tf.paragraphs[0].font.bold = True

    lines = [
        "",
        f"Formula: (Before Energy − After Energy) ÷ Before Energy × 100",
        f"",
        f"Total energy before: {kpis['total_energy_before_kWh']} kWh",
        f"Total energy after: {kpis['total_energy_after_kWh']} kWh",
        f"Energy saved: {kpis['saving_kWh']} kWh",
        f"",
        f"Saving: ({kpis['total_energy_before_kWh']} − {kpis['total_energy_after_kWh']}) ÷ {kpis['total_energy_before_kWh']} × 100 = {kpis['saving_pct']}%",
    ]

    if kpis.get('saving_statistically_significant') is not None:
        lines.append(f"")
        sig = "Statistically significant" if kpis['saving_statistically_significant'] else "Not statistically significant"
        lines.append(f"{sig} (p={kpis['p_value']}, Welch's t-test)")

    for line in lines:
        p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(14)


def add_efficiency_slide(prs, kpis):
    """Slide 6: Airside Efficiency"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Airside Efficiency (kW/RT)"
    body = slide.placeholders[1]
    tf = body.text_frame

    if kpis.get('airside_eff_after_kW_per_RT') is not None:
        meets = "✓ MEETS TARGET" if kpis['meets_sle_airside'] else "✗ DOES NOT MEET TARGET"
        tf.text = f"After Optimization: {kpis['airside_eff_after_kW_per_RT']} kW/RT — {meets}"
        tf.paragraphs[0].font.size = Pt(18)
        tf.paragraphs[0].font.bold = True

        lines = [
            "",
            f"Formula: Airside Efficiency = AHU Power (kW) ÷ Cooling Load (RT)",
            f"",
            f"Before: {kpis['airside_eff_before_kW_per_RT']} kW/RT",
            f"After: {kpis['airside_eff_after_kW_per_RT']} kW/RT",
            f"Target (airside): ≤{kpis['target_airside_kW_per_RT']} kW/RT",
            f"",
            f"Total System Efficiency:",
            f"  Plantroom (assumed): {kpis['plantroom_assumed_kW_per_RT']} kW/RT",
            f"  Airside (after): {kpis['airside_eff_after_kW_per_RT']} kW/RT",
            f"  Total: {kpis['total_system_eff_after_kW_per_RT']} kW/RT (target ≤{kpis['target_total_kW_per_RT']})",
        ]
    else:
        tf.text = "Airside efficiency cannot be computed — cooling load data not available"
        tf.paragraphs[0].font.size = Pt(18)
        lines = [
            "",
            "To compute kW/RT, cooling load in RT (refrigeration tons) is required.",
            "The uploaded dataset does not contain this column.",
            "",
            f"However, power reduction is confirmed: {kpis['saving_pct']}%",
        ]

    for line in lines:
        p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(14)


def add_comfort_slide(prs, kpis):
    """Slide 7: Comfort / Operational Impact"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Comfort & Operational Impact"
    body = slide.placeholders[1]
    tf = body.text_frame

    if kpis.get('comfort_ok') is not None:
        status = "✓ Comfort Maintained" if kpis['comfort_ok'] else "✗ Comfort Issue Detected"
        tf.text = status
        tf.paragraphs[0].font.size = Pt(20)
        tf.paragraphs[0].font.bold = True

        lines = []
        if kpis.get('avg_return_temp_C') is not None:
            lines.append(f"Return Air Temperature: {kpis['avg_return_temp_C']}°C (target: 22–24.5°C)")
        if kpis.get('avg_return_rh_pct') is not None:
            lines.append(f"Return Air RH: {kpis['avg_return_rh_pct']}% (target: ≤75%)")
        lines.append("")
        lines.append("Optimization that degrades comfort does not pass.")
    else:
        tf.text = "Comfort data not available"
        tf.paragraphs[0].font.size = Pt(20)
        lines = [
            "",
            "Return air temperature and/or RH data not found in dataset.",
            "Cannot verify comfort compliance.",
        ]

    for line in lines:
        p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(14)


def add_financial_slide(prs, kpis):
    """Slide 8: Cost Savings Projection"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Estimated Cost Savings"
    body = slide.placeholders[1]
    tf = body.text_frame

    tf.text = f"Annual Saving per AHU: S${int(kpis['annual_saving_sgd']):,}"
    tf.paragraphs[0].font.size = Pt(22)
    tf.paragraphs[0].font.bold = True

    lines = [
        "",
        f"Calculation:",
        f"  Power saved: {kpis['avg_power_before_kW'] - kpis['avg_power_after_kW']:.2f} kW average",
        f"  Operating hours: ~12 hrs/day × 365 days = 4,380 hrs/year",
        f"  Energy saved: {int(kpis['annual_saving_kWh']):,} kWh/year",
        f"  Tariff: S${kpis['tariff_sgd_per_kWh']}/kWh",
        f"  Annual saving: S${int(kpis['annual_saving_sgd']):,} per AHU",
        f"",
        f"Scaling (20-storey building, 2 AHUs/floor = 40 AHUs):",
        f"  Per year: S${int(kpis['building_40_ahus_annual_sgd']):,}",
        f"  Over 10 years: S${int(kpis['ten_year_40_ahus_sgd']):,}",
    ]

    for line in lines:
        p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(14)


def add_conclusion_slide(prs, kpis):
    """Slide 9: Conclusion & Recommendation"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Conclusion"
    body = slide.placeholders[1]
    tf = body.text_frame

    if kpis.get('_confidence') == 'full' and kpis.get('meets_sle_airside'):
        tf.text = "✓ Airside optimization CAN help meet the BCA SLE target"
        tf.paragraphs[0].font.size = Pt(20)
        tf.paragraphs[0].font.bold = True
        tf.paragraphs[0].font.color.rgb = RGBColor(0x16, 0xA3, 0x4A)

        findings = [
            f"Energy saving: {kpis['saving_pct']}% reduction in AHU power",
            f"Airside efficiency: {kpis['airside_eff_after_kW_per_RT']} kW/RT (target ≤0.14)",
            f"Total system: {kpis['total_system_eff_after_kW_per_RT']} kW/RT (target ≤0.74)",
            f"Comfort: maintained within acceptable range",
            f"Annual saving: S${int(kpis['annual_saving_sgd']):,} per AHU",
        ]
    elif kpis.get('_confidence') == 'full' and not kpis.get('meets_sle_airside'):
        tf.text = "✗ Airside optimization alone does NOT meet the BCA SLE target"
        tf.paragraphs[0].font.size = Pt(20)
        tf.paragraphs[0].font.bold = True
        tf.paragraphs[0].font.color.rgb = RGBColor(0xDC, 0x26, 0x26)

        findings = [
            f"Energy saving achieved: {kpis['saving_pct']}%",
            f"But airside efficiency: {kpis['airside_eff_after_kW_per_RT']} kW/RT (target ≤0.14)",
            f"Further optimization or equipment upgrade required",
        ]
    else:
        tf.text = "Partial Analysis — Key Data Missing"
        tf.paragraphs[0].font.size = Pt(20)
        tf.paragraphs[0].font.bold = True

        findings = [
            f"Energy saving confirmed: {kpis['saving_pct']}%",
            f"Missing data: {', '.join(kpis.get('_missing', []))}",
            f"Cannot fully verify BCA SLE compliance without cooling load (RT)",
            f"Recommendation: obtain cooling load data for complete assessment",
        ]

    p = tf.add_paragraph()
    p.text = ""
    p = tf.add_paragraph()
    p.text = "Key Findings:"
    p.font.bold = True
    p.font.size = Pt(16)

    for finding in findings:
        p = tf.add_paragraph()
        p.text = f"• {finding}"
        p.font.size = Pt(14)
        p.level = 1


def add_question_slide(prs, kpis):
    """Slide 10: Main Question Answer"""
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Main Question"
    body = slide.placeholders[1]
    tf = body.text_frame

    tf.text = "Can AI-assisted airside optimisation reduce AHU energy consumption and help the building achieve the BCA Super Low Energy ACMV efficiency target?"
    tf.paragraphs[0].font.italic = True
    tf.paragraphs[0].font.size = Pt(16)

    p = tf.add_paragraph()
    p.text = ""
    p = tf.add_paragraph()
    p.text = "Answer:"
    p.font.bold = True
    p.font.size = Pt(18)

    p = tf.add_paragraph()
    if kpis.get('meets_sle_airside'):
        p.text = f"YES — Airside optimization reduced AHU power by {kpis['saving_pct']}% and achieved {kpis['airside_eff_after_kW_per_RT']} kW/RT efficiency, meeting the ≤0.14 kW/RT target without compromising comfort."
        p.font.color.rgb = RGBColor(0x16, 0xA3, 0x4A)
    elif kpis.get('meets_sle_airside') is False:
        p.text = f"NOT YET — While optimization saved {kpis['saving_pct']}%, efficiency of {kpis['airside_eff_after_kW_per_RT']} kW/RT still exceeds the 0.14 kW/RT target."
        p.font.color.rgb = RGBColor(0xDC, 0x26, 0x26)
    else:
        p.text = f"PARTIALLY — Energy saving of {kpis['saving_pct']}% confirmed, but cooling load data needed to verify kW/RT target."
        p.font.color.rgb = RGBColor(0xD9, 0x77, 0x06)
    p.font.size = Pt(14)


# ============================================================
# MAIN
# ============================================================
def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_pptx.py <kpis.json> [output.pptx]")
        sys.exit(1)

    kpis_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "Task2_Airside_Optimization_Presentation.pptx"

    with open(kpis_path) as f:
        data = json.load(f)

    kpis = data.get("kpis")
    if not kpis:
        print(f"Error: No KPIs found in {kpis_path}")
        sys.exit(1)

    print(f"[generate_pptx] Generating presentation from {kpis_path}")

    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)

    # Build all slides (fixed order, fixed structure)
    add_title_slide(prs, kpis)
    add_objective_slide(prs)
    add_dataset_slide(prs, kpis)
    add_comparison_slide(prs, kpis)
    add_energy_saving_slide(prs, kpis)
    add_efficiency_slide(prs, kpis)
    add_comfort_slide(prs, kpis)
    add_financial_slide(prs, kpis)
    add_conclusion_slide(prs, kpis)
    add_question_slide(prs, kpis)

    prs.save(output_path)
    print(f"[generate_pptx] Written: {output_path} ({len(prs.slides)} slides)")


if __name__ == '__main__':
    main()
