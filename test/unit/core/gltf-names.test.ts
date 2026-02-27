import { describe, expect, it } from 'vitest';
import { extractNameOverridesFromGlb } from '../../../src/core/gltf-names';

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

describe('extractNameOverridesFromGlb', () => {
  it('extracts ocaf entries and cleans names', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      nodes: [
        { name: 'Gear Box [0:1]' },
        { name: 'Bolt [0:1:2] [NAUO123]' },
        { name: 'Part [0:1:3] [Custom]' },
        { name: 'NoOcafName' },
      ],
    });

    const overrides = extractNameOverridesFromGlb(glb);
    expect(overrides).toEqual({
      '0:1': 'Gear Box',
      '0:1:2': 'Bolt',
      '0:1:3': 'Part [Custom]',
    });
  });

  it('keeps the first override for duplicate ocaf entries', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      nodes: [
        { name: 'First [1:2:3]' },
        { name: 'Second [1:2:3]' },
      ],
    });

    const overrides = extractNameOverridesFromGlb(glb);
    expect(overrides).toEqual({
      '1:2:3': 'First',
    });
  });

  it('returns empty overrides when GLB is invalid', () => {
    const glb = buildGlbFromJson({ asset: { version: '2.0' }, nodes: [] });
    glb[0] = 0x00;
    expect(extractNameOverridesFromGlb(glb)).toEqual({});
  });

  it('handles malformed brackets and empty segments', () => {
    const glb = buildGlbFromJson({
      asset: { version: '2.0' },
      nodes: [
        { name: 'Broken [0:1:2' },
        { name: '[0:1:3]' },
        { name: 'Spacer [0:1:4] [] [NAUO99] [Custom]' },
        { name: '0:1:5' },
        {},
      ],
    });

    const overrides = extractNameOverridesFromGlb(glb);
    expect(overrides).toEqual({
      '0:1:2': 'Broken',
      '0:1:3': '[0:1:3]',
      '0:1:4': 'Spacer [Custom]',
      '0:1:5': '0:1:5',
    });
  });

  it('returns empty overrides when nodes is not an array', () => {
    const glb = buildGlbFromJson({ asset: { version: '2.0' }, nodes: {} });
    expect(extractNameOverridesFromGlb(glb)).toEqual({});
  });

  it('returns empty overrides when JSON root is null', () => {
    const glb = buildGlbFromJson(null);
    expect(extractNameOverridesFromGlb(glb)).toEqual({});
  });
});
