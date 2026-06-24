#!/usr/bin/env python3
"""
render_view.py — Takes a view JSON (filled by LLM) and renders it into HTML/PPTX/PDF.

The view JSON controls WHAT to show (content, emphasis, narrative).
The renderer controls HOW to show it (layout, colors, typography).

Usage:
  python render_view.py <view.json> --html [output.html]
  python render_view.py <view.json> --pptx [output.pptx]

The LLM produces view.json. This script produces the deliverable.
"""

import sys
import json
import os
import argparse


def render_html(view, output_path):
    """Render view JSON into self-contained HTML dashboard."""
    template_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(template_dir, "renderer.html")

    with open(template_path) as f:
        html = f.read()

    view_json_str = json.dumps(view, indent=2, default=str)
    html = html.replace("__VIEW_JSON__", view_json_str)

    with open(output_path, "w") as f:
        f.write(html)

    print(f"[render_view] HTML written: {output_path}")


def render_pptx(view, output_path):
    """Render view JSON into PPTX presentation."""
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.chart.data import CategoryChartData

    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)

    slides_config = view.get("slides", [])

    for slide_cfg in slides_config:
        slide_type = slide_cfg.get("type", "content")

        if slide_type == "title":
            slide = prs.slides.add_slide(prs.slide_layouts[0])
            slide.shapes.title.text = slide_cfg.get("title", "")
            if slide.placeholders[1]:
                slide.placeholders[1].text = slide_cfg.get("subtitle", "")

        elif slide_type == "content":
            slide = prs.slides.add_slide(prs.slide_layouts[1])
            slide.shapes.title.text = slide_cfg.get("title", "")
            body = slide.placeholders[1]
            tf = body.text_frame
            bullets = slide_cfg.get("bullets", [])
            if bullets:
                tf.text = bullets[0]
                for bullet in bullets[1:]:
                    p = tf.add_paragraph()
                    p.text = bullet
                    p.level = slide_cfg.get("bullet_level", 0)

        elif slide_type == "chart":
            slide = prs.slides.add_slide(prs.slide_layouts[5])  # Blank

            # Title
            txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.8))
            tf = txBox.text_frame
            tf.paragraphs[0].text = slide_cfg.get("title", "Chart")
            tf.paragraphs[0].font.size = Pt(24)
            tf.paragraphs[0].font.bold = True

            chart_data_cfg = slide_cfg.get("chart_data", {})
            categories = chart_data_cfg.get("categories", [])
            series_list = chart_data_cfg.get("series", [])

            if categories and series_list:
                chart_data = CategoryChartData()
                chart_data.categories = categories
                for s in series_list:
                    chart_data.add_series(s.get("name", ""), tuple(s.get("values", [])))

                chart_type = XL_CHART_TYPE.COLUMN_CLUSTERED
                if slide_cfg.get("chart_type") == "line":
                    chart_type = XL_CHART_TYPE.LINE

                chart_shape = slide.shapes.add_chart(
                    chart_type,
                    Inches(0.5), Inches(1.2), Inches(9), Inches(5.5),
                    chart_data
                )
                chart = chart_shape.chart
                chart.has_legend = True

                # Apply colors
                for i, s in enumerate(series_list):
                    if i < len(chart.plots[0].series) and s.get("color"):
                        color_hex = s["color"].lstrip("#")
                        chart.plots[0].series[i].format.fill.solid()
                        chart.plots[0].series[i].format.fill.fore_color.rgb = RGBColor(
                            int(color_hex[0:2], 16),
                            int(color_hex[2:4], 16),
                            int(color_hex[4:6], 16)
                        )

        elif slide_type == "table":
            slide = prs.slides.add_slide(prs.slide_layouts[5])  # Blank

            txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.8))
            tf = txBox.text_frame
            tf.paragraphs[0].text = slide_cfg.get("title", "Details")
            tf.paragraphs[0].font.size = Pt(24)
            tf.paragraphs[0].font.bold = True

            headers = slide_cfg.get("headers", [])
            rows = slide_cfg.get("rows", [])
            if headers and rows:
                n_rows = len(rows) + 1
                n_cols = len(headers)
                table_shape = slide.shapes.add_table(
                    n_rows, n_cols,
                    Inches(0.5), Inches(1.3), Inches(9), Inches(0.4 * n_rows)
                )
                table = table_shape.table

                for i, h in enumerate(headers):
                    table.cell(0, i).text = str(h)
                for r_idx, row in enumerate(rows):
                    for c_idx, cell in enumerate(row):
                        table.cell(r_idx + 1, c_idx).text = str(cell if cell is not None else "N/A")

        elif slide_type == "verdict":
            slide = prs.slides.add_slide(prs.slide_layouts[1])
            slide.shapes.title.text = slide_cfg.get("title", "Conclusion")
            body = slide.placeholders[1]
            tf = body.text_frame
            tf.text = slide_cfg.get("verdict_text", "")
            tf.paragraphs[0].font.size = Pt(18)
            tf.paragraphs[0].font.bold = True

            status = slide_cfg.get("status", "neutral")
            if status == "pass":
                tf.paragraphs[0].font.color.rgb = RGBColor(0x16, 0xA3, 0x4A)
            elif status == "fail":
                tf.paragraphs[0].font.color.rgb = RGBColor(0xDC, 0x26, 0x26)

            for finding in slide_cfg.get("findings", []):
                p = tf.add_paragraph()
                p.text = f"• {finding}"
                p.font.size = Pt(14)

    prs.save(output_path)
    print(f"[render_view] PPTX written: {output_path} ({len(prs.slides)} slides)")


def main():
    parser = argparse.ArgumentParser(description="Render view JSON into deliverables")
    parser.add_argument("view_json", help="Path to view.json (LLM-filled)")
    parser.add_argument("--html", nargs="?", const="dashboard.html", help="Output HTML")
    parser.add_argument("--pptx", nargs="?", const="presentation.pptx", help="Output PPTX")
    args = parser.parse_args()

    with open(args.view_json) as f:
        view = json.load(f)

    if not args.html and not args.pptx:
        # Default: produce both
        args.html = "dashboard.html"
        args.pptx = "presentation.pptx"

    if args.html:
        render_html(view, args.html)

    if args.pptx:
        render_pptx(view, args.pptx)


if __name__ == '__main__':
    main()
