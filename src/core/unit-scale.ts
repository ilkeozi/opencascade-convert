import type { OpenCascadeInstance } from './types';

function approxEqual(a: number, b: number, epsilon = 1e-9) {
  return Math.abs(a - b) <= epsilon;
}

/**
 * Converts a scale factor to a human-readable unit name.
 */
export function unitNameFromScale(scaleToMeters: number) {
  if (approxEqual(scaleToMeters, 1)) return 'm'; // meters
  if (approxEqual(scaleToMeters, 0.001)) return 'mm'; // millimeters
  if (approxEqual(scaleToMeters, 0.01)) return 'cm'; // centimeters
  if (approxEqual(scaleToMeters, 0.0254)) return 'in'; // inches
  if (approxEqual(scaleToMeters, 0.3048)) return 'ft'; // feet
  return 'unknown';
}

/**
 * Reads the input document length unit scale (to meters) from OCCT metadata.
 * @returns Scale and source identifier for diagnostics.
 */
export function readInputUnitScaleToMeters(
  oc: OpenCascadeInstance,
  docHandle: any
): {
  scaleToMeters: number;
  source: string;
} {
  const doc = docHandle?.get ? docHandle.get() : docHandle;
  const tool = oc?.XCAFDoc_DocumentTool;
  if (!tool) {
    return { scaleToMeters: 1, source: 'unknown' };
  }

  const candidates = ['GetLengthUnit', 'GetLengthUnit_1', 'GetLengthUnit_2'];
  for (const key of candidates) {
    const fn = (tool as any)[key];
    if (typeof fn !== 'function') {
      continue;
    }
    try {
      const value = fn(doc);
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return { scaleToMeters: value, source: `XCAFDoc_DocumentTool.${key}` };
      }
    } catch {
      // try next
    }
  }

  return { scaleToMeters: 1, source: 'unknown' };
}

/**
 * Applies a length unit scale to the writer when supported.
 */
export function applyLengthUnitConversionToWriter(
  writer: any,
  scaleToMeters: number
) {
  try {
    const maybeConv =
      typeof writer.ChangeCoordinateSystemConverter === 'function'
        ? writer.ChangeCoordinateSystemConverter()
        : null;
    const conv = maybeConv ?? null;
    if (!conv) {
      return;
    }

    if (typeof conv.SetInputLengthUnit === 'function') {
      conv.SetInputLengthUnit(scaleToMeters);
    }
    if (typeof conv.SetOutputLengthUnit === 'function') {
      conv.SetOutputLengthUnit(1.0); // meters
    }
    if (typeof writer.SetCoordinateSystemConverter === 'function') {
      writer.SetCoordinateSystemConverter(conv);
    }
  } catch {
    // ignore
  }
}
