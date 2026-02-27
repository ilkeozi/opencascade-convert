import { describe, expect, it } from 'vitest';
import { parseGlbBin, parseGlbJson } from '../../../src/core/glb-parse';

function buildGlb(json: unknown, bin?: Uint8Array) {
  const text = JSON.stringify(json);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(text);
  const jsonPaddedLen = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonPadded = new Uint8Array(jsonPaddedLen);
  jsonPadded.set(jsonBytes);
  jsonPadded.fill(0x20, jsonBytes.length);

  const binBytes = bin ?? new Uint8Array(0);
  const binPaddedLen = Math.ceil(binBytes.length / 4) * 4;
  const binPadded = new Uint8Array(binPaddedLen);
  binPadded.set(binBytes);

  const totalLength =
    12 +
    8 +
    jsonPaddedLen +
    (binPaddedLen > 0 ? 8 + binPaddedLen : 0);

  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonPaddedLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(jsonPadded, 20);

  if (binPaddedLen > 0) {
    const binHeaderOffset = 20 + jsonPaddedLen;
    view.setUint32(binHeaderOffset, binPaddedLen, true);
    view.setUint32(binHeaderOffset + 4, 0x004e4942, true); // 'BIN'
    glb.set(binPadded, binHeaderOffset + 8);
  }

  return glb;
}

function buildGlbFromJsonText(text: string) {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(text);
  const jsonPaddedLen = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonPadded = new Uint8Array(jsonPaddedLen);
  jsonPadded.set(jsonBytes);
  jsonPadded.fill(0x20, jsonBytes.length);

  const totalLength = 12 + 8 + jsonPaddedLen;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonPaddedLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(jsonPadded, 20);
  return glb;
}

describe('glb-parse', () => {
  it('parses JSON and BIN chunks', () => {
    const json = { asset: { version: '2.0' } };
    const bin = new Uint8Array([1, 2, 3, 4]);
    const glb = buildGlb(json, bin);

    expect(parseGlbJson(glb)).toEqual(json);
    expect(parseGlbBin(glb)).toEqual(bin);
  });

  it('throws on invalid magic', () => {
    const glb = buildGlb({ asset: { version: '2.0' } });
    glb[0] = 0x00;
    expect(() => parseGlbJson(glb)).toThrow('Invalid GLB: invalid magic');
  });

  it('throws on missing JSON chunk', () => {
    const glb = new Uint8Array(12 + 8 + 4);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.byteLength, true);
    view.setUint32(12, 4, true);
    view.setUint32(16, 0x004e4942, true); // BIN chunk, no JSON
    expect(() => parseGlbJson(glb)).toThrow('Invalid GLB: missing JSON chunk');
  });

  it('throws on truncated header', () => {
    const glb = new Uint8Array(10);
    expect(() => parseGlbJson(glb)).toThrow('Invalid GLB: truncated header');
  });

  it('throws on invalid JSON payload', () => {
    const glb = buildGlbFromJsonText('{');
    expect(() => parseGlbJson(glb)).toThrow(SyntaxError);
  });

  it('throws on truncated chunk', () => {
    const glb = buildGlb({ asset: { version: '2.0' } });
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    view.setUint32(12, glb.byteLength, true);
    expect(() => parseGlbJson(glb)).toThrow('Invalid GLB: truncated chunk');
  });

  it('returns null when BIN chunk is missing', () => {
    const glb = buildGlb({ asset: { version: '2.0' } });
    expect(parseGlbBin(glb)).toBeNull();
  });

  it('returns null when a chunk is truncated', () => {
    const glb = buildGlb({ asset: { version: '2.0' } });
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    view.setUint32(12, glb.byteLength, true);
    expect(parseGlbBin(glb)).toBeNull();
  });
});
