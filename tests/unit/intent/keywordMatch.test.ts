import { compileKeywords, firstKeywordHit } from '../../../src/intent/keywordMatch';

const compiled = (entries: { id: string; keywords: (string | RegExp)[] }[]) => entries.map((e) => ({ id: e.id, patterns: compileKeywords(e.keywords) }));

describe('firstKeywordHit', () => {
  it('with a word in any case, returns its intent', () => {
    const entries = compiled([{ id: 'pricing', keywords: ['price'] }]);

    const hit = firstKeywordHit('What is the PRICE today', entries);

    expect(hit?.id).toBe('pricing');
  });

  it('with the keyword only inside a longer word, returns nothing', () => {
    const entries = compiled([{ id: 'art', keywords: ['art'] }]);

    const hit = firstKeywordHit('let us start the party', entries);

    expect(hit).toBeNull();
  });

  it('with two intents hit, returns the first one listed', () => {
    const entries = compiled([
      { id: 'first', keywords: ['hire'] },
      { id: 'second', keywords: ['games'] },
    ]);

    const hit = firstKeywordHit('hire me for games', entries);

    expect(hit?.id).toBe('first');
  });

  it('with a phrase holding regex characters, matches it literally', () => {
    const entries = compiled([{ id: 'lang', keywords: ['c++ (new)'] }]);

    const hit = firstKeywordHit('do you write c++ (new) code', entries);

    expect(hit?.id).toBe('lang');
  });

  it('with a non-latin keyword next to punctuation, returns its intent', () => {
    const entries = compiled([{ id: 'greek', keywords: ['τιμή'] }]);

    const hit = firstKeywordHit('ποια είναι η τιμή;', entries);

    expect(hit?.id).toBe('greek');
  });

  it('with a global regex run twice, hits both times', () => {
    const entries = compiled([{ id: 'stateful', keywords: [/\bcost\b/g] }]);

    const hits = [firstKeywordHit('the cost', entries), firstKeywordHit('the cost', entries)];

    expect(hits.map((h) => h?.id)).toEqual(['stateful', 'stateful']);
  });

  it('with an empty keyword, never hits', () => {
    const entries = compiled([{ id: 'blank', keywords: ['', '  '] }]);

    const hit = firstKeywordHit('any text at all', entries);

    expect(hit).toBeNull();
  });
});
