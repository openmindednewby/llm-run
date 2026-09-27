import { fetchModelInfo } from '../../../src/hub/fetchModelInfo';
import { fakeFetch, json } from '../../helpers/fakeFetch';
const opts = (fetchFn: typeof fetch) => ({ hubUrl: 'https://hub', fetchFn });
it('404 → E_MODEL_NOT_FOUND naming the id (Review Focus 1)', async () => {
  await expect(fetchModelInfo('org/typo', opts(fakeFetch()))).rejects.toMatchObject(
    { code: 'E_MODEL_NOT_FOUND', message: expect.stringContaining('org/typo') });
});
it('network failure → E_NETWORK', async () => {
  const fetchFn = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
  await expect(fetchModelInfo('org/m', opts(fetchFn))).rejects.toMatchObject({ code: 'E_NETWORK' });
});
it('asks for blob sizes', async () => {
  const fetchFn = fakeFetch(() => json({ id: 'org/m', sha: 'r', gated: false, siblings: [] }));
  await fetchModelInfo('org/m', opts(fetchFn));
  expect(fetchFn.mock.calls[0]?.[0]).toBe('https://hub/api/models/org/m?blobs=true');
});
