import { describe, expect, it, vi } from 'vitest';

import { applyReaderSettings, readCadBuffer } from '../../../src/core/document';
import { ConversionError } from '../../../src/core/errors';

type ReaderInstance = {
  ReadFile: ReturnType<typeof vi.fn>;
  Transfer_1?: ReturnType<typeof vi.fn>;
  Transfer?: ReturnType<typeof vi.fn>;
  SetNameMode?: ReturnType<typeof vi.fn>;
  SetNameMode_1?: ReturnType<typeof vi.fn>;
  SetColorMode?: ReturnType<typeof vi.fn>;
  SetLayerMode?: ReturnType<typeof vi.fn>;
  SetLayerMode_2?: ReturnType<typeof vi.fn>;
  SetMatMode?: ReturnType<typeof vi.fn>;
};

const createOcStub = () => {
  const fs = {
    createDataFile: vi.fn(),
    unlink: vi.fn(),
  };

  class StepReader {
    static instances: ReaderInstance[] = [];
    static nextResult = 1;
    ReadFile = vi.fn(() => StepReader.nextResult);
    Transfer_1 = vi.fn();
    SetNameMode = vi.fn();
    SetColorMode = vi.fn();
    SetLayerMode = vi.fn();
    SetMatMode = vi.fn();
    constructor() {
      StepReader.instances.push(this);
    }
  }

  class IgesReader {
    static instances: ReaderInstance[] = [];
    static nextResult = 1;
    ReadFile = vi.fn(() => IgesReader.nextResult);
    Transfer = vi.fn();
    SetNameMode = vi.fn();
    SetColorMode = vi.fn();
    SetLayerMode = vi.fn();
    SetMatMode = vi.fn();
    constructor() {
      IgesReader.instances.push(this);
    }
  }

  const oc = {
    FS: fs,
    IFSelect_ReturnStatus: { IFSelect_RetDone: 1 },
    STEPCAFControl_Reader_1: StepReader,
    IGESCAFControl_Reader_1: IgesReader,
    TCollection_ExtendedString_1: class {},
    TDocStd_Document: class {
      constructor(public fmt: unknown) {}
    },
    Handle_TDocStd_Document_2: class {
      constructor(public doc: unknown) {}
    },
    Message_ProgressRange_1: class {},
  };

  return { oc, fs, StepReader, IgesReader };
};

describe('document', () => {
  it('applyReaderSettings prefers available overloads', () => {
    const reader: ReaderInstance = {
      SetNameMode: vi.fn(() => {
        throw new Error('nope');
      }),
      SetNameMode_1: vi.fn(),
      SetColorMode: vi.fn(),
      SetLayerMode_2: vi.fn(),
      SetMatMode: vi.fn(),
    };

    applyReaderSettings(reader, {
      preserveNames: true,
      preserveColors: true,
      preserveLayers: true,
      preserveMaterials: true,
    });

    expect(reader.SetNameMode).toHaveBeenCalledWith(true);
    expect(reader.SetNameMode_1).toHaveBeenCalledWith(true);
    expect(reader.SetColorMode).toHaveBeenCalledWith(true);
    expect(reader.SetLayerMode_2).toHaveBeenCalledWith(true);
    expect(reader.SetMatMode).toHaveBeenCalledWith(true);
  });

  it('applyReaderSettings tolerates missing readers', () => {
    expect(() =>
      applyReaderSettings(undefined as any, {
        preserveNames: true,
        preserveColors: true,
        preserveLayers: true,
        preserveMaterials: true,
      })
    ).not.toThrow();
  });

  it('applyReaderSettings tolerates readers without matching setters', () => {
    expect(() =>
      applyReaderSettings({} as any, {
        preserveNames: true,
        preserveColors: true,
        preserveLayers: true,
        preserveMaterials: true,
      })
    ).not.toThrow();
  });

  it('readCadBuffer uses STEP reader and Transfer_1', () => {
    const { oc, fs, StepReader } = createOcStub();
    StepReader.nextResult = oc.IFSelect_ReturnStatus.IFSelect_RetDone;

    const result = readCadBuffer(
      oc as any,
      new Uint8Array([1, 2]),
      'step'
    );

    const reader = StepReader.instances[0] as ReaderInstance;
    expect(reader?.Transfer_1).toHaveBeenCalled();
    expect(fs.createDataFile).toHaveBeenCalledWith(
      '.',
      'file.stp',
      expect.any(Uint8Array),
      true,
      true,
      true
    );
    expect(fs.unlink).toHaveBeenCalledWith('./file.stp');
    expect(result).toBeInstanceOf(oc.Handle_TDocStd_Document_2);
  });

  it('readCadBuffer uses IGES reader and Transfer when needed', () => {
    const { oc, IgesReader } = createOcStub();
    IgesReader.nextResult = oc.IFSelect_ReturnStatus.IFSelect_RetDone;

    readCadBuffer(oc as any, new Uint8Array([3, 4]), 'iges');

    const reader = IgesReader.instances[0] as ReaderInstance;
    expect(reader?.Transfer).toHaveBeenCalled();
  });

  it('readCadBuffer throws ConversionError on failure', () => {
    const { oc, StepReader } = createOcStub();
    StepReader.nextResult = 0;

    expect(() =>
      readCadBuffer(oc as any, new Uint8Array([9]), 'step')
    ).toThrow(ConversionError);
  });
});
