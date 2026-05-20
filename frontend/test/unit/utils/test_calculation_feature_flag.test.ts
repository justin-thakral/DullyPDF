import { afterEach, describe, expect, it, vi } from 'vitest';

describe('calculation field feature flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('hides calculation create tools when explicitly disabled', async () => {
    vi.stubEnv('VITE_ENABLE_CALCULATION_FIELDS', 'false');
    vi.resetModules();

    const calculations = await import('../../../src/utils/calculationFields');

    expect(calculations.calculationFieldsEnabled()).toBe(false);
    expect(calculations.CALCULATION_CREATE_TOOLS).toEqual([]);
    expect(calculations.isCalculationCreateTool('number-input')).toBe(false);
  });

  it('enables calculation create tools when explicitly enabled', async () => {
    vi.stubEnv('VITE_ENABLE_CALCULATION_FIELDS', 'true');
    vi.resetModules();

    const calculations = await import('../../../src/utils/calculationFields');

    expect(calculations.calculationFieldsEnabled()).toBe(true);
    expect(calculations.CALCULATION_CREATE_TOOLS).toEqual(['number-input', 'calculated-output']);
    expect(calculations.isCalculationCreateTool('calculated-output')).toBe(true);
  });
});
