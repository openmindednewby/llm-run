import { readFileSync } from 'fs';
import { join } from 'path';
import { WLLAMA_VERSION, WLLAMA_CDN_ASSETS } from '../../../src/runtimes/wllamaAdapter';

const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>; devDependencies: Record<string, string>;
};
it('pins wllama exactly and the CDN URL uses the same version', () => {
  expect([pkg.peerDependencies['@wllama/wllama'], pkg.devDependencies['@wllama/wllama']]).toEqual([WLLAMA_VERSION, WLLAMA_VERSION]);
  expect(WLLAMA_CDN_ASSETS.default).toContain(`@wllama/wllama@${WLLAMA_VERSION}/`);
});
