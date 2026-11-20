import type { HexColor, SymbolId } from '../types';

export interface SignPreset { key: string; label: string; symbol: SymbolId; color: HexColor }

/** One-tap markers for blood trailing. They drop at your current GPS position on the Tracking layer. */
export const SIGNS: SignPreset[] = [
  { key: 'hit', label: 'Hit', symbol: 'flag', color: '#e03131' },
  { key: 'blood', label: 'Blood', symbol: 'water', color: '#e03131' },
  { key: 'tracks', label: 'Tracks', symbol: 'tracks', color: '#8d6e63' },
  { key: 'hair', label: 'Hair', symbol: 'circle', color: '#f1f3f5' },
  { key: 'bed', label: 'Bed', symbol: 'square', color: '#74b816' },
  { key: 'lost', label: 'Lost sign', symbol: 'x', color: '#212529' },
  { key: 'found', label: 'Found', symbol: 'star', color: '#fcc419' },
];
