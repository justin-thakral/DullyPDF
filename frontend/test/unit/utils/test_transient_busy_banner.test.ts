import { describe, expect, it } from 'vitest';

import { shouldSuppressTransientBusyBanner } from '../../../src/utils/transientBusyBanner';

describe('shouldSuppressTransientBusyBanner', () => {
  it('suppresses transient OpenAI busy messages while a mapping action is active', () => {
    expect(shouldSuppressTransientBusyBanner('Mapping is already running.', {
      mappingInProgress: false,
      mapSchemaInProgress: true,
      renameInProgress: false,
    })).toBe(true);
  });

  it('suppresses transient OpenAI busy messages while rename is active', () => {
    expect(shouldSuppressTransientBusyBanner('Rename is already running.', {
      mappingInProgress: false,
      mapSchemaInProgress: false,
      renameInProgress: true,
    })).toBe(true);
  });

  it('does not suppress unrelated messages or idle-state notices', () => {
    expect(shouldSuppressTransientBusyBanner('Upload schema headers before mapping.', {
      mappingInProgress: true,
      mapSchemaInProgress: true,
      renameInProgress: false,
    })).toBe(false);

    expect(shouldSuppressTransientBusyBanner('Mapping is already running.', {
      mappingInProgress: false,
      mapSchemaInProgress: false,
      renameInProgress: false,
    })).toBe(false);
  });
});
