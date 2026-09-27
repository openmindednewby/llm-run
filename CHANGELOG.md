# Changelog

## 0.2.0 — 2026-09-27: run() + OpenAI-shaped chat (CPU/WASM)

- `run(model, opts?)` — loads a GGUF model from Hugging Face into `@wllama/wllama` (CPU/WASM)
  and returns an `LlmClient`: `chat(text)`, `chat.completions.create({ messages, stream })`
  in the OpenAI chat-completion / chunk shape, and `unload()`.
- Model store: weights cached in OPFS (a second `run()` downloads nothing), resumable
  downloads, SHA-256 check per shard with one re-fetch.
- A runtime that dies (GPU lost, wasm crash) reloads on the next call.
- `RunOptions.wllamaAssetPaths` — self-host the wllama wasm (strict CSP, COEP, offline).
- New error codes: `E_MODEL_NOT_FOUND` (model missing or private) and `E_INFERENCE` (one
  request rejected, model stays loaded).
- README: quick start for `run()`, options, the error table, and a "Cross-origin isolation"
  section with COOP/COEP headers for nginx, Netlify, Vercel and Cloudflare Pages.
- Acceptance criteria green in this release: AC-1 (reply in Chrome/Edge/Firefox), AC-2, AC-5
  (cache: 0 bytes on the second run), AC-6 (resume), AC-7 (integrity), AC-9, AC-10 (CPU path +
  warning), AC-11, AC-12 (OpenAI shape). AC-8 (gated models): cases 1-2 green.
- **Not yet** (red, land in later 0.x releases): AC-3 `run('auto')`, AC-4 server fallback
  (`fallback` is accepted but rejects with `E_NO_FIT`), AC-8 case 3 (gated model via the
  fallback), AC-13 lazy-loaded runtimes (WebGPU / `@mlc-ai/web-llm` path).

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
