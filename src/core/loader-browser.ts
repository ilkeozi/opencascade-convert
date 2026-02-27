import type { LoaderOptions } from './types';
import type { OpenCascadeInstance } from './types';

export type { OpenCascadeInstance } from './types';

let cachedPromise: Promise<OpenCascadeInstance> | null = null;

export async function loadOpenCascade(): Promise<OpenCascadeInstance> {
  const module = await import('opencascade.js/dist/index.js');
  const initOpenCascade = resolveInitOpenCascade(module);
  return initOpenCascade();
}

export async function getOpenCascade(options: LoaderOptions = {}): Promise<OpenCascadeInstance> {
  const shouldCache = options.cache !== false;
  if (!shouldCache) {
    return loadOpenCascade();
  }
  if (!cachedPromise) {
    cachedPromise = loadOpenCascade();
  }
  return cachedPromise;
}

function resolveInitOpenCascade(module: unknown) {
  if (typeof module === 'function') {
    return module as () => Promise<OpenCascadeInstance>;
  }
  if (module && typeof module === 'object') {
    const typed = module as { default?: unknown; initOpenCascade?: unknown };
    if (typeof typed.default === 'function') {
      return typed.default as () => Promise<OpenCascadeInstance>;
    }
    if (typeof typed.initOpenCascade === 'function') {
      return typed.initOpenCascade as () => Promise<OpenCascadeInstance>;
    }
  }
  throw new Error('opencascade.js did not export an init function.');
}
