# @dloizides/llm-run

Run any Hugging Face LLM in the browser with one line of code.

Status: 0.2.0 loads a GGUF model into the CPU/WASM runtime (`@wllama/wllama`), caches its
weights in the browser (OPFS, resumable) and answers through an OpenAI-shaped chat client.
The WebGPU runtime, `run('auto')` and the server fallback land in a later 0.x release. Part of BLLM-1
"Docker for LLMs in the browser". Apache-2.0.

## Install

```bash
npm install @dloizides/llm-run @wllama/wllama
# optional, for the WebGPU runtime (later 0.x):
npm install @mlc-ai/web-llm
```

## Quick start: run a model and ask it something

```ts
import { run } from '@dloizides/llm-run';

const llm = await run('bartowski/SmolLM2-135M-Instruct-GGUF', {
  onProgress: (e) => console.log(e.file, e.loadedBytes, '/', e.totalBytes),
  onWarning: (message) => console.warn(message),
});

// the shortcut: one user message in, the reply text out
const reply = await llm.chat('Name three rivers in Europe.');

// the OpenAI-shaped call, non-streaming
const completion = await llm.chat.completions.create({
  messages: [{ role: 'user', content: 'Say hello.' }],
  max_tokens: 64,
});
console.log(completion.choices[0].message.content);

// streaming: chunks have the OpenAI `chat.completion.chunk` shape
const stream = await llm.chat.completions.create({
  messages: [{ role: 'user', content: 'Count to five.' }],
  stream: true,
});
for await (const chunk of stream) {
  console.log(chunk.choices[0].delta.content ?? '');
}

await llm.unload(); // frees the runtime; the cached weights stay
```

The second `run()` of the same model on the same site downloads no weights (they are cached in
OPFS). A download cut mid-file resumes from the bytes already stored. Every shard is checked
against its SHA-256; a corrupted shard is re-fetched once. `create()` also takes
`temperature` and an `AbortSignal` (`signal`); breaking out of a stream stops generation.

## Will this model run on this device?

```ts
import { canRun } from '@dloizides/llm-run';

const verdict = await canRun('Qwen/Qwen2.5-0.5B-Instruct');

if (verdict.ok) {
  console.log(verdict.runtime, verdict.quant, verdict.bytes); // e.g. 'wllama', 'Q4_K_M', 397808192
} else {
  console.log(verdict.reasons); // why not: memory, unsupported architecture, no usable quant...
}
```

`canRun` reads Hugging Face metadata only; it downloads no weights.

## Options (`run(model, opts)`)

