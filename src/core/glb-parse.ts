// GLB format constants (spec-defined).
const GLB_HEADER_LENGTH = 12; // Magic (4) + version (4) + length (4)
const GLB_CHUNK_HEADER_LENGTH = 8; // Chunk length (4) + chunk type (4)
const GLB_JSON_CHUNK = 0x4e4f534a; // 'JSON' in little-endian u32
const GLB_BIN_CHUNK = 0x004e4942; // 'BIN' in little-endian u32
// ASCII bytes for 'glTF' used as the GLB magic signature.
const GLB_MAGIC_BYTES = [0x67, 0x6c, 0x54, 0x46] as const;

/**
 * Parses and returns the JSON chunk from a GLB buffer.
 * @throws Error when the GLB header or JSON chunk is invalid.
 */
export function parseGlbJson(glb: Uint8Array) {
  if (glb.byteLength < GLB_HEADER_LENGTH + GLB_CHUNK_HEADER_LENGTH) {
    throw new Error('Invalid GLB: truncated header');
  }
  if (!isGlbMagic(glb)) {
    throw new Error('Invalid GLB: invalid magic');
  }

  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  let offset = GLB_HEADER_LENGTH;
  while (offset + GLB_CHUNK_HEADER_LENGTH <= glb.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + GLB_CHUNK_HEADER_LENGTH;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > glb.byteLength) {
      throw new Error('Invalid GLB: truncated chunk');
    }
    if (chunkType === GLB_JSON_CHUNK) {
      const jsonText = new TextDecoder('utf-8').decode(
        glb.subarray(chunkStart, chunkEnd)
      );
      return JSON.parse(jsonText);
    }
    offset = chunkEnd;
  }
  throw new Error('Invalid GLB: missing JSON chunk');
}

/**
 * Returns the BIN chunk from a GLB buffer, or null when absent/invalid.
 */
export function parseGlbBin(glb: Uint8Array) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  let offset = GLB_HEADER_LENGTH;
  while (offset + GLB_CHUNK_HEADER_LENGTH <= glb.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + GLB_CHUNK_HEADER_LENGTH;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > glb.byteLength) {
      return null;
    }
    if (chunkType === GLB_BIN_CHUNK) {
      return glb.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd;
  }
  return null;
}

function isGlbMagic(glb: Uint8Array) {
  if (glb.byteLength < 4) {
    return false;
  }
  return (
    glb[0] === GLB_MAGIC_BYTES[0] &&
    glb[1] === GLB_MAGIC_BYTES[1] &&
    glb[2] === GLB_MAGIC_BYTES[2] &&
    glb[3] === GLB_MAGIC_BYTES[3]
  );
}
