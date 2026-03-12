import { describe, expect, it, vi } from 'vitest';

type Label = {
  entry: string;
  kind: 'assembly' | 'part';
  shape?: { surfaceArea?: number; volume?: number };
  components?: Label[];
};

function createOcStub(root: Label) {
  class LabelSequence {
    items: Label[] = [];
    set(items: Label[]) {
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

  class TCollection_AsciiString_1 {
    value = '';
    ToCString() {
      return this.value;
    }
  }

  class HandleAttribute {
    IsNull() {
      return true;
    }
    get() {
      return null;
    }
  }

  class GProps {
    mass = 0;
    Mass() {
      return this.mass;
    }
    delete() {}
  }

  return {
    TDF_LabelSequence_1: LabelSequence,
    XCAFDoc_DocumentTool: {
      ShapeTool: () => ({
        get: () => ({
          GetFreeShapes: (sequence: LabelSequence) => sequence.set([root]),
        }),
      }),
    },
    XCAFDoc_ShapeTool: {
      IsComponent: () => false,
      IsReference: () => false,
      GetReferredShape: () => false,
      IsAssembly: (label: Label) => label.kind === 'assembly',
      GetComponents: (_label: Label, sequence: LabelSequence) => {
        sequence.set([]);
      },
      GetShape_2: (label: Label) => label.shape ?? null,
    },
    TDF_Tool: {
      Entry: (label: Label, entry: TCollection_AsciiString_1) => {
        entry.value = label.entry;
      },
    },
    TCollection_AsciiString_1,
    TDataStd_Name: {
      GetID: () => 'name-guid',
    },
    Handle_TDataStd_Name_1: HandleAttribute,
    Handle_TDF_Attribute_1: HandleAttribute,
    TDF_Label: class {},
    GProp_GProps_1: GProps,
    BRepGProp: {
      SurfaceProperties_1: (shape: any, props: any) => {
        props.mass = shape.surfaceArea ?? 0;
      },
      VolumeProperties_1: (shape: any, props: any) => {
        props.mass = shape.volume ?? 0;
      },
    },
  };
}

describe('assembly physical scale fallback', () => {
  it('falls back to scale=1 when unit-scale reader returns invalid scale', async () => {
    vi.resetModules();
    vi.doMock('../../../src/core/unit-scale', () => ({
      readInputUnitScaleToMeters: () => ({ scaleToMeters: 0, source: 'mocked' }),
    }));

    const { buildNodeMap } = await import('../../../src/core/assembly');
    const oc = createOcStub({
      entry: '1:0',
      kind: 'part',
      shape: { surfaceArea: 2, volume: 3 },
    });
    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any);

    expect(nodeMap.nodes['1:0'].physical).toEqual({
      surfaceArea: 2,
      volume: 3,
    });

    vi.doUnmock('../../../src/core/unit-scale');
  });
});

