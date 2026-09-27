import { describe, it, expect } from 'vitest';
import { serializePattern, parsePattern, fileNameFor } from './patternFile.js';
import { generateTrouserBlock } from '../blocks/trouserBlock.js';
import { DEFAULT_MEASUREMENTS } from '../../hooks/useMeasurements.js';

describe('pattern files', () => {
  const pattern = generateTrouserBlock(DEFAULT_MEASUREMENTS, 'jeans');

  it('round-trips a block with its piece metadata and measurements', () => {
    const text = serializePattern({ pattern, measurements: DEFAULT_MEASUREMENTS, bodyType: 'female_adult', name: 'Jeans v1' });
    const back = parsePattern(text);
    expect(back.name).toBe('Jeans v1');
    expect(back.bodyType).toBe('female_adult');
    expect(back.measurements).toEqual(DEFAULT_MEASUREMENTS);
    expect(back.pattern.points).toEqual(pattern.points);
    expect(back.pattern.segments).toEqual(pattern.segments);
    expect(back.pattern.pieces).toEqual(pattern.pieces);
  });

  it('rejects files that are not GarmentOS patterns', () => {
    expect(() => parsePattern('not json')).toThrow(/not a GarmentOS pattern/);
    expect(() => parsePattern('{"hello":1}')).toThrow(/not a GarmentOS pattern/);
    expect(() => parsePattern(JSON.stringify({ format: 'garmentos-pattern', version: 99, pattern: {} }))).toThrow(/newer version/);
    expect(() => parsePattern(JSON.stringify({ format: 'garmentos-pattern', version: 1, pattern: { points: { a: { id: 'a', x: 'x', y: 1 } } } }))).toThrow(/damaged/);
  });

  it('drops dangling segments instead of failing', () => {
    const text = JSON.stringify({
      format: 'garmentos-pattern', version: 1,
      pattern: { points: { a: { id: 'a', x: 0, y: 0 } }, segments: { s: { id: 's', type: 'line', p1: 'a', p2: 'gone' } } },
    });
    expect(parsePattern(text).pattern.segments).toEqual({});
  });

  it('makes safe file names', () => {
    expect(fileNameFor('Trouser / Slim #2')).toBe('trouser-slim-2.garmentos.json');
    expect(fileNameFor('')).toBe('pattern.garmentos.json');
  });
});
