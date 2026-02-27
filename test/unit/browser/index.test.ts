import { describe, expect, it } from 'vitest';

import * as browser from '../../../src/browser/index';

describe('browser index', () => {
  it('re-exports public APIs', () => {
    expect(browser.createConverter).toBeTypeOf('function');
    expect(browser.computeBoundsMeters).toBeTypeOf('function');
    expect(browser.buildAssemblyTree).toBeTypeOf('function');
    expect(browser.injectAssetExtrasIntoGlb).toBeTypeOf('function');
  });
});
