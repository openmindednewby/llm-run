import type { ChatMessage, GenerateOptions } from '../types';
import type { RuntimeAdapter } from '../runtimes/types';

export interface CompletionRequest {
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: { index: 0; delta: { role?: 'assistant'; content?: string }; finish_reason: 'stop' | null }[];
}

export interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: { index: 0; message: { role: 'assistant'; content: string }; finish_reason: 'stop' }[];
}

export interface Completions {
  create(r: CompletionRequest & { stream: true }): Promise<AsyncIterable<ChatChunk>>;
  create(r: CompletionRequest & { stream?: false }): Promise<ChatCompletion>;
}

export type ChatFn = ((text: string) => Promise<string>) & { completions: Completions };

export interface LlmClient {
  chat: ChatFn;
  unload(): Promise<void>;
}

type Delta = ChatChunk['choices'][number]['delta'];

const MS_PER_S = 1000;

function nowSeconds(): number {
  return Math.floor(Date.now() / MS_PER_S);
}

function newId(): string {
  return `chatcmpl-${crypto.randomUUID()}`;
}

function toOptions(r: CompletionRequest): GenerateOptions {
  return { maxTokens: r.max_tokens, temperature: r.temperature, signal: r.signal };
}

/**
 * Wraps a loaded runtime in an OpenAI-shaped client: `chat.completions.create()` (streaming and
 * non-streaming) plus a `chat(text)` shortcut. Breaking out of a stream early propagates to the
 * adapter's iterator `return()`, so the runtime stops generating.
 */
export function createClient(adapter: RuntimeAdapter, model: string): LlmClient {
  async function* stream(r: CompletionRequest): AsyncGenerator<ChatChunk, void, undefined> {
    const id = newId();
    const created = nowSeconds();
    const chunk = (delta: Delta, finish: 'stop' | null): ChatChunk => ({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    for await (const piece of adapter.chatStream(r.messages, toOptions(r))) {
      yield chunk({ content: piece }, null);
    }
    yield chunk({}, 'stop');
  }

  async function collect(r: CompletionRequest): Promise<ChatCompletion> {
    let content = '';
    for await (const piece of adapter.chatStream(r.messages, toOptions(r))) {
      content += piece;
    }
    return {
      id: newId(),
      object: 'chat.completion',
      created: nowSeconds(),
      model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    };
  }

  function create(r: CompletionRequest): Promise<AsyncIterable<ChatChunk> | ChatCompletion> {
    if (r.stream === true) {
      return Promise.resolve(stream(r));
    }
    return collect(r);
  }

  const completions = { create } as Completions;

  async function ask(text: string): Promise<string> {
    const message: ChatMessage = { role: 'user', content: text };
    const r = await collect({ messages: [message] });
    return r.choices[0]?.message.content ?? '';
  }

  const chat: ChatFn = Object.assign(ask, { completions });
  return { chat, unload: (): Promise<void> => adapter.unload() };
}
