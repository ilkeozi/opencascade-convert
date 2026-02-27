import type {
  AssemblyNodeKind,
  BomExport,
  BomItem,
  BomOccurrence,
  NodeMap,
  OpenCascadeInstance,
} from './types';
import type { OcctDocumentHandle } from './document';

type AssemblyBuildResult = {
  roots: string[];
  nodes: NodeMap['nodes'];
  occurrences: BomOccurrence[];
};

export type NameOverrideMap = Record<string, string>;

export function buildNodeMap(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  nameOverrides?: NameOverrideMap
): NodeMap {
  const { roots, nodes } = buildAssemblyGraph(oc, docHandle, nameOverrides);
  return { roots, nodes };
}

export function buildBom(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  nameOverrides?: NameOverrideMap
): BomExport {
  const { roots, nodes, occurrences } = buildAssemblyGraph(
    oc,
    docHandle,
    nameOverrides
  );
  const itemsByProduct = new Map<string, BomItem>();

  occurrences.forEach((occurrence) => {
    const node = nodes[occurrence.nodeId];
    if (!node) {
      return;
    }
    const existing = itemsByProduct.get(node.productId);
    if (existing) {
      existing.quantity += 1;
      existing.instances.push(occurrence);
      return;
    }
    itemsByProduct.set(node.productId, {
      productId: node.productId,
      productName: node.productName,
      kind: node.kind,
      quantity: 1,
      instances: [occurrence],
    });
  });

  return { roots, items: Array.from(itemsByProduct.values()) };
}

/**
 * Builds a nested assembly tree from a node map.
 * Missing node references are skipped.
 */
export function buildAssemblyTree(nodeMap: {
  roots: string[];
  nodes: Record<string, { id: string; name: string; children?: string[]; childrenIds?: string[] }>;
}) {
  const visit = (id: string): any => {
    const node = nodeMap.nodes[id];
    if (!node) return null;
    return {
      id: node.id,
      name: node.name,
      children: (node.childrenIds ?? node.children ?? [])
        .map((childId: string) => visit(childId))
        .filter(Boolean),
    };
  };
  return nodeMap.roots.map((id) => visit(id)).filter(Boolean);
}

function buildAssemblyGraph(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  nameOverrides?: NameOverrideMap
): AssemblyBuildResult {
  const doc = docHandle.get ? docHandle.get() : docHandle;
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
  const roots = new oc.TDF_LabelSequence_1();
  shapeTool.GetFreeShapes(roots);

  const nodes: NodeMap['nodes'] = {};
  const occurrences: BomOccurrence[] = [];
  const rootIds: string[] = [];

  for (let index = roots.Lower(); index <= roots.Upper(); index += 1) {
    const label = roots.Value(index);
    const nodeId = traverseLabel(
      oc,
      label,
      [],
      nodes,
      occurrences,
      nameOverrides
    );
    if (nodeId) {
      rootIds.push(nodeId);
    }
  }

  return { roots: rootIds, nodes, occurrences };
}

function traverseLabel(
  oc: OpenCascadeInstance,
  label: any,
  parentPath: string[],
  nodes: NodeMap['nodes'],
  occurrences: BomOccurrence[],
  nameOverrides?: NameOverrideMap
): string | null {
  const labelEntry = getLabelEntry(oc, label);
  const instanceName = resolveLabelName(oc, label);
  const { productLabel, productEntry, productName, kind } = resolveProduct(
    oc,
    label
  );
  const instanceEntry = labelEntry || productEntry;
  const path = [...parentPath, instanceEntry].filter(Boolean);
  const nodeId = path.join('/');
  const parentNodeId = parentPath.length > 0 ? parentPath.join('/') : null;

  if (!nodeId || !instanceEntry) {
    return null;
  }

  const instanceOverride = nameOverrides?.[instanceEntry];
  const productOverride = productEntry
    ? nameOverrides?.[productEntry]
    : undefined;

  if (!nodes[nodeId]) {
    nodes[nodeId] = {
      id: nodeId,
      labelEntry: instanceEntry,
      name:
        instanceOverride ||
        instanceName ||
        productOverride ||
        productName ||
        instanceEntry,
      kind,
      productId: productEntry || instanceEntry,
      productName:
        productOverride ||
        productName ||
        instanceOverride ||
        instanceName ||
        instanceEntry,
      parentId: parentNodeId,
      children: [],
      path,
    };
  }

  if (parentNodeId && nodes[parentNodeId]) {
    nodes[parentNodeId].children.push(nodeId);
  }

  occurrences.push({
    nodeId,
    instanceId: instanceEntry,
    name: nodes[nodeId].name,
    path,
  });

  if (kind === 'assembly') {
    const components = new oc.TDF_LabelSequence_1();
    oc.XCAFDoc_ShapeTool.GetComponents(productLabel, components, false);
    for (
      let index = components.Lower();
      index <= components.Upper();
      index += 1
    ) {
      const component = components.Value(index);
      traverseLabel(oc, component, path, nodes, occurrences, nameOverrides);
    }
  }

  return nodeId;
}

