import { describe, expect, it, vi } from 'vitest';

import { buildAssemblyTree, buildBom, buildNodeMap } from '../../../src/core/assembly';

type Label = {
  entry: string;
  name?: string;
  kind?: 'assembly' | 'part';
  shape?: { surfaceArea?: number; volume?: number };
  components?: Label[];
  GetLabelName?: () => string;
  GetLabelName_1?: () => unknown;
  GetName?: () => unknown;
  Name?: () => unknown;
  FindAttribute_1?: (guid: unknown, out: any) => boolean;
  FindAttribute?: (guid: unknown, out: any) => boolean;
  FindAttribute_2?: (guid: unknown, out: any) => boolean;
  isComponent?: boolean;
  isReference?: boolean;
  referred?: Label;
};

const createOcStub = (
  roots: Label[],
  options?: {
    withNameAttr?: boolean;
    withNameHandle?: boolean;
    handleHasGet?: boolean;
    handleReturnsNull?: boolean;
  }
) => {
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

  const shapeTool = {
    GetFreeShapes: (sequence: LabelSequence) => {
      sequence.set(roots);
    },
  };

  class TCollection_AsciiString_1 {
    value = '';
    ToCString() {
      return this.value;
    }
  }

  class HandleAttribute {
    value: any = null;
    IsNull() {
      return this.value == null;
    }
    get() {
      return options?.handleReturnsNull ? null : this.value;
    }
  }

  const oc = {
    TDF_LabelSequence_1: LabelSequence,
    XCAFDoc_DocumentTool: {
      ShapeTool: () => ({
        get: () => shapeTool,
      }),
    },
    XCAFDoc_ShapeTool: {
      IsComponent: (label: Label) => Boolean(label.isComponent),
      IsReference: (label: Label) => Boolean(label.isReference),
      GetReferredShape: (label: Label, out: Label) => {
        if (!label.referred) {
          return false;
        }
        Object.assign(out, label.referred);
        return true;
      },
      IsAssembly: (label: Label) => label.kind === 'assembly',
      GetComponents: (label: Label, sequence: LabelSequence) => {
        sequence.set(label.components ?? []);
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
  };

  if (options?.withNameAttr === false) {
    delete (oc as any).TDataStd_Name;
  }
  if (options?.withNameHandle === false) {
    delete (oc as any).Handle_TDataStd_Name_1;
  }
  if (options?.handleHasGet === false) {
    delete (HandleAttribute as any).prototype.get;
  }

  return oc;
};

describe('assembly', () => {
  it('builds node map and bom from a simple assembly', () => {
    const child1: Label = { entry: '0:1:2', name: 'Bolt', kind: 'part' };
    const child2: Label = { entry: '0:1:3', name: '', kind: 'part' };
    const root: Label = {
      entry: '0:1',
      name: 'Root',
      kind: 'assembly',
      components: [child1, child2],
    };
    root.GetLabelName = () => root.name ?? '';
    child1.GetLabelName = () => child1.name ?? '';
    child2.GetLabelName = () => child2.name ?? '';

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any, {
      '0:1:3': 'Override',
    });

    expect(nodeMap.roots).toEqual(['0:1']);
    expect(nodeMap.nodes['0:1'].children).toEqual([
      '0:1/0:1:2',
      '0:1/0:1:3',
    ]);
    expect(nodeMap.nodes['0:1/0:1:3'].name).toBe('Override');

    const bom = buildBom(oc as any, docHandle as any, {
      '0:1:3': 'Override',
    });
    expect(bom.items).toHaveLength(3);
    const productNames = bom.items.map((item) => item.productName).sort();
    expect(productNames).toEqual(['Bolt', 'Override', 'Root']);
  });

  it('buildAssemblyTree handles childrenIds and children', () => {
    const tree = buildAssemblyTree({
      roots: ['root'],
      nodes: {
        root: { id: 'root', name: 'Root', childrenIds: ['child'] },
        child: { id: 'child', name: 'Child', children: [] },
      },
    });

    expect(tree).toEqual([
      { id: 'root', name: 'Root', children: [{ id: 'child', name: 'Child', children: [] }] },
    ]);
  });

  it('buildAssemblyTree skips missing nodes and handles empty children', () => {
    const tree = buildAssemblyTree({
      roots: ['missing', 'root'],
      nodes: {
        root: { id: 'root', name: 'Root' },
      },
    });

    expect(tree).toEqual([{ id: 'root', name: 'Root', children: [] }]);
  });

  it('builds node map when docHandle has no get()', () => {
    const root: Label = { entry: '4:0', name: 'Root', kind: 'part' };
    root.GetLabelName = () => root.name ?? '';

    const oc = createOcStub([root]);
    const docHandle = { Main: () => ({}) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.roots).toEqual(['4:0']);
  });

  it('handles missing product entry and uses instance entry fallback', () => {
    const referred: Label = { entry: '', name: 'Referred', kind: 'part' };
    referred.GetLabelName = () => referred.name ?? '';

    const root: Label = {
      entry: '4:1',
      name: 'Instance',
      kind: 'part',
      isComponent: true,
      referred,
    };
    root.GetLabelName = () => root.name ?? '';

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.nodes['4:1'].productId).toBe('4:1');
  });

  it('merges bom items for repeated product instances', () => {
    const product: Label = { entry: '2:1', name: 'Shared', kind: 'part' };
    product.GetLabelName = () => product.name ?? '';

    const instanceA: Label = {
      entry: '2:1:1',
      name: 'A',
      kind: 'part',
      isComponent: true,
      referred: product,
    };
    const instanceB: Label = {
      entry: '2:1:2',
      name: 'B',
      kind: 'part',
      isComponent: true,
      referred: product,
    };

    const root: Label = {
      entry: '2:0',
      name: 'Root',
      kind: 'assembly',
      components: [instanceA, instanceB],
    };
    root.GetLabelName = () => root.name ?? '';

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const bom = buildBom(oc as any, docHandle as any);
    const shared = bom.items.find((item) => item.productId === '2:1');

    expect(shared?.quantity).toBe(2);
    expect(shared?.instances).toHaveLength(2);
    expect(shared?.physical).toEqual({ surfaceArea: null, volume: null });
  });

  it('sets assembly physical values to null and computes part physicals', () => {
    const part: Label = {
      entry: '8:1',
      name: 'Part',
      kind: 'part',
      shape: { surfaceArea: 50, volume: -5 },
    };
    part.GetLabelName = () => part.name ?? '';

    const root: Label = {
      entry: '8:0',
      name: 'Root',
      kind: 'assembly',
      components: [part],
    };
    root.GetLabelName = () => root.name ?? '';

    const oc = createOcStub([root]) as any;
    class GProps {
      mass = 0;
      Mass() {
        return this.mass;
      }
      delete() {}
    }
    oc.GProp_GProps_1 = GProps;
    oc.BRepGProp = {
      SurfaceProperties_1: (shape: any, props: any) => {
        props.mass = shape.surfaceArea ?? 0;
      },
      VolumeProperties_1: (shape: any, props: any) => {
        props.mass = shape.volume ?? 0;
      },
    };

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc, docHandle as any, undefined, {
      scaleToMeters: 1,
    });

    expect(nodeMap.nodes['8:0'].physical).toEqual({
      surfaceArea: null,
      volume: null,
    });
    expect(nodeMap.nodes['8:0/8:1'].physical).toEqual({
      surfaceArea: 50,
      volume: 5,
    });
  });

  it('applies unit conversion and computes once per repeated product', () => {
    const product: Label = {
      entry: '9:1',
      name: 'Shared',
      kind: 'part',
      shape: { surfaceArea: 2000, volume: 1000 },
    };
    product.GetLabelName = () => product.name ?? '';

    const instanceA: Label = {
      entry: '9:1:1',
      kind: 'part',
      isComponent: true,
      referred: product,
    };
    const instanceB: Label = {
      entry: '9:1:2',
      kind: 'part',
      isComponent: true,
      referred: product,
    };

    const root: Label = {
      entry: '9:0',
      kind: 'assembly',
      components: [instanceA, instanceB],
    };

    const oc = createOcStub([root]) as any;
    const calls = { surface: 0, volume: 0 };
    class GProps {
      mass = 0;
      Mass() {
        return this.mass;
      }
      delete() {}
    }
    oc.GProp_GProps_1 = GProps;
    oc.BRepGProp = {
      SurfaceProperties_1: (shape: any, props: any) => {
        calls.surface += 1;
        props.mass = shape.surfaceArea ?? 0;
      },
      VolumeProperties_1: (shape: any, props: any) => {
        calls.volume += 1;
        props.mass = shape.volume ?? 0;
      },
    };

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const bom = buildBom(oc, docHandle as any, undefined, {
      scaleToMeters: 0.001,
    });
    const shared = bom.items.find((item) => item.productId === '9:1');

    expect(calls.surface).toBe(1);
    expect(calls.volume).toBe(1);
    expect(shared?.quantity).toBe(2);
    expect(shared?.physical.surfaceArea).toBeCloseTo(0.002);
    expect(shared?.physical.volume).toBeCloseTo(0.000001);
  });

  it('returns null physical values when OCCT property calls fail', () => {
    const root: Label = {
      entry: '10:0',
      kind: 'part',
      shape: { surfaceArea: 12, volume: 5 },
    };

    const oc = createOcStub([root]) as any;
    class GProps {
      Mass() {
        return 0;
      }
      delete() {}
    }
    oc.GProp_GProps_1 = GProps;
    oc.BRepGProp = {
      SurfaceProperties_1: () => {
        throw new Error('surface fail');
      },
      VolumeProperties_1: () => {
        throw new Error('volume fail');
      },
    };

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc, docHandle as any, undefined, {
      scaleToMeters: 1,
    });
    expect(nodeMap.nodes['10:0'].physical).toEqual({
      surfaceArea: null,
      volume: null,
    });
  });

  it('uses Handle_TDF_Attribute_1 when Handle_TDataStd_Name_1 is unavailable', () => {
    const root: Label = { entry: '11:0', kind: 'part' };
    root.FindAttribute_1 = (_guid, handle) => {
      handle.value = { Get: () => 'AttrName' };
      return true;
    };

    const oc = createOcStub([root], { withNameHandle: false });
    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any);

    expect(nodeMap.nodes['11:0'].name).toBe('AttrName');
  });

  it('returns null physical values when gprops constructor is missing', () => {
    const root: Label = {
      entry: '12:0',
      kind: 'part',
      shape: { surfaceArea: 1, volume: 1 },
    };
    const oc = createOcStub([root]) as any;
    delete oc.GProp_GProps_1;
    delete oc.GProp_GProps;
    oc.BRepGProp = {
      SurfaceProperties_1: vi.fn(),
      VolumeProperties_1: vi.fn(),
    };

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any, undefined, {
      scaleToMeters: 1,
    });

    expect(nodeMap.nodes['12:0'].physical).toEqual({
      surfaceArea: null,
      volume: null,
    });
  });

  it('returns null physical values when BRepGProp is unavailable', () => {
    const root: Label = {
      entry: '13:0',
      kind: 'part',
      shape: { surfaceArea: 1, volume: 1 },
    };
    const oc = createOcStub([root]) as any;
    class GProps {
      Mass() {
        return 0;
      }
      delete() {}
    }
    oc.GProp_GProps_1 = GProps;
    delete oc.BRepGProp;

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any, undefined, {
      scaleToMeters: 1,
    });

    expect(nodeMap.nodes['13:0'].physical).toEqual({
      surfaceArea: null,
      volume: null,
    });
  });

  it('returns null physical values when GetShape_2 is unavailable or throws', () => {
    const rootA: Label = {
      entry: '14:0',
      kind: 'part',
      shape: { surfaceArea: 1, volume: 1 },
    };
    const ocA = createOcStub([rootA]) as any;
    delete ocA.XCAFDoc_ShapeTool.GetShape_2;
    class GPropsA {
      Mass() {
        return 0;
      }
      delete() {}
    }
    ocA.GProp_GProps_1 = GPropsA;
    ocA.BRepGProp = {
      SurfaceProperties_1: vi.fn(),
      VolumeProperties_1: vi.fn(),
    };

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMapA = buildNodeMap(ocA as any, docHandle as any, undefined, {
      scaleToMeters: 1,
    });
    expect(nodeMapA.nodes['14:0'].physical).toEqual({
      surfaceArea: null,
      volume: null,
    });

    const rootB: Label = {
      entry: '14:1',
      kind: 'part',
      shape: { surfaceArea: 1, volume: 1 },
    };
    const ocB = createOcStub([rootB]) as any;
    ocB.XCAFDoc_ShapeTool.GetShape_2 = () => {
      throw new Error('shape fail');
    };
    class GPropsB {
      Mass() {
        return 0;
      }
      delete() {}
    }
    ocB.GProp_GProps_1 = GPropsB;
    ocB.BRepGProp = {
      SurfaceProperties_1: vi.fn(),
      VolumeProperties_1: vi.fn(),
    };
    const nodeMapB = buildNodeMap(ocB as any, docHandle as any, undefined, {
      scaleToMeters: 1,
    });
    expect(nodeMapB.nodes['14:1'].physical).toEqual({
      surfaceArea: null,
      volume: null,
    });
  });

  it('falls back to non-suffixed BRepGProp overloads', () => {
    const root: Label = {
      entry: '15:0',
      kind: 'part',
      shape: { surfaceArea: 10, volume: 20 },
    };
    const oc = createOcStub([root]) as any;
    class GProps {
      mass = 0;
      Mass() {
        return this.mass;
      }
      delete() {}
    }
    oc.GProp_GProps_1 = GProps;
    oc.BRepGProp = {
      SurfaceProperties: (shape: any, props: any) => {
        props.mass = shape.surfaceArea;
      },
      VolumeProperties: (shape: any, props: any) => {
        props.mass = shape.volume;
      },
    };

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any, undefined, {
      scaleToMeters: 1,
    });

    expect(nodeMap.nodes['15:0'].physical).toEqual({
      surfaceArea: 10,
      volume: 20,
    });
  });

  it('returns null physical values when mass calculation throws and delete throws', () => {
    const root: Label = {
      entry: '16:0',
      kind: 'part',
      shape: { surfaceArea: 10, volume: 20 },
    };
    const oc = createOcStub([root]) as any;
    class GProps {
      Mass() {
        throw new Error('mass fail');
      }
      delete() {
        throw new Error('delete fail');
      }
    }
    oc.GProp_GProps_1 = GProps;
    oc.BRepGProp = {
      SurfaceProperties_1: vi.fn(),
      VolumeProperties_1: vi.fn(),
    };

    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any, undefined, {
      scaleToMeters: 1,
    });
    expect(nodeMap.nodes['16:0'].physical).toEqual({
      surfaceArea: null,
      volume: null,
    });
  });

  it('resolves label names from attributes and label getters', () => {
    const makeExtended = (text: string) => ({
      Length: () => text.length,
      Value: (index: number) => text.charCodeAt(index - 1),
    });

    const root: Label = { entry: '3:0', kind: 'assembly' };
    root.FindAttribute_1 = (_guid, handle) => {
      handle.value = { Get: () => makeExtended('RootAttr') };
      return true;
    };

    const childA: Label = { entry: '3:0:1', kind: 'part' };
    childA.FindAttribute_1 = (_guid, handle) => {
      handle.value = {
        Get: () => {
          throw new Error('nope');
        },
        Get_1: () => ({
          Length: () => 0,
          Value: () => 0,
        }),
        Get_2: () => ({
          ToCString: () => 'AttrCString',
        }),
      };
      return true;
    };

    const childB: Label = { entry: '3:0:2', kind: 'part' };
    childB.FindAttribute_1 = () => true;
    childB.GetLabelName = () => ({ ToString: () => 'LabelToString' } as any);

    const childC: Label = { entry: '3:0:3', kind: 'part' };
    childC.GetLabelName = () => {
      throw new Error('bad');
    };
    childC.GetName = () => ({ toString: () => 'LabeltoString' } as any);

    const childD: Label = { entry: '3:0:4', kind: 'part' };
    childD.GetLabelName_1 = () => 'SimpleLabel';

    const childE: Label = { entry: '3:0:5', kind: 'part' };
    childE.FindAttribute_1 = (_guid, handle) => {
      handle.value = {
        Get: () => ({
          Length: () => {
            throw new Error('length');
          },
          Value: () => 0,
        }),
      };
      return true;
    };

    root.components = [childA, childB, childC, childD, childE];

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);

    expect(nodeMap.nodes['3:0'].name).toBe('RootAttr');
    expect(nodeMap.nodes['3:0/3:0:1'].name).toBe('AttrCString');
    expect(nodeMap.nodes['3:0/3:0:2'].name).toBe('LabelToString');
    expect(nodeMap.nodes['3:0/3:0:3'].name).toBe('LabeltoString');
    expect(nodeMap.nodes['3:0/3:0:4'].name).toBe('SimpleLabel');
  });

  it('handles missing name attributes and blank entries', () => {
    const root: Label = { entry: '', kind: 'part' };

    const oc = createOcStub([root], { withNameAttr: false });
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.roots).toEqual([]);
  });

  it('falls back when attribute lookup returns false or throws', () => {
    const root: Label = { entry: '5:0', kind: 'assembly' };
    root.FindAttribute_1 = () => false;
    root.GetLabelName = () => 'LabelName';

    const child: Label = { entry: '5:0:1', kind: 'part' };
    child.FindAttribute_1 = () => {
      throw new Error('boom');
    };
    child.GetLabelName = () => 'ChildName';

    root.components = [child];

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.nodes['5:0'].name).toBe('LabelName');
    expect(nodeMap.nodes['5:0/5:0:1'].name).toBe('ChildName');
  });

  it('handles attribute handles without get()', () => {
    const root: Label = { entry: '6:0', kind: 'part' };
    root.FindAttribute_1 = (_guid, handle) => {
      handle.value = { Get: () => 'Ignored' };
      return true;
    };
    root.GetLabelName = () => 'FallbackLabel';

    const oc = createOcStub([root], { handleHasGet: false });
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.nodes['6:0'].name).toBe('FallbackLabel');
  });

  it('stringifies non-string label entries', () => {
    const root: Label = { entry: 123 as unknown as string, kind: 'part' };
    root.GetLabelName = () => 'Label';

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.roots).toEqual(['123']);
  });

  it('uses fallback string conversions for label values', () => {
    const root: Label = { entry: '7:0', kind: 'assembly' };
    root.GetLabelName = () => ({ ToCString: () => 123 } as any);

    const childA: Label = { entry: '7:0:1', kind: 'part' };
    childA.GetLabelName = () => ({ ToString: () => 456 } as any);

    const childB: Label = { entry: '7:0:2', kind: 'part' };
    childB.GetLabelName = () => ({ toString: () => '[object Object]' } as any);

    root.components = [childA, childB];

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };

    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.nodes['7:0'].name).toBe('123');
    expect(nodeMap.nodes['7:0/7:0:1'].name).toBe('456');
    expect(nodeMap.nodes['7:0/7:0:2'].name).toBe('7:0:2');
  });

  it('handles fallback conversion failures and returns entry names', () => {
    const root: Label = { entry: '17:0', kind: 'part' };
    root.GetLabelName = () =>
      ({
        ToCString: () => {
          throw new Error('cstr fail');
        },
        ToString: () => {
          throw new Error('str fail');
        },
        toString: () => '[object Object]',
      }) as any;

    const child: Label = { entry: '17:1', kind: 'part' };
    child.GetLabelName = () => ({}) as any;

    const assembly: Label = {
      entry: '17:a',
      kind: 'assembly',
      components: [root, child],
    };

    const oc = createOcStub([assembly]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any);

    expect(nodeMap.nodes['17:a/17:0'].name).toBe('17:0');
    expect(nodeMap.nodes['17:a/17:1'].name).toBe('17:1');
  });

  it('handles ToString fallback throwing', () => {
    const root: Label = { entry: '18:0', kind: 'part' };
    root.GetLabelName = () =>
      ({
        ToString: () => {
          throw new Error('toString fail');
        },
        toString: () => '[object Object]',
      }) as any;

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.nodes['18:0'].name).toBe('18:0');
  });

  it('returns empty fallback when value has no string conversion methods', () => {
    const root: Label = { entry: '19:0', kind: 'part' };
    root.GetLabelName = () => Object.create(null) as any;

    const oc = createOcStub([root]);
    const docHandle = { get: () => ({ Main: () => ({}) }) };
    const nodeMap = buildNodeMap(oc as any, docHandle as any);
    expect(nodeMap.nodes['19:0'].name).toBe('19:0');
  });
});
