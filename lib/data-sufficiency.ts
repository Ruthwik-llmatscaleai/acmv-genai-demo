// Zero-token response layer: answer common questions directly from pre-computed KPIs.

export interface KPIs {
  task: string;
  level1_raw: Record<string, unknown>;
  level2_derived: Record<string, unknown>;
  level3_verdicts: Record<string, unknown>;
  level4_financial: Record<string, unknown>;
}

interface AnswerPattern {
  pattern: RegExp;
  answer: (kpis: KPIs) => string | null;
}

const PATTERNS: AnswerPattern[] = [
  {
    pattern: /meet.*SLE|SLE.*target|pass.*platinum|achieve.*sle/i,
    answer: (k) => {
      const v = k.level3_verdicts;
      const eff = k.level2_derived.airside_eff_after_kW_per_RT;
      if (v.meets_sle_airside === undefined) return null;
      return v.meets_sle_airside
        ? `**Yes** — airside efficiency after optimization is ${eff} kW/RT, below the 0.14 kW/RT SLE target. Total system efficiency is ${k.level2_derived.total_system_eff_after_kW_per_RT} kW/RT (target ≤0.74).`
        : `**No** — airside efficiency after optimization is ${eff} kW/RT, still above the 0.14 kW/RT SLE target.`;
    },
  },
  {
    pattern: /how much.*sav|energy sav|percent.*reduc|power.*reduc/i,
    answer: (k) => {
      const s = k.level2_derived;
      const l1 = k.level1_raw;
      if (s.saving_pct === undefined) return null;
      return `Energy saving: **${s.saving_pct}%** — average AHU power dropped from ${l1.avg_power_before_kW} kW to ${l1.avg_power_after_kW} kW. Total energy saved: ${s.saving_kWh} kWh over the measurement period.`;
    },
  },
  {
    pattern: /efficien|kw.*rt|kw\/rt/i,
    answer: (k) => {
      const s = k.level2_derived;
      if (!s.airside_eff_before_kW_per_RT) return null;
      return `Airside efficiency: **${s.airside_eff_before_kW_per_RT} kW/RT** (before) → **${s.airside_eff_after_kW_per_RT} kW/RT** (after). BCA SLE target: ≤0.14 kW/RT.`;
    },
  },
  {
    pattern: /comfort|temperature.*ok|too cold|too hot/i,
    answer: (k) => {
      const v = k.level3_verdicts;
      if (v.comfort_ok === undefined) return null;
      return v.comfort_ok
        ? `Comfort maintained: average return air ${v.avg_return_temp_C}°C, RH ${v.avg_return_rh_pct}% (within 22–24.5°C / ≤75% RH limits).`
        : `⚠️ Comfort issue: return air ${v.avg_return_temp_C}°C, RH ${v.avg_return_rh_pct}%. Outside acceptable range.`;
    },
  },
  {
    pattern: /cost.*sav|annual.*sav|money|dollar|sgd|\$/i,
    answer: (k) => {
      const f = k.level4_financial;
      if (!f.annual_saving_sgd) return null;
      return `Annual savings per AHU: **S$${Number(f.annual_saving_sgd).toLocaleString()}**. For a 20-storey building (2 AHUs/floor): S$${Number(f.building_20_floors_2_ahus_annual_sgd).toLocaleString()}/year. 10-year: S$${Number(f.ten_year_sgd).toLocaleString()}.`;
    },
  },
  {
    pattern: /statistic|significant|p.?value|confidence/i,
    answer: (k) => {
      const v = k.level3_verdicts;
      if (v.p_value === undefined) return null;
      return v.saving_statistically_significant
        ? `Yes — the energy saving is statistically significant (Welch's t-test, p=${v.p_value}, t=${v.t_statistic}).`
        : `The saving is not statistically significant at p<0.05 (p=${v.p_value}). More data may be needed.`;
    },
  },
];

/**
 * Check if the user's question can be answered directly from pre-computed KPIs.
 * Returns a formatted answer string, or null if LLM reasoning is needed.
 */
export function answerFromData(userPrompt: string, kpis: KPIs): string | null {
  for (const { pattern, answer } of PATTERNS) {
    if (pattern.test(userPrompt)) {
      const result = answer(kpis);
      if (result) return result;
    }
  }
  return null;
}
