import type {
  InputFormat,
  LoaderOptions,
  NameFormat,
  ReadOptions,
  TriangulateOptions,
  WriteOptions,
  OutputFormat,
  OpenCascadeInstance,
} from '../core/types';
import { readCadBuffer, type OcctDocumentHandle } from '../core/document';
import { triangulateDocument } from '../core/triangulation';
import { writeDocumentToBuffer } from '../core/writer';
import { buildBom, buildNodeMap } from '../core/assembly';
import { extractNameOverridesFromGlb } from '../core/gltf-names';
import { getOpenCascade } from '../core/loader-browser';

export class OpenCascadeConverter {
  constructor(private readonly oc: OpenCascadeInstance) {}

  readBuffer(input: Uint8Array, format: InputFormat, options?: ReadOptions): OcctDocumentHandle {
    return readCadBuffer(this.oc, input, format, options);
  }

  triangulate(doc: any, options?: TriangulateOptions) {
    triangulateDocument(this.oc, doc, options);
  }

  writeBuffer(docHandle: OcctDocumentHandle, format: OutputFormat, options?: WriteOptions) {
    return writeDocumentToBuffer(this.oc, docHandle, format, options);
  }

  createNodeMap(docHandle: OcctDocumentHandle) {
    return buildNodeMap(this.oc, docHandle);
  }

  createBom(docHandle: OcctDocumentHandle) {
    return buildBom(this.oc, docHandle);
  }

  createMetadataFromGlb(
    docHandle: OcctDocumentHandle,
    options?: { nameFormat?: NameFormat }
  ) {
    const glbResult = writeDocumentToBuffer(this.oc, docHandle, 'glb', {
      nameFormat: options?.nameFormat ?? 'productAndInstanceAndOcaf',
    });
    if (glbResult.outputFormat !== 'glb') {
      throw new Error('Expected GLB buffer when extracting metadata.');
    }
    const overrides = extractNameOverridesFromGlb(glbResult.glb);
    return {
      nodeMap: buildNodeMap(this.oc, docHandle, overrides),
      bom: buildBom(this.oc, docHandle, overrides),
    };
  }

}

export async function createConverter(options?: LoaderOptions) {
  const oc = await getOpenCascade(options);
  return new OpenCascadeConverter(oc);
}
