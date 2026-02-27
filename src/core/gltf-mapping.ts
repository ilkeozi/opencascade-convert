import { parseGlbJson } from './glb-parse';

export type GltfNodeIndex = {
  gltfNodeIndex: number;
  gltfMeshIndex?: number;
};

export function extractOcafEntryFromName(name: string) {
  const matches = name.match(/\b\d+(?::\d+)+\b/g);
  return matches ? matches[matches.length - 1] : null;
}

export function cleanGltfNodeName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  const parts = trimmed.split(/\s*\[/);
  if (parts.length === 1) {
    return trimmed;
  }

  const cleaned: string[] = [parts[0].trim()];
  for (let index = 1; index < parts.length; index += 1) {
    const segment = parts[index];
    const closeIndex = segment.indexOf(']');
    if (closeIndex === -1) {
      continue;
    }
    const inside = segment.slice(0, closeIndex).trim();
    if (!inside) {
      continue;
    }
    if (/\b\d+(?::\d+)+\b/.test(inside)) {
      continue;
    }
    if (/NAUO\d+/i.test(inside)) {
      continue;
    }
    cleaned.push(`[${inside}]`);
  }

  const result = cleaned.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return result || trimmed;
}

export function buildPrettyNameOverridesFromGlb(glb: Uint8Array) {
  const gltf = parseGlbJson(glb) as any;
  const nodes = Array.isArray(gltf?.nodes) ? (gltf.nodes as any[]) : [];
  const overrides = new Map<string, string>();
  nodes.forEach((node) => {
    if (!node?.name || typeof node.name !== 'string') {
      return;
    }
    const entry = extractOcafEntryFromName(node.name);
    if (!entry || overrides.has(entry)) {
      return;
    }
    const cleaned = cleanGltfNodeName(node.name);
    if (cleaned && cleaned !== entry) {
      overrides.set(entry, cleaned);
    }
  });
  return overrides;
}

export function buildGltfNodeIndexByOcafEntry(glb: Uint8Array) {
  const gltf = parseGlbJson(glb) as any;
  const nodes = Array.isArray(gltf?.nodes) ? (gltf.nodes as any[]) : [];
  const map = new Map<string, GltfNodeIndex>();
  nodes.forEach((node, index) => {
    if (!node?.name || typeof node.name !== 'string') {
      return;
    }
    const entry = extractOcafEntryFromName(node.name);
    if (!entry) {
      return;
    }
    if (map.has(entry)) {
      return;
    }
    const meshIndex = typeof node.mesh === 'number' ? node.mesh : undefined;
    map.set(entry, { gltfNodeIndex: index, gltfMeshIndex: meshIndex });
  });
  return map;
}
