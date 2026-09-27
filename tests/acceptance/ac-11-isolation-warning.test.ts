import { warnIfNotIsolated, resetIsolationWarningForTests } from '../../src/env/warnIfNotIsolated';

describe('AC-11 host page not cross-origin isolated → one console warning with the COOP/COEP fix', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');

  afterEach(() => {
    jest.restoreAllMocks();
    if (original) {
      Object.defineProperty(globalThis, 'crossOriginIsolated', original);
    } else {
      delete (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    }
  });

  it('AC-11 warns once, naming Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy', () => {
    resetIsolationWarningForTests();
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnIfNotIsolated();
    warnIfNotIsolated();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/Cross-Origin-Opener-Policy.*Cross-Origin-Embedder-Policy/s);
  });

  it('AC-11 stays silent when the page is cross-origin isolated', () => {
    resetIsolationWarningForTests();
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, configurable: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnIfNotIsolated();
    expect(warn).not.toHaveBeenCalled();
  });
});
