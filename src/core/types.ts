export type OutputFormat = 'obj' | 'gltf' | 'glb';

export type InputFormat = 'step' | 'iges';

export type OpenCascadeInstance = any;

export type ReadOptions = {
  preserveNames?: boolean;
  preserveColors?: boolean;
  preserveLayers?: boolean;
  preserveMaterials?: boolean;
};

export type TriangulateOptions = {
  linearDeflection?: number;
  angularDeflection?: number;
  relative?: boolean;
  parallel?: boolean;
};

export type WriteOptions = {
  metadata?: Record<string, string>;
  nameFormat?: NameFormat;
  unitScaleToMeters?: number;
};

export type BinaryData = Uint8Array;

export type ConvertBufferResult =
  | { outputFormat: 'glb'; glb: BinaryData }
  | { outputFormat: 'gltf'; gltf: BinaryData; bin: BinaryData }
  | { outputFormat: 'obj'; obj: BinaryData };

export type LoaderOptions = {
  cache?: boolean;
};

export type NameFormat =
  | 'empty'
  | 'product'
  | 'instance'
  | 'instanceOrProduct'
  | 'productOrInstance'
  | 'productAndInstance'
  | 'productAndInstanceAndOcaf';

export type AssemblyNodeKind = 'assembly' | 'part';

export type AssemblyNode = {
  id: string;
  labelEntry: string;
  name: string;
  kind: AssemblyNodeKind;
  productId: string;
  productName: string;
  parentId: string | null;
  children: string[];
  path: string[];
};

export type NodeMap = {
  roots: string[];
  nodes: Record<string, AssemblyNode>;
};

export type BomOccurrence = {
  nodeId: string;
  instanceId: string;
  name: string;
  path: string[];
};

export type BomItem = {
  productId: string;
  productName: string;
  kind: AssemblyNodeKind;
  quantity: number;
  instances: BomOccurrence[];
};

export type BomExport = {
  roots: string[];
  items: BomItem[];
};
