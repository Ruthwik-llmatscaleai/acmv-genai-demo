#!/usr/bin/env python3
"""
generate_dashboard.py — Plug kpis.json into the HTML dashboard template.

Output: dashboard.html (self-contained, renders in sandboxed iframe)
Zero LLM tokens. Just string replacement.

Usage: python generate_dashboard.py <kpis.json> [output.html]
"""

import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_dashboard.py <kpis.json> [output.html]")
        sys.exit(1)

    kpis_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "dashboard.html"

    with open(kpis_path) as f:
        kpis_data = json.load(f)

    # Load HTML template (same directory as this script)
    template_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(template_dir, "dashboard_template.html")

    with open(template_path) as f:
        html = f.read()

    # Inject kpis.json data into the template
    kpis_json_str = json.dumps(kpis_data, indent=2, default=str)
    html = html.replace("__KPIS_JSON__", kpis_json_str)

    with open(output_path, "w") as f:
        f.write(html)

    print(f"[generate_dashboard] Written: {output_path}")


if __name__ == '__main__':
    main()
