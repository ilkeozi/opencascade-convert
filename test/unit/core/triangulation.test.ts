import { describe, expect, it, vi } from 'vitest';

import { triangulateDocument } from '../../../src/core/triangulation';

const createOcStub = () => {
  const labels = [
    { shape: { id: 1 } },
    { shape: null },
    { shape: { id: 2 } },
  ];

  class LabelSequence {
    items: any[] = [];
    set(items: any[]) {
      this.items = items;
    }
    Lower() {
      return 1;
    }
    Upper() {
      return this.items.length;
    }
    Value(index: number) {
      return this.items[index - 1];
    }
  }

  const shapeTool = {
    GetFreeShapes: (sequence: LabelSequence) => {
      sequence.set(labels);
    },
  };

  class Builder {
    static instances: Builder[] = [];
    MakeCompound = vi.fn();
    Add = vi.fn();
    constructor() {
      Builder.instances.push(this);
    }
  }

  class Mesh {
    static calls: any[] = [];
    constructor(...args: any[]) {
      Mesh.calls.push(args);
    }
  }

  const oc = {
    XCAFDoc_DocumentTool: {
      ShapeTool: () => ({
        get: () => shapeTool,
      }),
    },
    XCAFDoc_ShapeTool: {
      GetShape_2: (label: any) => label.shape,
    },
    BRep_Builder: Builder,
    TopoDS_Compound: class {},
    TDF_LabelSequence_1: LabelSequence,
    BRepMesh_IncrementalMesh_2: Mesh,
  };

  return { oc, Builder, Mesh };
};

describe('triangulation', () => {
  it('collects free shapes and meshes with default settings', () => {
    const { oc, Builder, Mesh } = createOcStub();
    const doc = { Main: () => ({}) };

    triangulateDocument(oc as any, doc as any);

    const builder = Builder.instances[0];
    const addCalls = builder?.Add?.mock?.calls ?? [];
    expect(addCalls.length).toBe(2);
    expect(Mesh.calls[0][1]).toBe(1);
    expect(Mesh.calls[0][2]).toBe(false);
    expect(Mesh.calls[0][3]).toBe(0.5);
    expect(Mesh.calls[0][4]).toBe(true);
  });

  it('uses provided triangulation options', () => {
    const { oc, Mesh } = createOcStub();
    const doc = { Main: () => ({}) };

    triangulateDocument(oc as any, doc as any, {
      linearDeflection: 2,
      angularDeflection: 0.2,
      relative: true,
      parallel: false,
    });

    expect(Mesh.calls.at(-1)).toEqual([
      expect.any(Object),
      2,
      true,
      0.2,
      false,
    ]);
  });

  it('logs settings when debug flag is enabled', async () => {
    const original = process.env.OCCT_CONVERT_DEBUG;
    process.env.OCCT_CONVERT_DEBUG = '1';
    vi.resetModules();
    const { triangulateDocument: debugTriangulate } = await import(
      '../../../src/core/triangulation'
    );
    const { oc } = createOcStub();
    const doc = { Main: () => ({}) };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    debugTriangulate(oc as any, doc as any);

    expect(logSpy).toHaveBeenCalledWith(
      '[opencascade-convert] triangulation.settings',
      expect.objectContaining({
        linearDeflection: 1,
        angularDeflection: 0.5,
      })
    );

    logSpy.mockRestore();
    if (original === undefined) {
      delete process.env.OCCT_CONVERT_DEBUG;
    } else {
      process.env.OCCT_CONVERT_DEBUG = original;
    }
  });

  it('handles missing process globals', async () => {
    const original = (globalThis as any).process;
    // @ts-expect-error deliberately remove process to exercise fallback.
    (globalThis as any).process = undefined;
    vi.resetModules();
    const { triangulateDocument: noProcessTriangulate } = await import(
      '../../../src/core/triangulation'
    );
    const { oc } = createOcStub();
    const doc = { Main: () => ({}) };

    expect(() => noProcessTriangulate(oc as any, doc as any)).not.toThrow();

    (globalThis as any).process = original;
  });
});
