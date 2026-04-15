import { useState } from 'react';
import { EASE_PRESETS } from '../lib/blocks/trouserBlock';

const BLOCK_TYPES = [
  { value: 'trouser', label: 'Trouser Block' },
];

const GARMENT_TYPES = Object.entries(EASE_PRESETS).map(([value, { label }]) => ({ value, label }));

export default function BlockPanel({ onGenerate, onClear }) {
  const [blockType,   setBlockType]   = useState('trouser');
  const [garmentType, setGarmentType] = useState('trouser');

  const btnBase = {
    padding: '5px 14px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    cursor: 'pointer',
  };

  const selectStyle = {
    padding: '3px 6px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-dim)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    cursor: 'pointer',
    width: '100%',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '10px 12px',
      backgroundColor: 'var(--color-panel)',
      borderRight: '1px solid var(--color-border)',
      width: 140,
      flexShrink: 0,
      userSelect: 'none',
    }}>
      <span style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-dim)',
        paddingBottom: 2,
        borderBottom: '1px solid var(--color-border)',
      }}>
        Blocks
      </span>

      {/* Block type */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>Type</span>
        <select value={blockType} onChange={e => setBlockType(e.target.value)} style={selectStyle}>
          {BLOCK_TYPES.map(b => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
      </div>

      {/* Garment fit */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>Fit</span>
        <select value={garmentType} onChange={e => setGarmentType(e.target.value)} style={selectStyle}>
          {GARMENT_TYPES.map(g => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </div>

      {/* Generate */}
      <button
        onClick={() => onGenerate(blockType, garmentType)}
        style={{
          ...btnBase,
          backgroundColor: 'var(--color-accent-dim)',
          color: 'var(--color-accent)',
          borderColor: 'var(--color-accent)',
          marginTop: 4,
        }}
      >
        Generate
      </button>

      {/* Clear */}
      <button
        onClick={onClear}
        style={{
          ...btnBase,
          backgroundColor: 'transparent',
          color: 'var(--color-text-dim)',
        }}
      >
        Clear
      </button>
    </div>
  );
}
