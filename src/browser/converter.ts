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

/**
 * Browser wrapper around an OpenCascade instance.
 * Methods delegate to core helpers without additional side effects.
 */
export class OpenCascadeConverter {
  constructor(private readonly oc: OpenCascadeInstance) {}

  /**
   * Reads a STEP/IGES buffer into an XCAF document handle.
   * @param input Raw file bytes.
   * @param format Input format ('step' or 'iges').
   * @param options Reader options.
   * @throws ConversionError when OCCT reader fails.
   */
  readBuffer(input: Uint8Array, format: InputFormat, options?: ReadOptions): OcctDocumentHandle {
    return readCadBuffer(this.oc, input, format, options);
  }

  /**
   * Triangulates the document in-place.
   * @param doc OCCT document or handle target.
   * @param options Triangulation settings.
   */
  triangulate(doc: any, options?: TriangulateOptions) {
    triangulateDocument(this.oc, doc, options);
  }

  /**
   * Serializes the document to the requested format.
   * @param docHandle XCAF document handle.
   * @param format Output format ('glb' | 'gltf' | 'obj').
   * @param options Writer options.
   * @throws ConversionError when output generation fails.
   */
  writeBuffer(docHandle: OcctDocumentHandle, format: OutputFormat, options?: WriteOptions) {
    return writeDocumentToBuffer(this.oc, docHandle, format, options);
  }

  /**
   * Builds a stable node map for the document.
   * @param docHandle XCAF document handle.
   */
  createNodeMap(docHandle: OcctDocumentHandle) {
    return buildNodeMap(this.oc, docHandle);
  }

  /**
   * Builds a BOM summary for the document.
   * @param docHandle XCAF document handle.
   */
  createBom(docHandle: OcctDocumentHandle) {
    return buildBom(this.oc, docHandle);
  }

  /**
   * Generates GLB output and derives metadata (node map + BOM) from it.
   * @param docHandle XCAF document handle.
   * @param options Metadata extraction options.
   * @throws Error when GLB output is not produced.
   */
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

/**
 * Loads OpenCascade (WASM) and returns a converter instance.
 * @param options Loader options (e.g. caching control).
 */
export async function createConverter(options?: LoaderOptions) {
  const oc = await getOpenCascade(options);
  return new OpenCascadeConverter(oc);
}
