import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as documentModule from '../../../src/core/document';
import * as triangulationModule from '../../../src/core/triangulation';
import * as writerModule from '../../../src/core/writer';
import * as assemblyModule from '../../../src/core/assembly';
import * as gltfNamesModule from '../../../src/core/gltf-names';
import * as loaderModule from '../../../src/core/loader-browser';

vi.mock('../../../src/core/document', () => ({
  readCadBuffer: vi.fn(),
}));
vi.mock('../../../src/core/triangulation', () => ({
  triangulateDocument: vi.fn(),
}));
vi.mock('../../../src/core/writer', () => ({
  writeDocumentToBuffer: vi.fn(),
}));
vi.mock('../../../src/core/assembly', () => ({
  buildNodeMap: vi.fn(),
  buildBom: vi.fn(),
}));
vi.mock('../../../src/core/gltf-names', () => ({
  extractNameOverridesFromGlb: vi.fn(),
}));
vi.mock('../../../src/core/loader-browser', () => ({
  getOpenCascade: vi.fn(),
}));

const readCadBufferMock = vi.mocked(documentModule.readCadBuffer);
const triangulateDocumentMock = vi.mocked(triangulationModule.triangulateDocument);
const writeDocumentToBufferMock = vi.mocked(writerModule.writeDocumentToBuffer);
const buildNodeMapMock = vi.mocked(assemblyModule.buildNodeMap);
const buildBomMock = vi.mocked(assemblyModule.buildBom);
const extractNameOverridesFromGlbMock = vi.mocked(gltfNamesModule.extractNameOverridesFromGlb);
const getOpenCascadeMock = vi.mocked(loaderModule.getOpenCascade);

describe('OpenCascadeConverter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('delegates read/triangulate/write calls to core modules', async () => {
    const { OpenCascadeConverter } = await import('../../../src/browser/converter');
    const oc = { token: 'oc' };
    const converter = new OpenCascadeConverter(oc as any);

    readCadBufferMock.mockReturnValue({ handle: true } as any);
    converter.readBuffer(new Uint8Array([1]), 'step', { preserveNames: false });
    expect(readCadBufferMock).toHaveBeenCalledWith(
      oc,
      expect.any(Uint8Array),
      'step',
      { preserveNames: false }
    );

    converter.triangulate({ doc: true }, { linearDeflection: 2 });
    expect(triangulateDocumentMock).toHaveBeenCalledWith(
      oc,
      { doc: true },
      { linearDeflection: 2 }
    );

    writeDocumentToBufferMock.mockReturnValue({ outputFormat: 'obj', obj: new Uint8Array([2]) } as any);
    converter.writeBuffer({ handle: true } as any, 'obj', { metadata: { a: 'b' } });
    expect(writeDocumentToBufferMock).toHaveBeenCalledWith(
      oc,
      { handle: true },
      'obj',
      { metadata: { a: 'b' } }
    );
  });

  it('delegates node map and bom creation', async () => {
    const { OpenCascadeConverter } = await import('../../../src/browser/converter');
    const oc = { token: 'oc' };
    const converter = new OpenCascadeConverter(oc as any);

    buildNodeMapMock.mockReturnValue({ roots: ['a'], nodes: {} } as any);
    buildBomMock.mockReturnValue({ roots: ['a'], items: [] } as any);

    const nodeMap = converter.createNodeMap({ handle: true } as any);
    const bom = converter.createBom({ handle: true } as any);

    expect(buildNodeMapMock).toHaveBeenCalledWith(oc, { handle: true });
    expect(buildBomMock).toHaveBeenCalledWith(oc, { handle: true });
    expect(nodeMap.roots).toEqual(['a']);
    expect(bom.roots).toEqual(['a']);
  });

  it('creates metadata from glb output and overrides', async () => {
    const { OpenCascadeConverter } = await import('../../../src/browser/converter');
    const oc = { token: 'oc' };
    const converter = new OpenCascadeConverter(oc as any);

    writeDocumentToBufferMock.mockReturnValue({
      outputFormat: 'glb',
      glb: new Uint8Array([9]),
    } as any);
    extractNameOverridesFromGlbMock.mockReturnValue({ '0:1': 'Root' });
    buildNodeMapMock.mockReturnValue({ roots: [], nodes: {} } as any);
    buildBomMock.mockReturnValue({ roots: [], items: [] } as any);

    const result = converter.createMetadataFromGlb({ handle: true } as any, {
      nameFormat: 'productOrInstance',
    });

    expect(extractNameOverridesFromGlbMock).toHaveBeenCalledWith(
      new Uint8Array([9])
    );
    expect(buildNodeMapMock).toHaveBeenCalledWith(oc, { handle: true }, { '0:1': 'Root' });
    expect(buildBomMock).toHaveBeenCalledWith(oc, { handle: true }, { '0:1': 'Root' });
    expect(result).toEqual({ nodeMap: { roots: [], nodes: {} }, bom: { roots: [], items: [] } });
  });

  it('throws when metadata extraction does not return GLB', async () => {
    const { OpenCascadeConverter } = await import('../../../src/browser/converter');
    const oc = { token: 'oc' };
    const converter = new OpenCascadeConverter(oc as any);

    writeDocumentToBufferMock.mockReturnValue({
      outputFormat: 'obj',
      obj: new Uint8Array([1]),
    } as any);

    expect(() => converter.createMetadataFromGlb({ handle: true } as any)).toThrow(
      'Expected GLB buffer when extracting metadata.'
    );
  });
});

describe('createConverter', () => {
  it('loads OpenCascade with the provided options', async () => {
    const { createConverter } = await import('../../../src/browser/converter');
    const oc = { ok: true };
    getOpenCascadeMock.mockResolvedValue(oc as any);

    const converter = await createConverter({ cache: false });

    expect(getOpenCascadeMock).toHaveBeenCalledWith({ cache: false });
    expect(converter).toBeTruthy();
  });
});
