import type { ChatMessage, GenerateOptions } from '../types';

/** What every runtime (wllama, WebLLM) exposes once a model is loaded. */
export interface RuntimeAdapter {
  chatStream(messages: ChatMessage[], opts?: GenerateOptions): AsyncIterable<string>;
  unload(): Promise<void>;
}
