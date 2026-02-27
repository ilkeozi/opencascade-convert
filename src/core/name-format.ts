import type { NameFormat } from './types';

export const DEFAULT_NAME_FORMAT: NameFormat = 'productOrInstance';

export const NAME_FORMAT_KEYS: Record<NameFormat, string> = {
  empty: 'RWMesh_NameFormat_Empty',
  product: 'RWMesh_NameFormat_Product',
  instance: 'RWMesh_NameFormat_Instance',
  instanceOrProduct: 'RWMesh_NameFormat_InstanceOrProduct',
  productOrInstance: 'RWMesh_NameFormat_ProductOrInstance',
  productAndInstance: 'RWMesh_NameFormat_ProductAndInstance',
  productAndInstanceAndOcaf: 'RWMesh_NameFormat_ProductAndInstanceAndOcaf',
};

export function resolveNameFormatKey(nameFormat?: NameFormat) {
  return NAME_FORMAT_KEYS[nameFormat ?? DEFAULT_NAME_FORMAT] ?? NAME_FORMAT_KEYS[DEFAULT_NAME_FORMAT];
}
