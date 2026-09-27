/** GGUF `general.architecture` values llama.cpp (and so wllama) can run. Refresh from llama.cpp src/llama-arch.cpp LLM_ARCH_NAMES each release. */
export const LLAMA_CPP_ARCHITECTURES: ReadonlySet<string> = new Set([
  'llama', 'llama4', 'qwen2', 'qwen2moe', 'qwen3', 'qwen3moe', 'phi2', 'phi3', 'phimoe', 'gemma', 'gemma2', 'gemma3',
  'mistral3', 'starcoder2', 'falcon', 'gpt2', 'gptneox', 'stablelm', 'deepseek', 'deepseek2', 'olmo', 'olmo2',
  'granite', 'granitemoe', 'smollm3', 'exaone', 'command-r', 'cohere2', 'internlm2', 'minicpm', 'bloom', 'mpt', 'rwkv6', 'mamba',
]);
