import type { NameFormat } from './types';

/**
 * Default name format used by the writer when none is specified.
 */
export const DEFAULT_NAME_FORMAT: NameFormat = 'productOrInstance';

/**
 * Maps public name format keys to OCCT RWMesh enum values.
 */
export const NAME_FORMAT_KEYS: Record<NameFormat, string> = {
  empty: 'RWMesh_NameFormat_Empty',
  product: 'RWMesh_NameFormat_Product',
  instance: 'RWMesh_NameFormat_Instance',
  instanceOrProduct: 'RWMesh_NameFormat_InstanceOrProduct',
  productOrInstance: 'RWMesh_NameFormat_ProductOrInstance',
  productAndInstance: 'RWMesh_NameFormat_ProductAndInstance',
  productAndInstanceAndOcaf: 'RWMesh_NameFormat_ProductAndInstanceAndOcaf',
};

/**
 * Resolves a name format to its OCCT RWMesh enum key.
 * Falls back to {@link DEFAULT_NAME_FORMAT} when input is undefined or invalid.
 */
export function resolveNameFormatKey(nameFormat?: NameFormat) {
  return NAME_FORMAT_KEYS[nameFormat ?? DEFAULT_NAME_FORMAT] ?? NAME_FORMAT_KEYS[DEFAULT_NAME_FORMAT];
}
