# @dloizides/llm-run

Run any Hugging Face LLM in the browser with one line of code.

Status: 0.1.0 ships the **pre-flight check only** (`canRun`). Loading and running a model
(`run`) lands in 0.2.0. Part of BLLM-1 "Docker for LLMs in the browser". Apache-2.0.

## Install

```bash
npm install @dloizides/llm-run @wllama/wllama
# optional, for the WebGPU runtime:
npm install @mlc-ai/web-llm
```

## Quick start: will this model run on this device?

```ts
import { canRun } from '@dloizides/llm-run';

const verdict = await canRun('Qwen/Qwen2.5-0.5B-Instruct');

if (verdict.ok) {
  console.log(verdict.runtime, verdict.quant, verdict.bytes); // e.g. 'wllama', 'Q4_K_M', 397808192
} else {
  console.log(verdict.reasons); // why not: memory, unsupported architecture, no usable quant...
}
```

`canRun('auto')` walks a built-in ladder of small models and answers with the first one that
fits this device. `canRun` reads Hugging Face metadata only; it downloads no weights.

Errors are `LlmRunError` with a stable `code` (`ErrorCode`), e.g. a model id that does not
exist or is private.
