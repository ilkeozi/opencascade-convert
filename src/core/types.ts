/**
 * Supported output formats.
 */
export type OutputFormat = 'obj' | 'gltf' | 'glb';

/**
 * Supported input formats.
 */
export type InputFormat = 'step' | 'iges';

/**
 * Opaque OpenCascade.js instance (WASM bindings).
 */
export type OpenCascadeInstance = any;

/**
 * Reader options for STEP/IGES import.
 */
export type ReadOptions = {
  /**
   * Preserve product/instance names when available.
   */
  preserveNames?: boolean;
  /**
   * Preserve color information when available.
   */
  preserveColors?: boolean;
  /**
   * Preserve layer information when available.
   */
  preserveLayers?: boolean;
  /**
   * Preserve material information when available.
   */
  preserveMaterials?: boolean;
};

/**
 * Triangulation options for meshing.
 */
export type TriangulateOptions = {
  /**
   * Linear deflection (absolute distance).
   */
  linearDeflection?: number;
  /**
   * Angular deflection in radians.
   */
  angularDeflection?: number;
  /**
   * Use relative deflection (may be forced to false by higher-level APIs).
   */
  relative?: boolean;
  /**
   * Enable parallel meshing when supported.
   */
  parallel?: boolean;
};

/**
 * Writer options for glTF/GLB/OBJ export.
 */
export type WriteOptions = {
  /**
   * Custom metadata key/values mapped into the writer when supported.
   */
  metadata?: Record<string, string>;
  /**
   * Node naming format used by the writer.
   */
  nameFormat?: NameFormat;
  /**
   * Override output length unit scale (meters).
   */
  unitScaleToMeters?: number;
};

/**
 * Binary output payload.
 */
export type BinaryData = Uint8Array;

/**
 * Discriminated union of possible conversion outputs.
 */
export type ConvertBufferResult =
  | { outputFormat: 'glb'; glb: BinaryData }
  | { outputFormat: 'gltf'; gltf: BinaryData; bin: BinaryData }
  | { outputFormat: 'obj'; obj: BinaryData };

/**
 * OpenCascade loader options.
 */
export type LoaderOptions = {
  /**
   * Cache the OpenCascade instance between calls.
   */
  cache?: boolean;
};

/**
 * glTF node naming formats supported by OCCT writer.
 */
export type NameFormat =
  | 'empty'
  | 'product'
  | 'instance'
  | 'instanceOrProduct'
  | 'productOrInstance'
  | 'productAndInstance'
  | 'productAndInstanceAndOcaf';

/**
 * Assembly node kind.
 */
export type AssemblyNodeKind = 'assembly' | 'part';

/**
 * Assembly node metadata.
 */
export type AssemblyNode = {
  /**
   * Stable node id (path-based).
   */
  id: string;
  /**
   * OCAF label entry for this node.
   */
  labelEntry: string;
  /**
   * Display name.
   */
  name: string;
  /**
   * Node kind (assembly or part).
   */
  kind: AssemblyNodeKind;
  /**
   * Product identifier shared across instances.
   */
  productId: string;
  /**
   * Product display name.
   */
  productName: string;
  /**
   * Parent node id, or null for roots.
   */
  parentId: string | null;
  /**
   * Child node ids.
   */
  children: string[];
  /**
   * Node path segments.
   */
  path: string[];
};

/**
 * Node map with root ids and node dictionary.
 */
export type NodeMap = {
  /**
   * Root node ids.
   */
  roots: string[];
  /**
   * Node dictionary keyed by node id.
   */
  nodes: Record<string, AssemblyNode>;
};

/**
 * Single BOM occurrence (instance).
 */
export type BomOccurrence = {
  /**
   * Node id for this occurrence.
   */
  nodeId: string;
  /**
   * Instance id from OCAF entry.
   */
  instanceId: string;
  /**
   * Instance display name.
   */
  name: string;
  /**
   * Path of instance ids from root to this occurrence.
   */
  path: string[];
};

/**
 * Aggregated BOM item for a product.
 */
export type BomItem = {
  /**
   * Product id.
   */
  productId: string;
  /**
   * Product display name.
   */
  productName: string;
  /**
   * Product kind (assembly or part).
   */
  kind: AssemblyNodeKind;
  /**
   * Quantity of occurrences.
   */
  quantity: number;
  /**
   * Occurrence instances for this product.
   */
  instances: BomOccurrence[];
};

/**
 * BOM export with root nodes and aggregated items.
 */
export type BomExport = {
  /**
   * Root node ids.
   */
  roots: string[];
  /**
   * Aggregated BOM items.
   */
  items: BomItem[];
};
