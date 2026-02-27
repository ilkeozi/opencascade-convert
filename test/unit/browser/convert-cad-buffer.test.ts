import { describe, expect, it, vi } from 'vitest';
import {
  convertCadBufferToGlbWithMetadata,
  type ConvertCadBufferResult,
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

function buildMinimalGlb() {
  return buildGlbFromJson({
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
}

function buildGlbWithNodes(names: string[]) {
  return buildGlbFromJson({
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
    nodes: names.map((name) => ({ name, mesh: 0 })),
  });
}

describe('convertCadBufferToGlbWithMetadata', () => {
  it('builds metadata and embeds extras when requested', () => {
    const glb = buildMinimalGlb();
    const converter = {
      readBuffer: vi.fn(() => ({ get: () => ({}) })),
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
      createBom: vi.fn(() => ({
        roots: ['0:1'],
        items: [
          {
            productId: '0:1',
            productName: 'Part',
            kind: 'part',
            quantity: 1,
            instances: [],
          },
        ],
      })),
    };

    const result = convertCadBufferToGlbWithMetadata(
      converter as any,
      new Uint8Array([1, 2, 3]),
      {
        inputFormat: 'step',
        triangulate: { relative: true },
        nameFormat: 'productAndInstanceAndOcaf',
        schemaVersion: 'test-schema',
        embedMetadataKey: 'testKey',
        unitScaleToMeters: 0.001,
        validateNodeMap: true,
        validateMesh: true,
      }
    ) as ConvertCadBufferResult;

    expect(result.metadata.schemaVersion).toBe('test-schema');
    expect(result.metadata.units.scaleToMeters).toBe(0.001);
    expect(result.metadata.nodeMap.roots).toEqual(['0:1']);
    expect(result.metadata.bom[0]?.name).toBe('Part');
    expect(result.conversionWarnings[0]?.code).toBe('mesh/relative-forced-false');
    expect(result.patchedGlb).toBeInstanceOf(Uint8Array);
  });

  it('throws when validateNodeMap fails', () => {
    const converter = {
      readBuffer: vi.fn(() => ({ get: () => ({}) })),
      createNodeMap: vi.fn(() => ({ roots: [], nodes: {} })),
    };

    try {
      convertCadBufferToGlbWithMetadata(converter as any, new Uint8Array([1]), {
        inputFormat: 'step',
        validateNodeMap: true,
        unitScaleToMeters: 1,
      });
      throw new Error('Expected validateNodeMap error');
    } catch (error: any) {
      expect(error?.__code).toBe('UNSUPPORTED_STEP_CONTENT');
      expect(error?.detail).toEqual({ rootCount: 0, nodeCount: 0 });
    }
  });

  it('throws when validateMesh fails', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      accessors: [],
      meshes: [],
      nodes: [],
    });

    const converter = {
      readBuffer: vi.fn(() => ({ get: () => ({}) })),
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
      createBom: vi.fn(() => ({ roots: [], items: [] })),
    };

    try {
      convertCadBufferToGlbWithMetadata(converter as any, new Uint8Array([1]), {
        inputFormat: 'step',
        validateMesh: true,
        unitScaleToMeters: 1,
      });
      throw new Error('Expected validateMesh error');
    } catch (error: any) {
      expect(error?.__code).toBe('UNSUPPORTED_STEP_CONTENT');
      expect(error?.detail).toMatchObject({ meshCount: 0 });
    }
  });

  it('throws when glTF mapping is missing', () => {
    const glb = buildGlbWithNodes(['Other [0:2]']);

    const converter = {
      readBuffer: vi.fn(() => ({ get: () => ({}) })),
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
      createBom: vi.fn(() => ({ roots: [], items: [] })),
    };

    expect(() =>
      convertCadBufferToGlbWithMetadata(converter as any, new Uint8Array([1]), {
        inputFormat: 'step',
        unitScaleToMeters: 1,
      })
    ).toThrow('Missing glTF mapping for node 0:1');
  });

  it('throws when glTF mapping is duplicated', () => {
    const glb = buildGlbWithNodes(['Part [0:1]']);

    const converter = {
      readBuffer: vi.fn(() => ({ get: () => ({}) })),
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
          '0:2': {
            id: '0:2',
            labelEntry: '0:1',
            name: 'Part',
            kind: 'part',
            productId: '0:1',
            productName: 'Part',
            parentId: null,
            children: [],
            path: ['0:2'],
          },
        },
      })),
      createBom: vi.fn(() => ({ roots: [], items: [] })),
    };

    expect(() =>
      convertCadBufferToGlbWithMetadata(converter as any, new Uint8Array([1]), {
        inputFormat: 'step',
        unitScaleToMeters: 1,
      })
    ).toThrow('Duplicate glTF node mapping for index 0');
  });

  it('throws when node label entry is not a string', () => {
    const glb = buildGlbWithNodes(['Part [0:1]']);

    const converter = {
      readBuffer: vi.fn(() => ({ get: () => ({}) })),
      triangulate: vi.fn(),
      writeBuffer: vi.fn(() => ({ outputFormat: 'glb', glb })),
      createNodeMap: vi.fn(() => ({
        roots: ['0:1'],
        nodes: {
          '0:1': {
            id: '0:1',
            labelEntry: null,
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
      createBom: vi.fn(() => ({ roots: [], items: [] })),
    };

    expect(() =>
      convertCadBufferToGlbWithMetadata(converter as any, new Uint8Array([1]), {
        inputFormat: 'step',
        unitScaleToMeters: 1,
      })
    ).toThrow('Missing glTF mapping for node 0:1');
  });

  it('builds bom summary with fallbacks and skips embedding when disabled', () => {
    const glb = buildGlbWithNodes(['Pretty [0:1]']);

    const converter = {
      readBuffer: vi.fn(() => ({ get: () => ({}) })),
      triangulate: vi.fn(),
      writeBuffer: vi.fn(() => ({ outputFormat: 'glb', glb })),
      createNodeMap: vi.fn(() => ({
        roots: ['0:1'],
        nodes: {
          '0:1': {
            id: '0:1',
            labelEntry: '0:1',
            name: 'Fallback',
            kind: 'part',
            productId: '0:1',
            productName: 'Fallback',
            parentId: null,
            children: null,
            path: ['0:1'],
          },
        },
      })),
      createBom: vi.fn(() => ({
        roots: ['0:1'],
        items: [
          { productId: '0:1', quantity: undefined },
          { productName: 'NameOnly', quantity: 2 },
          { quantity: 0 },
        ],
      })),
    };

    const result = convertCadBufferToGlbWithMetadata(
      converter as any,
      new Uint8Array([1]),
      {
        inputFormat: 'step',
        unitScaleToMeters: 1,
      }
    ) as ConvertCadBufferResult;

    expect(result.metadata.schemaVersion).toBeUndefined();
    expect(result.patchedGlb).toBeUndefined();
    expect(result.metadata.bom[0]).toEqual({
      name: 'Pretty',
      quantity: 0,
      productId: '0:1',
      kind: undefined,
    });
    expect(result.metadata.bom[1]?.name).toBe('NameOnly');
    expect(result.metadata.bom[2]?.name).toBe('Unknown');
  });
});
