# Changelog

## 0.1.0 — 2026-09-27: canRun() pre-flight

- `canRun(model, opts?)` — resolves a Hugging Face model id (or `'auto'`) to a runtime plan
  for this device: WebGPU (`@mlc-ai/web-llm`) or CPU/WASM (`@wllama/wllama`), the quant and
  the download size, or the reasons it cannot run. No weights are downloaded.
- `LlmRunError` + `ErrorCode`, `Runtime`, public types.
- Acceptance criteria green in this release: AC-2 (can-run pre-flight) and AC-11
  (cross-origin isolation warning); gated by `npm run test:release`.
- **Not yet** (red, land in later 0.x releases): AC-3 auto model, AC-4 runtime fallback,
  AC-7 integrity check, AC-8 gated models, AC-9 unsupported-architecture acceptance test,
  AC-12 OpenAI-shaped chat API.
