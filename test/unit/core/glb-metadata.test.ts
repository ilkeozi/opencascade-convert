import { describe, expect, it } from 'vitest';
import { injectAssetExtrasIntoGlb } from '../../../src/core/glb-metadata';

function buildGlbFromJson(json: unknown) {
  const text = JSON.stringify(json);
  return buildGlbFromJsonText(text);
}

function buildGlbFromJsonText(text: string) {
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

function buildGlbWithBin(json: unknown, bin: Uint8Array) {
  const jsonText = JSON.stringify(json);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(jsonText);
  const jsonPaddedLen = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonPadded = new Uint8Array(jsonPaddedLen);
  jsonPadded.set(jsonBytes);
  jsonPadded.fill(0x20, jsonBytes.length);

  const binPaddedLen = Math.ceil(bin.byteLength / 4) * 4;
  const binPadded = new Uint8Array(binPaddedLen);
  binPadded.set(bin);

  const totalLength = 12 + 8 + jsonPaddedLen + 8 + binPaddedLen;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonPaddedLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(jsonPadded, 20);

  const binHeaderOffset = 20 + jsonPaddedLen;
  view.setUint32(binHeaderOffset, binPaddedLen, true);
  view.setUint32(binHeaderOffset + 4, 0x004e4942, true); // 'BIN'
  glb.set(binPadded, binHeaderOffset + 8);
  return glb;
}

function readJsonChunk(glb: Uint8Array) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a) {
    throw new Error('Expected JSON chunk');
  }
  const jsonBytes = glb.subarray(20, 20 + chunkLength);
  const text = new TextDecoder('utf-8').decode(jsonBytes).trimEnd();
  return JSON.parse(text);
}

describe('injectAssetExtrasIntoGlb', () => {
  it('merges extras into the asset block', () => {
    const input = buildGlbFromJson({
      asset: { version: '2.0', extras: { foo: 'bar' } },
      nodes: [],
    });

    const output = injectAssetExtrasIntoGlb(input, { baz: 1 });
    const json = readJsonChunk(output);

    expect(json.asset.extras).toEqual({ foo: 'bar', baz: 1 });
  });

  it('preserves non-JSON chunks when updating extras', () => {
    const bin = new Uint8Array([1, 2, 3, 4]);
    const input = buildGlbWithBin({ asset: { version: '2.0' } }, bin);

    const output = injectAssetExtrasIntoGlb(input, { keep: true });
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const jsonLength = view.getUint32(12, true);
    const binHeaderOffset = 20 + jsonLength;
    const binLength = view.getUint32(binHeaderOffset, true);
    const binType = view.getUint32(binHeaderOffset + 4, true);

    expect(binType).toBe(0x004e4942);
    expect(binLength).toBe(Math.ceil(bin.byteLength / 4) * 4);
  });

  it('avoids padding when JSON chunk is already aligned', () => {
    const extras = { pad: '' };
    let json = JSON.stringify({ asset: { version: '2.0', extras } });
    while (json.length % 4 !== 0) {
      extras.pad += 'x';
      json = JSON.stringify({ asset: { version: '2.0', extras } });
    }

    const input = buildGlbFromJson({ asset: { version: '2.0' } });
    const output = injectAssetExtrasIntoGlb(input, extras);

    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const chunkLength = view.getUint32(12, true);
    const encodedLength = new TextEncoder().encode(json).length;
    expect(chunkLength).toBe(encodedLength);
  });

  it('creates asset/extras when missing or invalid', () => {
    const input = buildGlbFromJson({
      asset: 'nope',
      nodes: [],
    });

    const output = injectAssetExtrasIntoGlb(input, { answer: 42 });
    const json = readJsonChunk(output);

    expect(json.asset.extras).toEqual({ answer: 42 });
  });

  it('replaces non-object asset extras', () => {
    const input = buildGlbFromJson({
      asset: { version: '2.0', extras: ['nope'] },
      nodes: [],
    });

    const output = injectAssetExtrasIntoGlb(input, { ok: true });
    const json = readJsonChunk(output);

    expect(json.asset.extras).toEqual({ ok: true });
  });

  it('rejects non-object extras payloads', () => {
    const input = buildGlbFromJson({ asset: { version: '2.0' } });
    expect(() => injectAssetExtrasIntoGlb(input, null as unknown as object)).toThrow(
      'Invalid extras payload: expected an object'
    );
  });

  it('rejects when JSON chunk is invalid', () => {
    const input = buildGlbFromJsonText('{');
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: JSON chunk is not valid JSON'
    );
  });

  it('rejects when JSON root is not an object', () => {
    const input = buildGlbFromJson(['not', 'object']);
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: JSON chunk root is not an object'
    );
  });

  it('rejects when JSON chunk is missing', () => {
    const glb = new Uint8Array(12 + 8 + 4);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.byteLength, true);
    view.setUint32(12, 4, true);
    view.setUint32(16, 0x004e4942, true); // BIN
    expect(() => injectAssetExtrasIntoGlb(glb, { ok: true })).toThrow(
      'Invalid GLB: missing JSON chunk'
    );
  });

  it('rejects on length mismatch', () => {
    const input = buildGlbFromJson({ asset: { version: '2.0' } });
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    view.setUint32(8, input.byteLength + 4, true);
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: truncated file'
    );
  });

  it('rejects on shorter declared length', () => {
    const input = buildGlbFromJson({ asset: { version: '2.0' } });
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    view.setUint32(8, input.byteLength - 4, true);
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: length mismatch'
    );
  });

  it('rejects on truncated header', () => {
    const input = new Uint8Array(3);
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: truncated header'
    );
  });

  it('rejects on short header with valid magic', () => {
    const input = new Uint8Array(10);
    const view = new DataView(input.buffer);
    view.setUint32(0, 0x46546c67, true);
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: truncated header'
    );
  });

  it('rejects on invalid magic', () => {
    const input = buildGlbFromJson({ asset: { version: '2.0' } });
    input[0] = 0x00;
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: invalid magic'
    );
  });

  it('rejects on truncated chunk payload', () => {
    const input = buildGlbFromJson({ asset: { version: '2.0' } });
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    view.setUint32(12, input.byteLength, true);
    expect(() => injectAssetExtrasIntoGlb(input, { ok: true })).toThrow(
      'Invalid GLB: truncated chunk'
    );
  });

  it('rejects when extras are not JSON-serializable', () => {
    const input = buildGlbFromJson({ asset: { version: '2.0' } });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => injectAssetExtrasIntoGlb(input, circular)).toThrow(
      'Invalid extras payload: not JSON-serializable'
    );
  });
});
