import { describe, expect, it } from 'vitest';
import {
  buildGltfNodeIndexByOcafEntry,
  buildPrettyNameOverridesFromGlb,
  cleanGltfNodeName,
  extractOcafEntryFromName,
} from '../../../src/core/gltf-mapping';

function buildGlbFromJson(json: unknown) {
  const text = JSON.stringify(json);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const paddedLength = Math.ceil(bytes.length / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded.fill(0x20, bytes.length);

  const totalLength = 12 + 8 + paddedLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(padded, 20);
  return glb;
}

describe('gltf-mapping', () => {
  it('extracts ocaf entries from names', () => {
    expect(extractOcafEntryFromName('Part [0:1:2]')).toBe('0:1:2');
    expect(extractOcafEntryFromName('No entry')).toBeNull();
  });

  it('cleans gltf node names', () => {
    expect(cleanGltfNodeName('Bolt [0:1:2] [NAUO123]')).toBe('Bolt');
    expect(cleanGltfNodeName('Part [0:1:3] [Custom]')).toBe('Part [Custom]');
    expect(cleanGltfNodeName('Wheel [] [  ] [Part]')).toBe('Wheel [Part]');
    expect(cleanGltfNodeName('   ')).toBe('');
    expect(cleanGltfNodeName('SimpleName')).toBe('SimpleName');
    expect(cleanGltfNodeName('Broken [0:1:2')).toBe('Broken');
  });

  it('builds pretty name overrides and node index map', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      nodes: [
        { name: 'Gear Box [0:1]', mesh: 0 },
        { name: 'Bolt [0:1:2] [NAUO123]', mesh: 1 },
        { name: 'Part [0:1:3] [Custom]' },
        { name: '0:1:4' },
        { name: 'Duplicate [0:1:2]', mesh: 2 },
        { name: '' },
      ],
    });

    const overrides = buildPrettyNameOverridesFromGlb(glb);
    expect(Array.from(overrides.entries())).toEqual([
      ['0:1', 'Gear Box'],
      ['0:1:2', 'Bolt'],
      ['0:1:3', 'Part [Custom]'],
    ]);

    const index = buildGltfNodeIndexByOcafEntry(glb);
    expect(index.get('0:1')).toEqual({ gltfNodeIndex: 0, gltfMeshIndex: 0 });
    expect(index.get('0:1:2')).toEqual({ gltfNodeIndex: 1, gltfMeshIndex: 1 });
    expect(index.get('0:1:3')).toEqual({ gltfNodeIndex: 2, gltfMeshIndex: undefined });
    expect(index.get('0:1:4')).toEqual({ gltfNodeIndex: 3, gltfMeshIndex: undefined });
  });

  it('skips overrides when cleaned equals entry and handles duplicates', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      nodes: [
        { name: '0:1:2' },
        { name: 'Dup [0:1:2]' },
        { name: 123 },
        { name: 'NoEntry' },
      ],
    });

    const overrides = buildPrettyNameOverridesFromGlb(glb);
    expect(Array.from(overrides.entries())).toEqual([['0:1:2', 'Dup']]);

    const index = buildGltfNodeIndexByOcafEntry(glb);
    expect(index.get('0:1:2')).toEqual({ gltfNodeIndex: 0, gltfMeshIndex: undefined });
  });
});