function resolveProduct(oc: OpenCascadeInstance, label: any) {
  let productLabel = label;
  if (
    oc.XCAFDoc_ShapeTool.IsComponent(label) ||
    oc.XCAFDoc_ShapeTool.IsReference(label)
  ) {
    const referred = new oc.TDF_Label();
    if (oc.XCAFDoc_ShapeTool.GetReferredShape(label, referred)) {
      productLabel = referred;
    }
  }

  const productEntry = getLabelEntry(oc, productLabel);
  const productName = resolveLabelName(oc, productLabel);
  const kind: AssemblyNodeKind = oc.XCAFDoc_ShapeTool.IsAssembly(productLabel)
    ? 'assembly'
    : 'part';

  return { productLabel, productEntry, productName, kind };
}

function resolveLabelName(oc: OpenCascadeInstance, label: any) {
  if (!label || !oc?.TDataStd_Name) {
    return '';
  }

  const readFromAttribute = () => {
    const handle = oc.Handle_TDataStd_Name_1
      ? new oc.Handle_TDataStd_Name_1()
      : new oc.Handle_TDF_Attribute_1();

    const guid = oc.TDataStd_Name.GetID();
    const findFns = [
      label.FindAttribute_1,
      label.FindAttribute,
      label.FindAttribute_2,
    ].filter((fn) => typeof fn === 'function') as Array<
      (guid: unknown, out: unknown) => boolean
    >;

    for (const fn of findFns) {
      try {
        const found = fn.call(label, guid, handle);
        if (!found) {
          continue;
        }
        if (typeof handle?.IsNull === 'function' && handle.IsNull()) {
          continue;
        }
        const attribute =
          typeof handle?.get === 'function' ? handle.get() : null;
        if (!attribute) {
          continue;
        }

        const getters = [
          attribute.Get,
          attribute.Get_1,
          attribute.Get_2,
        ].filter((g) => typeof g === 'function') as Array<() => unknown>;
        for (const getter of getters) {
          try {
            const value = getter.call(attribute);
            const text = extendedStringToString(value);
            if (text) {
              return text;
            }
          } catch {
            // try next getter
          }
        }
      } catch {
        // try next FindAttribute overload
      }
    }
    return '';
  };

  const readFromLabel = () => {
    const getters = [
      label.GetLabelName,
      label.GetLabelName_1,
      label.GetName,
      label.Name,
    ].filter((g) => typeof g === 'function') as Array<() => unknown>;
    for (const getter of getters) {
      try {
        const value = getter.call(label);
        const text = extendedStringToString(value);
        if (text) {
          return text;
        }
      } catch {
        // try next getter
      }
    }
    return '';
  };

  return readFromAttribute() || readFromLabel();
}

function getLabelEntry(oc: OpenCascadeInstance, label: any) {
  const entry = new oc.TCollection_AsciiString_1();
  oc.TDF_Tool.Entry(label, entry);
  const text = entry.ToCString();
  return typeof text === 'string' ? text : String(text ?? '');
}

function extendedStringToString(value: any) {
  if (
    !value ||
    typeof value.Length !== 'function' ||
    typeof value.Value !== 'function'
  ) {
    if (typeof value === 'string') {
      return value;
    }
    return fallbackString(value);
  }
  try {
    const length = value.Length();
    if (typeof length !== 'number' || length <= 0) {
      return '';
    }
    let result = '';
    for (let index = 1; index <= length; index += 1) {
      const code = value.Value(index);
      if (typeof code === 'number') {
        result += String.fromCharCode(code);
      }
    }
    return result;
  } catch {
    return fallbackString(value);
  }
}

function fallbackString(value: any) {
  if (value && typeof value.ToCString === 'function') {
    try {
      const text = value.ToCString();
      return typeof text === 'string' ? text : String(text ?? '');
    } catch {
      return '';
    }
  }
  if (value && typeof value.ToString === 'function') {
    try {
      const text = value.ToString();
      return typeof text === 'string' ? text : String(text ?? '');
    } catch {
      return '';
    }
  }
  if (value && typeof value.toString === 'function') {
    const text = value.toString();
    return text && text !== '[object Object]' ? String(text) : '';
  }
  return '';
}
