import { cosine, decodeVector, encodeVector } from '../../../src/intent/vectors';

describe('cosine', () => {
  it('with parallel vectors, returns 1', () => {
    const score = cosine([2, 0], [5, 0]);

    expect(score).toBeCloseTo(1);
  });

  it('with vectors of different lengths, returns 0', () => {
    const score = cosine([1, 0, 0], [1, 0]);

    expect(score).toBe(0);
  });

  it('with an all-zero vector, returns 0', () => {
    const score = cosine([0, 0], [1, 1]);

    expect(score).toBe(0);
  });
});

describe('encodeVector + decodeVector', () => {
  it('with a float vector, keeps its direction through the round trip', () => {
    const vector = [0.5, -0.25, 0.125];

    const decoded = decodeVector(encodeVector(vector));

    expect(cosine(vector, decoded as Int8Array)).toBeGreaterThan(0.999);
  });

  it('with an all-zero vector, encodes without NaN', () => {
    const vector = [0, 0];

    const decoded = decodeVector(encodeVector(vector));

    expect(Array.from(decoded as Int8Array)).toEqual([0, 0]);
  });
});

describe('decodeVector', () => {
  it('with text that is not base64, returns null', () => {
    const decoded = decodeVector('@@not base64@@');

    expect(decoded).toBeNull();
  });

  it('with an empty string, returns null', () => {
    const decoded = decodeVector('');

    expect(decoded).toBeNull();
  });
});