| option | meaning |
|---|---|
| `hfToken` | Hugging Face token, needed for gated models (accept the licence on the Hub first) |
| `contextLength` | context window to load the model with (capped at the model's own; default 4096 or less) |
| `maxModelBytes` | cap on the model's file bytes, instead of the memory budget measured from the device |
| `onProgress(e)` | download progress per file: `{ file, loadedBytes, totalBytes }` |
| `onWarning(message)` | non-fatal notices: no WebGPU (CPU mode), cache unavailable |
| `wllamaAssetPaths` | where the wllama wasm is loaded from (below) |
| `hubUrl` | a Hugging Face mirror instead of `https://huggingface.co` |
| `fallback` | server fallback URL; **accepted but not built yet in 0.2.0**: it rejects with `E_NO_FIT` |

### `wllamaAssetPaths`

By default the wllama wasm is loaded from a pinned jsDelivr copy of `@wllama/wllama@3.6.1`.
Self-host it for a strict CSP, for COEP when the CDN response has no
`Cross-Origin-Resource-Policy` header, or for offline use. The shape is wllama's own
`AssetsPathConfig`:

```ts
await run(model, {
  wllamaAssetPaths: {
    default: '/wasm/wllama.wasm',
    // optional per-build overrides:
    'single-thread/wllama.wasm': '/wasm/single-thread/wllama.wasm',
    'multi-thread/wllama.wasm': '/wasm/multi-thread/wllama.wasm',
  },
});
```

Copy the files from `node_modules/@wllama/wllama/src/wasm/` into your static assets.

## Cross-origin isolation

CPU mode runs multi-threaded only when the page is cross-origin isolated
(`self.crossOriginIsolated === true`). Without it llm-run still works, single-threaded and
several times slower, and logs one console warning. Serve the page with these two headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`require-corp` blocks cross-origin subresources that do not send
`Cross-Origin-Resource-Policy`; `credentialless` (Chrome, Edge, Firefox) is the looser option.

**nginx**

```nginx
location / {
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Cross-Origin-Embedder-Policy "require-corp" always;
}
```

**Netlify** — `_headers` in the publish directory:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

**Vercel** — `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

**Cloudflare Pages** — `_headers` in the build output directory (same format as Netlify):

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

## Errors

Every error the library throws is an `LlmRunError` with a stable `code` (`ErrorCode`), a
message prefixed with the code, and `reasons: string[]`.

| code | when |
|---|---|
| `E_NO_FIT` | no runtime/quant of this model fits this device (and no fallback) |
| `E_MODEL_NOT_FOUND` | the model id does not exist on the Hub, or is private without a token |
| `E_GATED` | the model is gated and no `hfToken` was passed |
| `E_UNSUPPORTED_ARCH` | no browser runtime supports the model's architecture (the message names it) |
| `E_NETWORK` | a download failed |
| `E_STORAGE` | the browser refused to store the weights (quota, OPFS) |
| `E_INTEGRITY` | a shard failed its SHA-256 check twice |
| `E_GPU_LOST` | the runtime died (GPU device lost, wasm crash); the next call reloads the model |
| `E_INFERENCE` | the runtime rejected one request (e.g. a prompt over the context); the model stays loaded |

```ts
import { run, LlmRunError, ErrorCode } from '@dloizides/llm-run';

try {
  await run('meta-llama/Llama-3.2-1B-Instruct');
} catch (e) {
  if (e instanceof LlmRunError && e.code === ErrorCode.Gated) {
    // ask the user for a Hugging Face token
  }
}
```

## Map free text to an intent, on the device

`@dloizides/llm-run/intent` picks one of your intents for a sentence. Keywords answer at once with no
download; an embedding model takes over after you ask for it, and every failure falls back to keywords.

```ts
import { createIntentMatcher, DEFAULT_EMBEDDING_MODEL_URL } from '@dloizides/llm-run/intent';

const matcher = createIntentMatcher({
  threshold: 0.35,
  model: DEFAULT_EMBEDDING_MODEL_URL,
  intents: [
    { id: 'pricing', keywords: ['price', /how much/i], examples: ['what does it cost'] },
    { id: 'quit', keywords: ['exit'], keywordsWin: true },
    { id: 'off-topic', negative: true, examples: ['tell me a joke'] },
  ],
});

await matcher.match('how much is it'); // { id: 'pricing', source: 'keyword', score: null, fallback: 'not-loaded' }

const loaded = await matcher.loadOnDemand({
  deadlineMs: 90_000,
  onProgress: ({ phase, loaded, total }) => console.log(phase, loaded, total),
});
// { ok: true } or { ok: false, reason: 'deadline' | 'error', message }; it never rejects

await matcher.match('is this expensive'); // { id: 'pricing', source: 'embedding', score: 0.61, fallback: null }
```

| result | meaning |
|---|---|
| `source: 'embedding'` | the closest example scored at or above `threshold`; `id` is `null` when it sits on a `negative` intent |
| `source: 'keyword'` | a keyword hit; `fallback` says why the model did not answer, `null` for `matchKeywords()` and `keywordsWin` |
| `source: 'none'` | nothing matched; `id` is `null` |
| `fallback` | `'not-loaded'`, `'deadline'` (`queryDeadlineMs`, default 8000), `'error'`, `'below-threshold'` |

Keywords: a string matches whole words in any case, a `RegExp` runs on the raw text, and the first intent
listed wins. An intent marked `keywordsWin` returns on a hit without embedding the query.

**Precomputed vectors.** After a load, `matcher.packVectors()` returns `{ intentId: { exampleText: base64 } }`.
Ship each table as `Intent.vectors` and the next load embeds only the examples it has no vector for. A table
must come from the same model: vectors of another length score 0.

**No bundler.** This entry has no bare imports, so it works straight from a CDN with no import map. wllama
3.6.1 is imported from jsDelivr by URL when `loadOnDemand` runs:

```html
<script type="module">
  import { createIntentMatcher } from 'https://cdn.jsdelivr.net/npm/@dloizides/llm-run@0.4.0/dist/intent.js';
</script>
```

**With a bundler,** pass your own copy, since a bundler cannot follow an import by URL:

```ts
import { createIntentMatcher, loadWllamaRuntime } from '@dloizides/llm-run/intent';

createIntentMatcher({
  threshold: 0.35,
  model: 'https://example.com/embedding.gguf',
  intents: [],
  loadRuntime: (request) => loadWllamaRuntime(request, { importModule: () => import('@wllama/wllama/esm/index.js') }),
});
```

The recipe typechecks against `@wllama/wllama` 3.6.1 with no cast.

`loadRuntime` also takes any `{ embed(text), dispose?() }` you build yourself, such as one running in your
own worker. A strict CSP needs `script-src` and `connect-src` for jsDelivr and the model's host, or
`moduleUrl` and `wasmUrl` in `loadWllamaRuntime`'s overrides pointing at self-hosted copies.
