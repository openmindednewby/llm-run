import { LlmRunError, ErrorCode } from '../../src/errors';

it('LlmRunError carries code, reasons and a prefixed message', () => {
  const e = new LlmRunError(ErrorCode.NoFit, 'too big', ['needs 9 GB']);
  expect([e.code, e.reasons, e.message, e instanceof Error]).toEqual(['E_NO_FIT', ['needs 9 GB'], 'E_NO_FIT: too big', true]);
});
