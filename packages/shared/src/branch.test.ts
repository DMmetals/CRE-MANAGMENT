import { describe, it, expect } from 'vitest';
import { normalizeBranch } from './branch.js';
describe('shared branch routing', () => {
  it.each([
    'FBD',
    'fbd',
    'Faridabad',
    'FARIDABAD',
    'Faridabad Branch',
    'Trade FBD',
    'Trade(FBD)',
    '  Faridabad   Branch  ',
  ])('normalizes %s to FBD', (value) =>
    expect(normalizeBranch(value)).toBe('FBD'),
  );
  it.each([
    'MUM',
    'mum',
    'Mumbai',
    'MUMBAI',
    'Mumbai Branch',
    'Trade MUM',
    'Trade(MUM)',
    ' Mumbai   Branch ',
  ])('normalizes %s to MUM', (value) =>
    expect(normalizeBranch(value)).toBe('MUM'),
  );
  it('preserves unsupported values for a visible validation message', () => {
    expect(normalizeBranch(' XYZ ')).toBe('XYZ');
    expect(normalizeBranch(null)).toBe('');
  });
});
