import { useState } from 'react';

// The 7 minimum viable inputs — enough to generate a useful mannequin
const FIELDS = [
  { key: 'height',         label: 'Height',           note: 'total standing' },
  { key: 'chest',          label: 'Chest',            note: 'fullest point' },
  { key: 'waist',          label: 'Waist',            note: 'natural waist' },
  { key: 'hip',            label: 'Hip',              note: 'fullest hip' },
  { key: 'bodyRise',       label: 'Body Rise',        note: 'waist to seat (sitting)' },
  { key: 'shoulderWidth',  label: 'Shoulder Width',   note: 'shoulder to shoulder' },
  { key: 'backWaistLength',label: 'Back Waist Length', note: 'neck to waist, back' },
  { key: 'upperThighGirth',label: 'Upper Thigh',      note: 'drives the crotch fork' },
  { key: 'kneeGirth',      label: 'Knee',             note: 'around the knee' },
];

export default function MeasurementPanel({ measurements, onChange, onClose, inline = false }) {
  const [localValues, setLocalValues] = useState(() => {
    const out = {};
    FIELDS.forEach(f => { out[f.key] = (measurements[f.key] / 10).toFixed(1); });
    return out;
  });

  function handleChange(key, raw) {
    setLocalValues(v => ({ ...v, [key]: raw }));
    const num = parseFloat(raw);
    if (!isNaN(num) && num > 0) {
      onChange(key, Math.round(num * 10)); // cm → mm
    }
  }

  return (
    <div data-testid="measurements" style={inline ? {
      padding: '4px 0',
    } : {
      position: 'absolute',
      top: 8, left: 8, right: 8,
      maxHeight: 'calc(100% - 60px)',
      overflowY: 'auto',
      backgroundColor: 'var(--color-panel)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: 12,
      zIndex: 10,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Measurements
        </span>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>cm</span>
        {!inline && <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-dim)', fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}>×</button>}
      </div>

      {/* Input grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {FIELDS.map(({ key, label, note }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: inline ? 13 : 10, color: 'var(--color-text)', lineHeight: 1.2 }}>{label}</div>
              <div style={{ fontSize: inline ? 11 : 9, color: 'var(--color-text-dim)' }}>{note}</div>
            </div>
            <input
              type="number"
              inputMode="decimal"
              aria-label={label}
              data-testid={`m-${key}`}
              value={localValues[key]}
              onChange={e => handleChange(key, e.target.value)}
              min={1}
              step={0.5}
              style={{
                width: inline ? 76 : 54,
                padding: inline ? '8px 8px' : '3px 6px',
                fontSize: inline ? 16 : 11,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono)',
                textAlign: 'right',
                outline: 'none',
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 9, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
        European defaults (ISO 8559 size 40). The 3D body and the drape update as you type. East African calibration data slots in here when it arrives.
      </div>
    </div>
  );
}
