import { describe, expect, it, vi } from 'vitest';
import {
  convertDocumentToGlbWithRetries,
  type GlbConversionResult,
} from '../../../src/browser/conversion';

function buildGlbFromJson(json: unknown) {
  const text = JSON.stringify(json);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const paddedLength = Math.ceil(bytes.length / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded.fill(0x20, bytes.length);

  const totalLength = 12 + 8 + paddedLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(padded, 20);
  return glb;
}

function buildGlbWithTriangleCount(triangleCount: number) {
  const indexCount = triangleCount * 3;
  return buildGlbFromJson({
    asset: { version: '2.0' },
    accessors: [{ count: indexCount }],
    meshes: [
      {
        primitives: [
          {
            indices: 0,
          },
        ],
      },
    ],
    nodes: [],
  });
}

describe('convertDocumentToGlbWithRetries', () => {
  it('retries when triangle explosion is detected', () => {
    const explosionGlb = buildGlbWithTriangleCount(5_000_001);
    const safeGlb = buildGlbWithTriangleCount(10);

    const converter = {
      triangulate: vi.fn(),
      writeBuffer: vi
        .fn()
        .mockReturnValueOnce({ outputFormat: 'glb', glb: explosionGlb })
        .mockReturnValueOnce({ outputFormat: 'glb', glb: safeGlb }),
    };

    const docHandle = { get: () => ({}) };
    const result = convertDocumentToGlbWithRetries(
      converter as any,
      docHandle as any
    ) as GlbConversionResult;

    expect(result.glb).toEqual(safeGlb);
    expect(result.meshStats.triangles).toBe(10);
    expect(
      result.conversionWarnings.some(
        (warning) => warning.code === 'mesh/triangle-explosion-retry'
      )
    ).toBe(true);
    expect(converter.writeBuffer).toHaveBeenCalledTimes(2);
  });

  it('warns when relative triangulation is forced off', () => {
    const safeGlb = buildGlbWithTriangleCount(1);
    const converter = {
      triangulate: vi.fn(),
      writeBuffer: vi
        .fn()
        .mockReturnValue({ outputFormat: 'glb', glb: safeGlb }),
    };
    const docHandle = { get: () => ({}) };

    const result = convertDocumentToGlbWithRetries(
      converter as any,
      docHandle as any,
      {
        triangulate: { relative: true },
        unitScaleToMeters: 0.001,
      }
    ) as GlbConversionResult;

    expect(result.conversionWarnings[0]?.code).toBe('mesh/relative-forced-false');
    expect(converter.writeBuffer).toHaveBeenCalledWith(
      docHandle,
      'glb',
      expect.objectContaining({ unitScaleToMeters: 0.001 })
    );
  });
});
