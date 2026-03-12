import type {
  AssemblyNodeKind,
  BomExport,
  BomItem,
  BomOccurrence,
  NodeMap,
  OpenCascadeInstance,
  PhysicalProps,
} from './types';
import type { OcctDocumentHandle } from './document';
import { readInputUnitScaleToMeters } from './unit-scale';

type AssemblyBuildResult = {
  roots: string[];
  nodes: NodeMap['nodes'];
  occurrences: BomOccurrence[];
};

export type NameOverrideMap = Record<string, string>;
type BuildAssemblyOptions = {
  scaleToMeters?: number;
};

const NULL_PHYSICAL: PhysicalProps = {
  surfaceArea: null,
  volume: null,
};

export function buildNodeMap(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  nameOverrides?: NameOverrideMap,
  options: BuildAssemblyOptions = {}
): NodeMap {
  const { roots, nodes } = buildAssemblyGraph(
    oc,
    docHandle,
    nameOverrides,
    options
  );
  return { roots, nodes };
}

export function buildBom(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  nameOverrides?: NameOverrideMap,
  options: BuildAssemblyOptions = {}
): BomExport {
  const { roots, nodes, occurrences } = buildAssemblyGraph(
    oc,
    docHandle,
    nameOverrides,
    options
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
      physical: node.physical,
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
  nameOverrides?: NameOverrideMap,
  options: BuildAssemblyOptions = {}
): AssemblyBuildResult {
  const doc = docHandle.get ? docHandle.get() : docHandle;
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
  const roots = new oc.TDF_LabelSequence_1();
  shapeTool.GetFreeShapes(roots);
  const scaleToMeters = resolveScaleToMeters(oc, docHandle, options);
  const physicalByProductId = new Map<string, PhysicalProps>();

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
      nameOverrides,
      physicalByProductId,
      scaleToMeters
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
  nameOverrides?: NameOverrideMap,
  physicalByProductId?: Map<string, PhysicalProps>,
  scaleToMeters = 1
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
  const productId = productEntry || instanceEntry;
  const physical = resolvePhysical(
    oc,
    kind,
    productId,
    productLabel,
    physicalByProductId,
    scaleToMeters
  );

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
      productId,
      productName:
        productOverride ||
        productName ||
        instanceOverride ||
        instanceName ||
        instanceEntry,
      parentId: parentNodeId,
      children: [],
      path,
      physical,
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
      traverseLabel(
        oc,
        component,
        path,
        nodes,
        occurrences,
        nameOverrides,
        physicalByProductId,
        scaleToMeters
      );
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

function resolveScaleToMeters(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  options: BuildAssemblyOptions
) {
  if (
    Number.isFinite(options.scaleToMeters) &&
    (options.scaleToMeters as number) > 0
  ) {
    return options.scaleToMeters as number;
  }
  return readInputUnitScaleToMeters(oc, docHandle).scaleToMeters;
}

function resolvePhysical(
  oc: OpenCascadeInstance,
  kind: AssemblyNodeKind,
  productId: string,
  productLabel: any,
  physicalByProductId: Map<string, PhysicalProps> | undefined,
  scaleToMeters: number
) {
  if (kind === 'assembly') {
    return NULL_PHYSICAL;
  }

  const cached = physicalByProductId?.get(productId);
  if (cached) {
    return cached;
  }

  const computed = computePhysicalForLabel(oc, productLabel, scaleToMeters);
  physicalByProductId?.set(productId, computed);
  return computed;
}

function computePhysicalForLabel(
  oc: OpenCascadeInstance,
  label: any,
  scaleToMeters: number
): PhysicalProps {
  const shape = tryGetShape(oc, label);
  if (!shape) {
    return NULL_PHYSICAL;
  }

  const gpropsCtor = oc?.GProp_GProps_1 ?? oc?.GProp_GProps;
  if (typeof gpropsCtor !== 'function') {
    return NULL_PHYSICAL;
  }

  const areaProps = new gpropsCtor();
  const volumeProps = new gpropsCtor();

  try {
    const hasArea = tryComputeSurfaceProperties(oc, shape, areaProps);
    const hasVolume = tryComputeVolumeProperties(oc, shape, volumeProps);
    const scale = Number.isFinite(scaleToMeters) && scaleToMeters > 0
      ? scaleToMeters
      : 1;
    const areaFactor = scale * scale;
    const volumeFactor = areaFactor * scale;

    const surfaceAreaRaw = hasArea ? safeFinite(areaProps.Mass()) : null;
    const surfaceArea =
      surfaceAreaRaw == null ? null : surfaceAreaRaw * areaFactor;
    const volumeRaw = hasVolume ? safeFinite(volumeProps.Mass()) : null;
    const volume =
      volumeRaw == null ? null : Math.abs(volumeRaw) * volumeFactor;

    return { surfaceArea, volume };
  } catch {
    return NULL_PHYSICAL;
  } finally {
    safeDelete(areaProps);
    safeDelete(volumeProps);
  }
}

function tryGetShape(oc: OpenCascadeInstance, label: any) {
  const getShape = oc?.XCAFDoc_ShapeTool?.GetShape_2;
  if (typeof getShape !== 'function') {
    return null;
  }
  try {
    return getShape(label);
  } catch {
    return null;
  }
}

function tryComputeSurfaceProperties(
  oc: OpenCascadeInstance,
  shape: any,
  props: any
) {
  const gprop = oc?.BRepGProp;
  if (!gprop) {
    return false;
  }
  return callWithOverloads(gprop, [
    ['SurfaceProperties_1', shape, props, false, false],
    ['SurfaceProperties', shape, props, false, false],
    ['SurfaceProperties_2', shape, props, 1e-6, false],
  ]);
}

function tryComputeVolumeProperties(
  oc: OpenCascadeInstance,
  shape: any,
  props: any
) {
  const gprop = oc?.BRepGProp;
  if (!gprop) {
    return false;
  }
  return callWithOverloads(gprop, [
    ['VolumeProperties_1', shape, props, true, false, false],
    ['VolumeProperties', shape, props, true, false, false],
    ['VolumeProperties_2', shape, props, 1e-6, true, false],
  ]);
}

function callWithOverloads(target: any, calls: Array<[string, ...any[]]>) {
  for (const [name, ...args] of calls) {
    const fn = target?.[name];
    if (typeof fn !== 'function') {
      continue;
    }
    try {
      fn.call(target, ...args);
      return true;
    } catch {
      // try next overload
    }
  }
  return false;
}

function safeFinite(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function safeDelete(value: any) {
  if (value && typeof value.delete === 'function') {
    try {
      value.delete();
    } catch {
      // ignore
    }
  }
}
