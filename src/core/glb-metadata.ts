const GLB_HEADER_LENGTH = 12;
const GLB_CHUNK_HEADER_LENGTH = 8;

// 'glTF' in little-endian u32.
const GLB_MAGIC = 0x46546c67;

// Chunk types per GLB spec.
const GLB_JSON_CHUNK = 0x4e4f534a; // 'JSON'

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder('utf-8');

export type AssetExtrasPayload = Record<string, unknown>;

export function injectAssetExtrasIntoGlb(
  glb: Uint8Array,
  extras: AssetExtrasPayload
): Uint8Array {
  if (!isPlainObject(extras)) {
    throw new Error('Invalid extras payload: expected an object');
  }

  const parsed = parseGlb(glb);
  const jsonChunkIndex = parsed.chunks.findIndex(
    (c) => c.type === GLB_JSON_CHUNK
  );
  if (jsonChunkIndex === -1) {
    throw new Error('Invalid GLB: missing JSON chunk');
  }

  const jsonText = decodeUtf8(parsed.chunks[jsonChunkIndex].data).trimEnd();
  let json: any;
  try {
    json = JSON.parse(jsonText);
  } catch (error) {
    throw new Error('Invalid GLB: JSON chunk is not valid JSON');
  }

  if (!isPlainObject(json)) {
    throw new Error('Invalid GLB: JSON chunk root is not an object');
  }

  const asset = isPlainObject(json.asset) ? json.asset : {};
  const existingExtras = isPlainObject(asset.extras) ? asset.extras : {};
  asset.extras = { ...existingExtras, ...extras };
  json.asset = asset;

  let nextJsonText: string;
  try {
    nextJsonText = JSON.stringify(json);
  } catch {
    throw new Error('Invalid extras payload: not JSON-serializable');
  }

  const nextJsonChunk = buildJsonChunk(nextJsonText);

  const nextChunks = parsed.chunks.map((chunk, index) => {
    if (index === jsonChunkIndex) {
      return nextJsonChunk;
    }
    return chunk.raw;
  });

  return buildGlb(parsed.version, nextChunks);
}

type ParsedChunk = {
  type: number;
  data: Uint8Array;
  raw: Uint8Array;
};

type ParsedGlb = {
  version: number;
  chunks: ParsedChunk[];
};

function parseGlb(glb: Uint8Array): ParsedGlb {
  if (glb.byteLength < 4) {
    throw new Error('Invalid GLB: truncated header');
  }

  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new Error('Invalid GLB: invalid magic');
  }

  if (glb.byteLength < GLB_HEADER_LENGTH + GLB_CHUNK_HEADER_LENGTH) {
    throw new Error('Invalid GLB: truncated header');
  }

  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== glb.byteLength) {
    if (declaredLength > glb.byteLength) {
      throw new Error(
        `Invalid GLB: truncated file (header ${declaredLength} > buffer ${glb.byteLength})`
      );
    }
    throw new Error(
      `Invalid GLB: length mismatch (header ${declaredLength} < buffer ${glb.byteLength})`
    );
  }

  const chunks: ParsedChunk[] = [];
  let offset = GLB_HEADER_LENGTH;
  while (offset + GLB_CHUNK_HEADER_LENGTH <= glb.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + GLB_CHUNK_HEADER_LENGTH;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > glb.byteLength) {
      throw new Error(`Invalid GLB: truncated chunk at offset ${offset}`);
    }

    chunks.push({
      type: chunkType,
      data: glb.subarray(chunkStart, chunkEnd),
      raw: glb.subarray(offset, chunkEnd),
    });

    offset = chunkEnd;
  }

  if (chunks.length === 0) {
    throw new Error('Invalid GLB: missing chunks');
  }

  return { version, chunks };
}

function buildGlb(version: number, rawChunks: Uint8Array[]) {
  const totalLength =
    GLB_HEADER_LENGTH +
    rawChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, version, true);
  view.setUint32(8, totalLength, true);

  let offset = GLB_HEADER_LENGTH;
  for (const chunk of rawChunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function buildJsonChunk(jsonText: string) {
  const data = encodeUtf8(jsonText);
  const padded = padTo4(data, 0x20);

  const chunk = new Uint8Array(GLB_CHUNK_HEADER_LENGTH + padded.byteLength);
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  view.setUint32(0, padded.byteLength, true);
  view.setUint32(4, GLB_JSON_CHUNK, true);
  chunk.set(padded, GLB_CHUNK_HEADER_LENGTH);
  return chunk;
}

function padTo4(bytes: Uint8Array, padByte: number) {
  const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
  if (paddedLength === bytes.byteLength) {
    return bytes;
  }
  const out = new Uint8Array(paddedLength);
  out.set(bytes);
  out.fill(padByte, bytes.byteLength);
  return out;
}

function encodeUtf8(text: string) {
  return UTF8_ENCODER.encode(text);
}

function decodeUtf8(bytes: Uint8Array) {
  return UTF8_DECODER.decode(bytes);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
