// Test seam for RunOptions.fetchFn: routes answer a URL or return undefined; unmatched → 404.
// Self-contained on purpose (no src/ import) so it type-checks before the library exists.
export type Route = (url: string, init?: RequestInit) => Response | undefined;
export type FakeFetch = jest.Mock<Promise<Response>, [string, RequestInit?]> & typeof fetch;

const toUrl = (input: string | URL | Request): string => {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
};

export function fakeFetch(...routes: Route[]): FakeFetch {
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = toUrl(input);
    for (const route of routes) {
      const res = route(url, init);
      if (res) {
        return Promise.resolve(res);
      }
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return jest.fn(impl) as unknown as FakeFetch;
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// An OpenAI-compatible server-sent-events reply, one delta per part, ending in [DONE].
export const sse = (...parts: string[]): Response =>
  new Response(
    parts
      .map((p) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: p }, finish_reason: null }] })}\n\n`)
      .join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
