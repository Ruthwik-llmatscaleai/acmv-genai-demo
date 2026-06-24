import { describe, it, expect } from 'vitest';
import { answerFromData, type KPIs } from '@/lib/data-sufficiency';

const mockKpis: KPIs = {
  task: 'task2',
  level1_raw: { avg_power_before_kW: 7.02, avg_power_after_kW: 3.45 },
  level2_derived: {
    saving_pct: 50.9,
    saving_kWh: 666.7,
    airside_eff_before_kW_per_RT: 0.265,
    airside_eff_after_kW_per_RT: 0.130,
    total_system_eff_after_kW_per_RT: 0.73,
  },
  level3_verdicts: {
    meets_sle_airside: true,
    comfort_ok: true,
    avg_return_temp_C: 23.5,
    avg_return_rh_pct: 62,
    p_value: 0.0001,
    t_statistic: 45.2,
    saving_statistically_significant: true,
  },
  level4_financial: {
    annual_saving_sgd: 5864,
    building_20_floors_2_ahus_annual_sgd: 234560,
    ten_year_sgd: 2345600,
  },
};

describe('answerFromData', () => {
  it('answers SLE question', () => {
    const answer = answerFromData('Does it meet the SLE target?', mockKpis);
    expect(answer).not.toBeNull();
    expect(answer).toContain('Yes');
    expect(answer).toContain('0.13');
  });

  it('answers savings question', () => {
    const answer = answerFromData('How much energy was saved?', mockKpis);
    expect(answer).not.toBeNull();
    expect(answer).toContain('50.9%');
  });

  it('answers comfort question', () => {
    const answer = answerFromData('Is the comfort maintained?', mockKpis);
    expect(answer).not.toBeNull();
    expect(answer).toContain('23.5');
  });

  it('answers cost savings question', () => {
    const answer = answerFromData('What are the annual cost savings?', mockKpis);
    expect(answer).not.toBeNull();
    expect(answer).toContain('5,864');
  });

  it('answers statistical significance question', () => {
    const answer = answerFromData('Is it statistically significant?', mockKpis);
    expect(answer).not.toBeNull();
    expect(answer).toContain('significant');
  });

  it('returns null for novel questions', () => {
    const answer = answerFromData('Why does power spike on humid days?', mockKpis);
    expect(answer).toBeNull();
  });

  it('returns null for unrelated questions', () => {
    const answer = answerFromData('What is the weather today?', mockKpis);
    expect(answer).toBeNull();
  });
});
