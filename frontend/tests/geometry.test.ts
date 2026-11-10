import { describe, expect, it } from 'vitest';
import { normalizedPoint, validateGeometry } from '../src/geometry';
import { parseSourceInput, sourceInput, sourceSeconds } from '../src/format';
import { configuration } from './fixtures';

describe('geometry feedback, not server activation or physical classification', () => {
  it('accepts valid source-normalized polygons and per-kind names', () => {
    const value = structuredClone(configuration.geometry);
    value.exclusions[0]!.name = value.zones[0]!.name;
    expect(validateGeometry(value)).toBeNull();
  });
  it('rejects empty, crossed, collapsed, duplicate and non-finite geometry', () => {
    const value = structuredClone(configuration.geometry);
    expect(validateGeometry({ ...value, zones: [] })).toBeTruthy();
    for (const points of [
      [[0, 0], [1, 1], [1, 0], [0, 1]],
      [[0, 0], [.5, .5], [1, 1]],
      [[0, 0], [1, 0], [1, 0], [0, 1]],
      [[0, 0], [Number.NaN, 0], [1, 1]],
    ] as [number, number][][]) {
      expect(validateGeometry({ ...value, zones: [{ name: 'invalid', points }] })).toBeTruthy();
    }
    expect(validateGeometry({ ...value, boundary: .3 })).toBeTruthy();
    expect(validateGeometry({ ...value, boundary: Number.NaN })).toBeTruthy();
  });
  it('maps pointer positions to the actual reference box, not viewport or arbitrary 16:9 coordinates', () => {
    expect(normalizedPoint(300, 200, { left: 100, top: 100, width: 400, height: 200 })).toEqual([.5, .5]);
    expect(normalizedPoint(0, 500, { left: 100, top: 100, width: 400, height: 200 })).toEqual([0, 1]);
    expect(normalizedPoint(1, 1, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe('source clock inputs', () => {
  it('preserves exact microseconds and never silently rounds uncertainty boundaries', () => {
    expect(parseSourceInput('34.000001')).toBe(34_000_001);
    expect(sourceInput(34_000_001)).toBe('34.000001');
    expect(parseSourceInput(sourceInput(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    for (const input of ['', '-1', 'NaN', 'Infinity', '10.0000001', '1e3', '9007199255']) expect(parseSourceInput(input)).toBeNull();
    expect(sourceSeconds(undefined)).toBe('Unavailable');
    expect(sourceSeconds(-15_000_000)).toBe('-15.000s');
  });
});
