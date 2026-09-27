import { run, canRun, type LlmClient, type RunOptions } from '../../src';

declare global {
  interface Window { llmRun: unknown; lastWarnings: string[] }
}

window.lastWarnings = [];
// wllama's wasm is served by the fixture server (ruling #26): no CDN, no internet, same-origin under COEP.
const wllamaAssetPaths = { default: `${location.origin}/wllama/wllama.wasm` };
window.llmRun = {
  run: (m: string, o: RunOptions = {}): Promise<LlmClient> =>
    run(m, { hubUrl: location.origin, wllamaAssetPaths, onWarning: (w) => window.lastWarnings.push(w), ...o }),
  canRun,
};
