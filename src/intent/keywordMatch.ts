import type { KeywordPattern } from './types';

const BEFORE_WORD = '(?:^|[^\\p{L}\\p{N}])';
const AFTER_WORD = '(?:$|[^\\p{L}\\p{N}])';
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const STATEFUL_FLAGS = /[gy]/g;

const wordPattern = (keyword: string): RegExp => new RegExp(`${BEFORE_WORD}${keyword.replace(REGEX_SPECIALS, '\\$&')}${AFTER_WORD}`, 'iu');

/** Turn keywords into stateless patterns: strings match whole words in any case, blank strings are dropped. */
export function compileKeywords(keywords: readonly KeywordPattern[] = []): RegExp[] {
  return keywords.flatMap((keyword) => {
    if (typeof keyword !== 'string') {
      return [new RegExp(keyword.source, keyword.flags.replace(STATEFUL_FLAGS, ''))];
    }
    const trimmed = keyword.trim();
    return trimmed === '' ? [] : [wordPattern(trimmed)];
  });
}

/** The first entry, in the order given, with a pattern that hits the text. */
export function firstKeywordHit<Entry extends { patterns: readonly RegExp[] }>(text: string, entries: readonly Entry[]): Entry | null {
  return entries.find((entry) => entry.patterns.some((pattern) => pattern.test(text))) ?? null;
}
