import type {
  ConvertBufferResult,
  OutputFormat,
  WriteOptions,
  OpenCascadeInstance,
} from './types';
import { ConversionError } from './errors';
import type { OcctDocumentHandle } from './document';
import { writeGlbInternal, writeGltfInternal, writeObjInternal } from './writer-core';

export function writeDocumentToBuffer(
  oc: OpenCascadeInstance,
  docHandle: OcctDocumentHandle,
  format: OutputFormat,
  options: WriteOptions = {}
): ConvertBufferResult {
  if (format === 'glb') {
    const data = writeGlbInternal(oc, docHandle, './output.glb', options);
    if (!data) {
      throw new ConversionError('Failed to generate GLB output.');
    }
    return { outputFormat: 'glb', glb: toBinary(data) };
  }

  if (format === 'gltf') {
    const { gltfData, binData } = writeGltfInternal(oc, docHandle, './output.gltf', options);
    if (!gltfData || !binData) {
      throw new ConversionError('Failed to generate GLTF output.');
    }
    return { outputFormat: 'gltf', gltf: toBinary(gltfData), bin: toBinary(binData) };
  }

  const data = writeObjInternal(oc, docHandle, './output.obj', options);
  if (!data) {
    throw new ConversionError('Failed to generate OBJ output.');
  }
  return { outputFormat: 'obj', obj: toBinary(data) };
}

function toBinary(data: Uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data);
  }
  return data;
}
