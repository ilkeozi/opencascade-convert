import { describe, expect, it } from 'vitest';

import { ConversionError, ValidationError } from '../../../src/core/errors';

describe('errors', () => {
  it('assigns names to custom error classes', () => {
    const conversion = new ConversionError('nope');
    const validation = new ValidationError('bad');

    expect(conversion.name).toBe('ConversionError');
    expect(validation.name).toBe('ValidationError');
  });
});
