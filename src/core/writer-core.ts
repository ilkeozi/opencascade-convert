import { resolveNameFormatKey } from './name-format';
import { applyLengthUnitConversionToWriter } from './unit-scale';
import type { WriteOptions, OpenCascadeInstance } from './types';
import type { OcctDocumentHandle } from './document';

/**
 * Builds an OCCT string map from key/value metadata pairs.
 */
export function createMetadataMap(
  oc: OpenCascadeInstance,
  metadata?: Record<string, string>
) {
  const map = new oc.TColStd_IndexedDataMapOfStringString_1();
  if (!metadata) {
    return map;
  }
  Object.entries(metadata).forEach(([key, value]) => {
    const k = new oc.TCollection_AsciiString_2(key);
    const v = new oc.TCollection_AsciiString_2(value);
    map.Add(k, v);
  });
  return map;
}

/**
 * Applies the name format to the writer when supported.
 */
export function applyGltfNameFormat(
  oc: OpenCascadeInstance,
  writer: any,
  options: WriteOptions
) {
  if (!writer || typeof writer.SetNodeNameFormat !== 'function') {
    return;
  }
  const formatKey = resolveNameFormatKey(options.nameFormat);
  const format = oc.RWMesh_NameFormat[formatKey];
  writer.SetNodeNameFormat(format);
  if (typeof writer.SetMeshNameFormat === 'function') {
    writer.SetMeshNameFormat(format);
  }
}

function applyLengthUnitConversion(writer: any, options: WriteOptions) {
  const scale = options.unitScaleToMeters;
  if (!Number.isFinite(scale) || (scale as number) <= 0) {
    return;
  }
  applyLengthUnitConversionToWriter(writer, scale as number);
}

/**
 * Writes a GLB file to the OCCT virtual FS and returns its bytes.
 */
export function writeGlbInternal(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  pathInternal: string,
  options: WriteOptions
) {
  const map = createMetadataMap(oc, options.metadata);
  const progress = new oc.Message_ProgressRange_1();
  const file = new oc.TCollection_AsciiString_2(pathInternal);
  const writer = new oc.RWGltf_CafWriter(file, true); // true => GLB (binary)
  applyGltfNameFormat(oc, writer, options);
  applyLengthUnitConversion(writer, options);
  if (writer && typeof writer.SetMergeFaces === 'function') {
    try {
      writer.SetMergeFaces(true);
    } catch {
      // Best-effort: bindings may expose the method but not support it.
    }
  }
  writer.Perform_2(docHandle, map, progress);
  const data =
    oc.FS.analyzePath(pathInternal).exists && oc.FS.readFile(pathInternal);
  if (data) {
    oc.FS.unlink(pathInternal);
  }
  return data;
}

/**
 * Writes a glTF + BIN pair to the OCCT virtual FS and returns their bytes.
 */
export function writeGltfInternal(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  gltfPath: string,
  options: WriteOptions
) {
  const binPath = `${gltfPath.substring(0, gltfPath.lastIndexOf('.'))}.bin`;
  const map = createMetadataMap(oc, options.metadata);
  const progress = new oc.Message_ProgressRange_1();
  const file = new oc.TCollection_AsciiString_2(gltfPath);
  const writer = new oc.RWGltf_CafWriter(file, false); // false => glTF + BIN
  applyGltfNameFormat(oc, writer, options);
  applyLengthUnitConversion(writer, options);
  if (writer && typeof writer.SetMergeFaces === 'function') {
    try {
      writer.SetMergeFaces(true);
    } catch {
      // Best-effort: bindings may expose the method but not support it.
    }
  }
  writer.Perform_2(docHandle, map, progress);
  const gltfData =
    oc.FS.analyzePath(gltfPath).exists && oc.FS.readFile(gltfPath);
  const binData = oc.FS.analyzePath(binPath).exists && oc.FS.readFile(binPath);
  if (gltfData) {
    oc.FS.unlink(gltfPath);
  }
  if (binData) {
    oc.FS.unlink(binPath);
  }
  return { gltfData, binData, binPath };
}

/**
 * Writes an OBJ file to the OCCT virtual FS and returns its bytes.
 */
export function writeObjInternal(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  pathInternal: string,
  options: WriteOptions
) {
  const map = createMetadataMap(oc, options.metadata);
  const progress = new oc.Message_ProgressRange_1();
  const file = new oc.TCollection_AsciiString_2(pathInternal);
  const writer = new oc.RWObj_CafWriter(file);
  writer.Perform_2(docHandle, map, progress);
  const data =
    oc.FS.analyzePath(pathInternal).exists && oc.FS.readFile(pathInternal);
  if (data) {
    oc.FS.unlink(pathInternal);
  }
  return data;
}
