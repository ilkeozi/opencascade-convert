import { describe, expect, it, vi } from 'vitest';

const readInputUnitScaleToMeters = vi.fn(() => ({
  scaleToMeters: 2,
  source: 'mocked',
}));
const unitNameFromScale = vi.fn(() => 'm');

vi.mock('../../../src/core/unit-scale', () => ({
  readInputUnitScaleToMeters,
  unitNameFromScale,
}));

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

describe('convertCadBufferToGlbWithMetadata unit scale', () => {
  it('reads input unit scale when override is missing', async () => {
    vi.resetModules();
    const { convertCadBufferToGlbWithMetadata } = await import(
      '../../../src/browser/conversion'
    );

    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [{ min: [0, 0, 0], max: [1, 1, 1], count: 3 }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
      nodes: [{ name: 'Part [0:1]', mesh: 0 }],
    });

    const doc = { Main: () => ({}) };
    const docHandle = { get: () => doc };
    const converter = {
      oc: { token: 'oc' },
      readBuffer: vi.fn(() => docHandle),
      triangulate: vi.fn(),
      writeBuffer: vi.fn(() => ({ outputFormat: 'glb', glb })),
      createNodeMap: vi.fn(() => ({
        roots: ['0:1'],
        nodes: {
          '0:1': {
            id: '0:1',
            labelEntry: '0:1',
            name: 'Part',
            kind: 'part',
            productId: '0:1',
            productName: 'Part',
            parentId: null,
            children: [],
            path: ['0:1'],
          },
        },
      })),
      createBom: vi.fn(() => ({ roots: ['0:1'], items: [] })),
    };

    const result = convertCadBufferToGlbWithMetadata(
      converter as any,
      new Uint8Array([1]),
      {
        inputFormat: 'step',
      }
    );

    expect(readInputUnitScaleToMeters).toHaveBeenCalledWith(
      converter.oc,
      docHandle
    );
    expect(unitNameFromScale).toHaveBeenCalledWith(2);
    expect(result.metadata.units.scaleToMeters).toBe(2);
    expect(result.metadata.units.inputUnitSource).toBe('mocked');
  });
});
