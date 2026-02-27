import { parseGlbJson } from './glb-parse';

export type NameOverrideMap = Record<string, string>;

export function extractNameOverridesFromGlb(glb: Uint8Array): NameOverrideMap {
  let json: any;
  try {
    json = parseGlbJson(glb);
  } catch {
    return {};
  }
  if (!json || !Array.isArray(json.nodes)) {
    return {};
  }

  const overrides: NameOverrideMap = {};
  json.nodes.forEach((node: { name?: string }) => {
    if (!node?.name) {
      return;
    }
    const ocaf = extractOcafEntry(node.name);
    if (!ocaf) {
      return;
    }
    if (overrides[ocaf]) {
      return;
    }
    const cleaned = cleanName(node.name);
    if (cleaned) {
      overrides[ocaf] = cleaned;
    }
  });

  return overrides;
}

function extractOcafEntry(name: string) {
  const matches = name.match(/\b\d+(?::\d+)+\b/g);
  return matches ? matches[matches.length - 1] : null;
}

function cleanName(name: string) {
  const parts = name.split(/\s*\[/);
  if (parts.length === 1) {
    return name.trim();
  }

  const cleaned: string[] = [parts[0].trim()];
  for (let index = 1; index < parts.length; index += 1) {
    const segment = parts[index];
    const closeIndex = segment.indexOf(']');
    if (closeIndex === -1) {
      continue;
    }
    const inside = segment.slice(0, closeIndex).trim();
    if (inside === '') {
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
  return result || name.trim();
}
