import type { CSSProperties } from 'react';

export const GREEN = '#2f5d3a';
export const btn: CSSProperties = {
  font: '14px system-ui', padding: '6px 10px', borderRadius: 8, border: '1px solid #b9b9b9',
  background: '#fff', color: '#222', cursor: 'pointer', minHeight: 34,
};
export const btnOn: CSSProperties = { ...btn, background: GREEN, color: '#fff', borderColor: GREEN };
export const btnDanger: CSSProperties = { ...btn, color: '#b42318', borderColor: '#e4a5a0' };
export const input: CSSProperties = {
  font: '15px system-ui', padding: '6px 8px', borderRadius: 8, border: '1px solid #b9b9b9', width: '100%', boxSizing: 'border-box',
};
export const label: CSSProperties = { font: '12px system-ui', color: '#555', display: 'block', margin: '8px 0 2px' };
export const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
export const modalBack: CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16,
};
export const modal: CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 16, width: 'min(460px, 100%)', maxHeight: '90%', overflow: 'auto', font: '15px system-ui',
};
