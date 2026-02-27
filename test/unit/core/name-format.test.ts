import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NAME_FORMAT,
  NAME_FORMAT_KEYS,
  resolveNameFormatKey,
} from '../../../src/core/name-format';

describe('name-format', () => {
  it('resolves the default format when undefined', () => {
    expect(resolveNameFormatKey()).toBe(NAME_FORMAT_KEYS[DEFAULT_NAME_FORMAT]);
  });

  it('resolves known formats to their RWMesh keys', () => {
    expect(resolveNameFormatKey('productAndInstance')).toBe(
      NAME_FORMAT_KEYS.productAndInstance
    );
    expect(resolveNameFormatKey('instance')).toBe(NAME_FORMAT_KEYS.instance);
  });

  it('falls back to default for unknown values', () => {
    expect(resolveNameFormatKey('unknown' as any)).toBe(
      NAME_FORMAT_KEYS[DEFAULT_NAME_FORMAT]
    );
  });
});
