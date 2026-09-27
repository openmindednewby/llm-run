const MESSAGE = '[llm-run] This page is not cross-origin isolated, so CPU mode runs single-threaded (several times slower). '
  + 'Serve the page with "Cross-Origin-Opener-Policy: same-origin" and "Cross-Origin-Embedder-Policy: require-corp" '
  + '(or "credentialless"). Snippets per host: https://llm-run.dloizides.com/docs#isolation';

let warned = false;

/** Warns once per page load when the host page is not cross-origin isolated (AC-11). */
export function warnIfNotIsolated(): void {
  if (warned || globalThis.crossOriginIsolated === true) {
    return;
  }
  warned = true;
  // eslint-disable-next-line no-console -- AC-11: the COOP/COEP fix must reach the host developer's console; the library has no logger
  console.warn(MESSAGE);
}

/** Test seam: re-arms the once-per-load warning. */
export function resetIsolationWarningForTests(): void {
  warned = false;
}
