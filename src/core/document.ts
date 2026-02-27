import type { InputFormat, ReadOptions, OpenCascadeInstance } from './types';
import { ConversionError } from './errors';

export type OcctDocumentHandle = any;

const DEFAULT_READ_OPTIONS: Required<ReadOptions> = {
  preserveNames: true,
  preserveColors: true,
  preserveLayers: true,
  preserveMaterials: true,
};

export function readCadBuffer(
  oc: OpenCascadeInstance,
  payload: Uint8Array,
  format: InputFormat,
  options: ReadOptions = {}
): OcctDocumentHandle {
  const fileName = format === 'step' ? 'file.stp' : 'file.igs';
  const reader =
    format === 'step'
      ? new oc.STEPCAFControl_Reader_1()
      : new oc.IGESCAFControl_Reader_1();
  applyReaderSettings(reader, { ...DEFAULT_READ_OPTIONS, ...options });
  return transferDocument(oc, reader, payload, fileName);
}

export function applyReaderSettings(reader: any, options: ReadOptions) {
  // OpenCascade.js sometimes binds overloaded methods with suffixes (e.g. `SetNameMode_1`).
  // Prefer the canonical name, but fall back to suffixed variants.
  if (options.preserveNames) {
    callReaderSetter(
      reader,
      ['SetNameMode', 'SetNameMode_1', 'SetNameMode_2'],
      true
    );
  }
  if (options.preserveColors) {
    callReaderSetter(
      reader,
      ['SetColorMode', 'SetColorMode_1', 'SetColorMode_2'],
      true
    );
  }
  if (options.preserveLayers) {
    callReaderSetter(
      reader,
      ['SetLayerMode', 'SetLayerMode_1', 'SetLayerMode_2'],
      true
    );
  }
  if (options.preserveMaterials) {
    callReaderSetter(
      reader,
      ['SetMatMode', 'SetMatMode_1', 'SetMatMode_2'],
      true
    );
  }
}

function callReaderSetter(reader: any, candidates: string[], value: boolean) {
  if (!reader) {
    return false;
  }
  for (const key of candidates) {
    const fn = reader[key];
    if (typeof fn !== 'function') {
      continue;
    }
    try {
      fn.call(reader, value);
      return true;
    } catch {
      // Try next overload.
    }
  }
  return false;
}

function transferDocument(
  oc: OpenCascadeInstance,
  reader: any,
  data: Uint8Array,
  fileName: string
): OcctDocumentHandle {
  const base = '.';
  const filePath = `./${fileName}`;
  oc.FS.createDataFile(base, fileName, data, true, true, true);

  const result = reader.ReadFile(filePath);
  oc.FS.unlink(filePath);

  if (result !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new ConversionError(`Could not read ${fileName} file`);
  }

  const format = new oc.TCollection_ExtendedString_1();
  const doc = new oc.TDocStd_Document(format);
  const docHandle = new oc.Handle_TDocStd_Document_2(doc);
  const progress = new oc.Message_ProgressRange_1();
  reader.Transfer_1
    ? reader.Transfer_1(docHandle, progress)
    : reader.Transfer(docHandle, progress);
  return docHandle;
}
