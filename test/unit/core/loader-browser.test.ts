import { describe, expect, it, vi } from 'vitest';

const loadModule = async (mock: { default?: any; initOpenCascade?: any }) => {
  vi.resetModules();
  vi.doMock('opencascade.js/dist/index.js', () => ({
    default: mock.default,
    initOpenCascade: mock.initOpenCascade,
  }));
  return import('../../../src/core/loader-browser');
};


describe('loader-browser', () => {
  it('loads when module default export is a function', async () => {
    const init = vi.fn().mockResolvedValue({ ok: 'default' });
    const { loadOpenCascade } = await loadModule({ default: init });

    const result = await loadOpenCascade();

    expect(init).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: 'default' });
  });

  it('loads when module exposes initOpenCascade', async () => {
    const init = vi.fn().mockResolvedValue({ ok: 'named' });
    const { loadOpenCascade } = await loadModule({ initOpenCascade: init });

    const result = await loadOpenCascade();

    expect(init).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: 'named' });
  });

  it('throws when module lacks an init function', async () => {
    const { loadOpenCascade } = await loadModule({});

    await expect(loadOpenCascade()).rejects.toThrow(
      'opencascade.js did not export an init function.'
    );
  });

  it('caches the OpenCascade promise by default', async () => {
    const init = vi.fn().mockResolvedValue({ cached: true });
    const { getOpenCascade } = await loadModule({ default: init });

    await getOpenCascade();
    await getOpenCascade();

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('skips cache when requested', async () => {
    const init = vi.fn().mockResolvedValue({ cached: false });
    const { getOpenCascade } = await loadModule({ default: init });

    await getOpenCascade({ cache: false });
    await getOpenCascade({ cache: false });

    expect(init).toHaveBeenCalledTimes(2);
  });
});
