import { describe, it, expect } from 'vitest';
import { validateFilledSchema, validateFilledView } from '@/lib/schema-validator';

describe('validateFilledSchema', () => {
  it('passes valid schema with column-based period split', () => {
    const schema = {
      columns: { power: { column: 'ahu_power_kW', required: true } },
      period_split: { method: 'column', column: 'period', before_value: 'Before', after_value: 'After' },
    };
    expect(validateFilledSchema(schema)).toBeNull();
  });

  it('passes valid schema with date_range period split', () => {
    const schema = {
      columns: { power: { column: 'power_kW', required: true } },
      period_split: {
        method: 'date_range',
        before_date_start: '2024-01-01',
        before_date_end: '2024-01-14',
        after_date_start: '2024-01-15',
        after_date_end: '2024-01-28',
      },
    };
    expect(validateFilledSchema(schema)).toBeNull();
  });

  it('fails when columns section is missing', () => {
    const schema = { period_split: { method: 'column', column: 'p', before_value: 'B', after_value: 'A' } };
    expect(validateFilledSchema(schema)).toContain('columns');
  });

  it('fails when power column mapping is missing', () => {
    const schema = {
      columns: { power: { column: null } },
      period_split: { method: 'column', column: 'p', before_value: 'B', after_value: 'A' },
    };
    expect(validateFilledSchema(schema)).toContain('power');
  });

  it('fails when period_split method is missing', () => {
    const schema = { columns: { power: { column: 'power' } }, period_split: {} };
    expect(validateFilledSchema(schema)).toContain('period_split');
  });

  it('fails when column split is missing column name', () => {
    const schema = {
      columns: { power: { column: 'power' } },
      period_split: { method: 'column', before_value: 'B', after_value: 'A' },
    };
    expect(validateFilledSchema(schema)).toContain('column name');
  });

  it('fails when column split is missing before_value', () => {
    const schema = {
      columns: { power: { column: 'power' } },
      period_split: { method: 'column', column: 'period', after_value: 'A' },
    };
    expect(validateFilledSchema(schema)).toContain('before_value');
  });

  it('fails on invalid period_split method', () => {
    const schema = {
      columns: { power: { column: 'power' } },
      period_split: { method: 'invalid' },
    };
    expect(validateFilledSchema(schema)).toContain('Invalid');
  });
});

describe('validateFilledView', () => {
  it('passes valid view', () => {
    expect(validateFilledView({ title: 'Test Dashboard', narrative: { text: 'ok' } })).toBeNull();
  });

  it('fails without title', () => {
    expect(validateFilledView({ narrative: { text: 'ok' } })).toContain('title');
  });

  it('fails without narrative', () => {
    expect(validateFilledView({ title: 'Test' })).toContain('narrative');
  });
});
