import type { TriangulateOptions, OpenCascadeInstance } from './types';

/**
 * OCCT document (raw or handle target).
 */
export type OcctDocument = any;

const env =
  typeof process !== 'undefined' && typeof process.env !== 'undefined'
    ? process.env
    : undefined;
const DEBUG_TRIANGULATION = env?.OCCT_CONVERT_DEBUG === '1';

// Default meshing parameters used when caller provides no overrides.
const DEFAULT_TRIANGULATE_OPTIONS: Required<TriangulateOptions> = {
  linearDeflection: 1, // Absolute deflection (model units).
  angularDeflection: 0.5, // Radians; coarse default to balance speed/detail.
  relative: false, // Absolute deflection is more predictable for CAD data.
  parallel: true, // Prefer parallel meshing when supported.
};

/**
 * Performs meshing on all free shapes in the document.
 * @param oc OpenCascade instance.
 * @param doc OCCT document.
 * @param options Triangulation settings.
 */
export function triangulateDocument(
  oc: OpenCascadeInstance,
  doc: OcctDocument,
  options: TriangulateOptions = {}
) {
  const settings = {
    linearDeflection:
      options.linearDeflection ?? DEFAULT_TRIANGULATE_OPTIONS.linearDeflection,
    angularDeflection:
      options.angularDeflection ?? DEFAULT_TRIANGULATE_OPTIONS.angularDeflection,
    relative: options.relative ?? DEFAULT_TRIANGULATE_OPTIONS.relative,
    parallel: options.parallel ?? DEFAULT_TRIANGULATE_OPTIONS.parallel,
  };
  if (DEBUG_TRIANGULATION) {
    console.log('[opencascade-convert] triangulation.settings', settings);
  }
  const tool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
  const builder = new oc.BRep_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  const sequence = new oc.TDF_LabelSequence_1();
  tool.GetFreeShapes(sequence);

  for (let index = sequence.Lower(); index <= sequence.Upper(); index += 1) {
    const label = sequence.Value(index);
    const shape = oc.XCAFDoc_ShapeTool.GetShape_2(label);
    if (shape) {
      builder.Add(compound, shape);
    }
  }

  new oc.BRepMesh_IncrementalMesh_2(
    compound,
    settings.linearDeflection,
    settings.relative,
    settings.angularDeflection,
    settings.parallel
  );
}
