import { describe, it, expect } from 'vitest';
import { detectTask } from '@/lib/task-detect';

describe('detectTask', () => {
  it('returns task2 for exact column match', () => {
    const csv = 'timestamp,period,ahu_power_kW,cooling_load_RT,airside_efficiency_kW_per_RT\n1,before,7,25,0.28';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBe('task2');
  });

  it('returns task2 for case-insensitive match', () => {
    const csv = 'Timestamp,Period,AHU_Power_kW,Cooling_Load_RT,Airside_Efficiency_kW_per_RT\n1,before,7,25,0.28';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBe('task2');
  });

  it('returns task1 for task1 columns', () => {
    const csv = 'CHWS_Temperature,Cooling_Power,Valve_Feedback\n7.5,100,50';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBe('task1');
  });

  it('returns null for unknown columns', () => {
    const csv = 'temperature,humidity,pressure\n25,60,101';
    const result = detectTask(Buffer.from(csv), 'data.csv');
    expect(result).toBeNull();
  });

  it('returns null for empty file', () => {
    const result = detectTask(Buffer.from(''), 'data.csv');
    expect(result).toBeNull();
  });
});
