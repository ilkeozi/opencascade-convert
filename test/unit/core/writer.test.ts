import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversionError } from '../../../src/core/errors';
import { writeDocumentToBuffer } from '../../../src/core/writer';

import * as writerCore from '../../../src/core/writer-core';

vi.mock('../../../src/core/writer-core', () => ({
  writeGlbInternal: vi.fn(),
  writeGltfInternal: vi.fn(),
  writeObjInternal: vi.fn(),
}));

describe('writer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns GLB output as Buffer when available', () => {
    const glbData = new Uint8Array([1, 2, 3]);
    vi.mocked(writerCore.writeGlbInternal).mockReturnValue(glbData);

    const result = writeDocumentToBuffer({} as any, {} as any, 'glb');

    expect(result.outputFormat).toBe('glb');
    expect(result.glb).toBeInstanceOf(Buffer);
    expect(Buffer.from(glbData).equals(result.glb)).toBe(true);
  });

  it('throws when GLB output is missing', () => {
    vi.mocked(writerCore.writeGlbInternal).mockReturnValue(undefined as any);

    expect(() =>
      writeDocumentToBuffer({} as any, {} as any, 'glb')
    ).toThrow(ConversionError);
  });

  it('throws when GLTF output is missing', () => {
    vi.mocked(writerCore.writeGltfInternal).mockReturnValue({
      gltfData: null,
      binData: new Uint8Array([1]),
      binPath: './output.bin',
    } as any);

    expect(() =>
      writeDocumentToBuffer({} as any, {} as any, 'gltf')
    ).toThrow(ConversionError);
  });

  it('returns GLTF output when data is present', () => {
    const gltfData = new Uint8Array([4]);
    const binData = new Uint8Array([5]);
    vi.mocked(writerCore.writeGltfInternal).mockReturnValue({
      gltfData,
      binData,
      binPath: './output.bin',
    } as any);

    const result = writeDocumentToBuffer({} as any, {} as any, 'gltf');

    expect(result.outputFormat).toBe('gltf');
    expect(result.gltf).toBeInstanceOf(Buffer);
    expect(result.bin).toBeInstanceOf(Buffer);
  });

  it('throws when OBJ output is missing', () => {
    vi.mocked(writerCore.writeObjInternal).mockReturnValue(undefined as any);

    expect(() =>
      writeDocumentToBuffer({} as any, {} as any, 'obj')
    ).toThrow(ConversionError);
  });

  it('returns raw Uint8Array when Buffer is unavailable', () => {
    const originalBuffer = globalThis.Buffer;
    const objData = new Uint8Array([9, 9]);
    vi.mocked(writerCore.writeObjInternal).mockReturnValue(objData);

    // @ts-expect-error intentionally unset Buffer for fallback coverage
    globalThis.Buffer = undefined;

    const result = writeDocumentToBuffer({} as any, {} as any, 'obj');

    expect(result.outputFormat).toBe('obj');
    expect(result.obj).toBe(objData);

    globalThis.Buffer = originalBuffer;
  });
});
