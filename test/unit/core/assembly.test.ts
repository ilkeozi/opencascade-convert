import { describe, expect, it } from 'vitest';

import { buildAssemblyTree, buildBom, buildNodeMap } from '../../../src/core/assembly';

type Label = {
  entry: string;
  name?: string;
  kind?: 'assembly' | 'part';
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

const createOcStub = (roots: Label[], options?: { withNameAttr?: boolean; withNameHandle?: boolean }) => {
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
      return this.value;
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
});
