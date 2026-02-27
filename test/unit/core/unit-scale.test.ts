import { describe, expect, it } from 'vitest';
import {
  applyLengthUnitConversionToWriter,
  readInputUnitScaleToMeters,
  unitNameFromScale,
} from '../../../src/core/unit-scale';

describe('unit-scale', () => {
  it('maps unit scales to names', () => {
    expect(unitNameFromScale(1)).toBe('m');
    expect(unitNameFromScale(0.001)).toBe('mm');
    expect(unitNameFromScale(0.01)).toBe('cm');
    expect(unitNameFromScale(0.0254)).toBe('in');
    expect(unitNameFromScale(0.3048)).toBe('ft');
    expect(unitNameFromScale(123)).toBe('unknown');
  });

  it('reads unit scale from OCCT doc when available', () => {
    const oc = {
      XCAFDoc_DocumentTool: {
        GetLengthUnit_1: (doc: unknown) => {
          if (!doc) throw new Error('missing');
          return 0.001;
        },
      },
    };
    const docHandle = { get: () => ({}) };
    const result = readInputUnitScaleToMeters(oc as any, docHandle);
    expect(result.scaleToMeters).toBe(0.001);
    expect(result.source).toBe('XCAFDoc_DocumentTool.GetLengthUnit_1');
  });

  it('falls back to defaults when tool is missing', () => {
    const result = readInputUnitScaleToMeters({} as any, {});
    expect(result).toEqual({ scaleToMeters: 1, source: 'unknown' });
  });

  it('skips invalid unit getters and falls back', () => {
    const oc = {
      XCAFDoc_DocumentTool: {
        GetLengthUnit: () => 0,
        GetLengthUnit_1: () => 'nope',
        GetLengthUnit_2: () => {
          throw new Error('fail');
        },
      },
    };
    const result = readInputUnitScaleToMeters(oc as any, {});
    expect(result).toEqual({ scaleToMeters: 1, source: 'unknown' });
  });

  it('accepts the first valid unit getter', () => {
    const oc = {
      XCAFDoc_DocumentTool: {
        GetLengthUnit: () => 0.0254,
        GetLengthUnit_1: () => 0.001,
      },
    };
    const result = readInputUnitScaleToMeters(oc as any, { get: () => ({}) });
    expect(result).toEqual({
      scaleToMeters: 0.0254,
      source: 'XCAFDoc_DocumentTool.GetLengthUnit',
    });
  });

  it('applies length unit conversion when writer supports it', () => {
    const calls: string[] = [];
    const conv = {
      SetInputLengthUnit: (value: number) => calls.push(`in:${value}`),
      SetOutputLengthUnit: (value: number) => calls.push(`out:${value}`),
    };
    const writer = {
      ChangeCoordinateSystemConverter: () => conv,
      SetCoordinateSystemConverter: (value: unknown) => {
        if (value) calls.push('set');
      },
    };

    applyLengthUnitConversionToWriter(writer, 0.001);
    expect(calls).toEqual(['in:0.001', 'out:1', 'set']);
  });

  it('does nothing when writer lacks converters or throws', () => {
    const writerWithoutConv = {};
    expect(() => applyLengthUnitConversionToWriter(writerWithoutConv, 0.001)).not.toThrow();

    const writerThrows = {
      ChangeCoordinateSystemConverter: () => {
        throw new Error('boom');
      },
    };
    expect(() => applyLengthUnitConversionToWriter(writerThrows, 0.001)).not.toThrow();
  });

  it('handles partial converter implementations', () => {
    const calls: string[] = [];
    const writer = {
      ChangeCoordinateSystemConverter: () => ({}),
      SetCoordinateSystemConverter: (value: unknown) => {
        if (value) calls.push('set');
      },
    };

    applyLengthUnitConversionToWriter(writer, 1);
    expect(calls).toEqual(['set']);
  });
});
