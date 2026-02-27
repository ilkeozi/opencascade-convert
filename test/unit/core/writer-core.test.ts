import { describe, expect, it, vi } from 'vitest';

import {
  applyGltfNameFormat,
  createMetadataMap,
  writeGlbInternal,
  writeGltfInternal,
  writeObjInternal,
} from '../../../src/core/writer-core';

const createOcStub = () => {
  const fsStore = new Map<string, Uint8Array>();
  const fs = {
    analyzePath: vi.fn((path: string) => ({ exists: fsStore.has(path) })),
    readFile: vi.fn((path: string) => fsStore.get(path)),
    unlink: vi.fn((path: string) => {
      fsStore.delete(path);
    }),
  };

  class TCollection_AsciiString_2 {
    constructor(public value: string) {}
  }

  class TColStd_IndexedDataMapOfStringString_1 {
    entries: Array<[string, string]> = [];
    Add(k: { value: string }, v: { value: string }) {
      this.entries.push([k.value, v.value]);
    }
  }

  class RWGltf_CafWriter {
    static last: RWGltf_CafWriter | null = null;
    static throwOnMergeFaces = false;
    SetNodeNameFormat = vi.fn();
    SetMeshNameFormat = vi.fn();
    SetMergeFaces = vi.fn(() => {
      if (RWGltf_CafWriter.throwOnMergeFaces) {
        throw new Error('nope');
      }
    });
    Perform_2 = vi.fn();
    constructor(public file: unknown, public binary: boolean) {
      RWGltf_CafWriter.last = this;
    }
  }

  class RWObj_CafWriter {
    static last: RWObj_CafWriter | null = null;
    Perform_2 = vi.fn();
    constructor(public file: unknown) {
      RWObj_CafWriter.last = this;
    }
  }

  const oc = {
    FS: fs,
    TCollection_AsciiString_2,
    TColStd_IndexedDataMapOfStringString_1,
    Message_ProgressRange_1: class {},
    RWGltf_CafWriter,
    RWObj_CafWriter,
    RWMesh_NameFormat: {
      RWMesh_NameFormat_ProductOrInstance: 'fmt-product-or-instance',
      RWMesh_NameFormat_Instance: 'fmt-instance',
    },
  };

  return { oc, fsStore, RWGltf_CafWriter, RWObj_CafWriter };
};

describe('writer-core', () => {
  it('createMetadataMap populates key/value pairs', () => {
    const { oc } = createOcStub();
    const map = createMetadataMap(oc as any, { a: '1', b: '2' }) as any;

    expect(map.entries).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('applyGltfNameFormat sets node and mesh formats', () => {
    const { oc } = createOcStub();
    const writer = {
      SetNodeNameFormat: vi.fn(),
      SetMeshNameFormat: vi.fn(),
    };

    applyGltfNameFormat(oc as any, writer, { nameFormat: 'instance' });

    expect(writer.SetNodeNameFormat).toHaveBeenCalledWith('fmt-instance');
    expect(writer.SetMeshNameFormat).toHaveBeenCalledWith('fmt-instance');
  });

  it('applyGltfNameFormat ignores writers without node format setter', () => {
    const { oc } = createOcStub();
    const writer = {};

    expect(() => applyGltfNameFormat(oc as any, writer, {})).not.toThrow();
  });

  it('writeGlbInternal writes and cleans up GLB output', () => {
    const { oc, fsStore, RWGltf_CafWriter } = createOcStub();
    const path = './output.glb';
    fsStore.set(path, new Uint8Array([1, 2, 3]));

    const data = writeGlbInternal(oc as any, {} as any, path, {});

    expect(data).toEqual(new Uint8Array([1, 2, 3]));
    expect(RWGltf_CafWriter.last?.Perform_2).toHaveBeenCalled();
    expect(oc.FS.unlink).toHaveBeenCalledWith(path);
  });

  it('writeGlbInternal tolerates merge-faces errors', () => {
    const { oc, fsStore, RWGltf_CafWriter } = createOcStub();
    RWGltf_CafWriter.throwOnMergeFaces = true;
    const path = './output.glb';
    fsStore.set(path, new Uint8Array([4]));

    const data = writeGlbInternal(oc as any, {} as any, path, {});

    expect(data).toEqual(new Uint8Array([4]));
  });

  it('writeGltfInternal returns gltf and bin data', () => {
    const { oc, fsStore, RWGltf_CafWriter } = createOcStub();
    const gltfPath = './scene.gltf';
    const binPath = './scene.bin';
    fsStore.set(gltfPath, new Uint8Array([5]));
    fsStore.set(binPath, new Uint8Array([6]));

    const result = writeGltfInternal(oc as any, {} as any, gltfPath, {});

    expect(result.gltfData).toEqual(new Uint8Array([5]));
    expect(result.binData).toEqual(new Uint8Array([6]));
    expect(result.binPath).toBe(binPath);
    expect(RWGltf_CafWriter.last?.Perform_2).toHaveBeenCalled();
    expect(oc.FS.unlink).toHaveBeenCalledWith(gltfPath);
    expect(oc.FS.unlink).toHaveBeenCalledWith(binPath);
  });

  it('writeGltfInternal tolerates merge-faces errors', () => {
    const { oc, fsStore, RWGltf_CafWriter } = createOcStub();
    RWGltf_CafWriter.throwOnMergeFaces = true;
    const gltfPath = './scene.gltf';
    const binPath = './scene.bin';
    fsStore.set(gltfPath, new Uint8Array([8]));
    fsStore.set(binPath, new Uint8Array([9]));

    const result = writeGltfInternal(oc as any, {} as any, gltfPath, {});

    expect(result.gltfData).toEqual(new Uint8Array([8]));
    expect(result.binData).toEqual(new Uint8Array([9]));
  });

  it('writeObjInternal returns obj data', () => {
    const { oc, fsStore, RWObj_CafWriter } = createOcStub();
    const path = './output.obj';
    fsStore.set(path, new Uint8Array([7, 8]));

    const data = writeObjInternal(oc as any, {} as any, path, {});

    expect(data).toEqual(new Uint8Array([7, 8]));
    expect(RWObj_CafWriter.last?.Perform_2).toHaveBeenCalled();
  });
});
