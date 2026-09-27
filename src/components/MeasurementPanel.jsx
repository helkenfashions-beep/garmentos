import { useState } from 'react';
import { legLengths } from '../lib/body/dims';

// Every measurement the trouser block and the 3D body use. Values are shown in
// cm and stored in mm. `auto` fields may be left empty: the block and the body
// then derive them from height, and the derived value is shown as a hint.
const GROUPS = [
  {
    title: 'Trouser',
    fields: [
      { key: 'waist',           label: 'Waist',          note: 'natural waist',             min: 40,  max: 250 },
      { key: 'hip',             label: 'Hip',            note: 'fullest hip',               min: 50,  max: 250 },
      { key: 'seat',            label: 'Seat',           note: 'fullest seat',              min: 50,  max: 260 },
      { key: 'bodyRise',        label: 'Body rise',      note: 'waist to seat, sitting',    min: 15,  max: 50 },
      { key: 'upperThighGirth', label: 'Upper thigh',    note: 'drives the crotch fork',    min: 30,  max: 120 },
      { key: 'kneeGirth',       label: 'Knee',           note: 'around the knee',           min: 20,  max: 80 },
      { key: 'hipToWaist',      label: 'Hip depth',      note: 'waist down to hip line',    min: 10,  max: 40,  auto: 'hipDepth' },
      { key: 'waistToKnee',     label: 'Waist to knee',  note: 'down the side',             min: 30,  max: 90,  auto: 'waistToKnee' },
      { key: 'waistToAnkle',    label: 'Waist to ankle', note: 'trouser length',            min: 50,  max: 140, auto: 'waistToAnkle' },
    ],
  },
  {
    title: 'Body',
    fields: [
      { key: 'height',          label: 'Height',            note: 'total standing',      min: 90, max: 230 },
      { key: 'chest',           label: 'Chest',             note: 'fullest point',       min: 50, max: 200 },
      { key: 'shoulderWidth',   label: 'Shoulder width',    note: 'shoulder to shoulder', min: 25, max: 70 },
      { key: 'backWaistLength', label: 'Back waist length', note: 'neck to waist, back', min: 25, max: 70 },
    ],
  },
];
const FIELDS = GROUPS.flatMap(g => g.fields);

const toCm = (mm) => (mm / 10).toFixed(1);

export default function MeasurementPanel({ measurements, onChange, onClose, inline = false, drawer = false, onApply, needsApply = false }) {
  const [localValues, setLocalValues] = useState(() => {
    const out = {};
    FIELDS.forEach(f => { out[f.key] = measurements[f.key] == null ? '' : toCm(measurements[f.key]); });
    return out;
  });
  const [bad, setBad] = useState({});

  const autos = legLengths(measurements);
  const big = inline || drawer;

  function handleChange(f, raw) {
    setLocalValues(v => ({ ...v, [f.key]: raw }));
    if (raw.trim() === '' && f.auto) {               // cleared → back to automatic
      setBad(b => ({ ...b, [f.key]: false }));
      onChange(f.key, undefined);
      return;
    }
    const num = parseFloat(raw);
    const ok = !isNaN(num) && num >= f.min && num <= f.max;
    setBad(b => ({ ...b, [f.key]: !ok }));
    if (ok) onChange(f.key, Math.round(num * 10));   // cm → mm
  }

  const shell = drawer ? {
    height: '100%', overflowY: 'auto', padding: '10px 16px calc(12px + env(safe-area-inset-bottom))',
    backgroundColor: 'var(--color-panel)', borderTop: '1px solid var(--color-border)',
  } : inline ? {
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
  };

  return (
    <div data-testid={drawer ? 'measure-drawer' : 'measurements'} style={shell}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: big ? 13 : 11, fontWeight: 600, color: 'var(--color-accent)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Measurements
        </span>
        <span style={{ fontSize: big ? 11 : 9, color: 'var(--color-text-dim)', flex: 1 }}>cm · 2D and 3D update as you type</span>
        {!inline && <button data-testid="measure-close" aria-label="Close measurements" onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-dim)', fontSize: big ? 22 : 14, lineHeight: 1, padding: big ? '4px 8px' : '0 2px',
        }}>×</button>}
      </div>

      {needsApply && (
        <div data-testid="apply-banner" style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 10px',
          border: '1px solid var(--color-warn)', borderRadius: 6, background: 'rgba(210,153,34,0.08)',
          fontSize: big ? 12 : 10, color: 'var(--color-text)', lineHeight: 1.4,
        }}>
          <span style={{ flex: 1 }}>The pattern has hand edits, so it was not redrawn. Applying redraws the block from these measurements (Undo brings your edits back).</span>
          <button data-testid="btn-apply" onClick={onApply} style={{
            minHeight: big ? 36 : 24, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-accent)',
            background: 'var(--color-accent-dim)', color: '#fff', fontSize: big ? 13 : 10, cursor: 'pointer', flexShrink: 0,
          }}>Apply to pattern</button>
        </div>
      )}

      {GROUPS.map(g => (
        <div key={g.title} style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: big ? 11 : 9, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
            margin: '6px 0 4px', fontFamily: 'var(--font-mono)',
          }}>{g.title}</div>
          <div style={{
            display: 'grid', gap: big ? 8 : 6,
            gridTemplateColumns: drawer ? 'repeat(auto-fill, minmax(170px, 1fr))' : '1fr',
          }}>
            {g.fields.map((f) => {
              const autoCm = f.auto ? toCm(autos[f.auto]) : null;
              const isAuto = f.auto && localValues[f.key] === '';
              return (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: big ? 13 : 10, color: 'var(--color-text)', lineHeight: 1.2 }}>
                      {f.label}
                      {isAuto && <span style={{
                        marginLeft: 6, fontSize: big ? 10 : 8, color: 'var(--color-accent)', border: '1px solid var(--color-accent)',
                        borderRadius: 3, padding: '0 3px', fontFamily: 'var(--font-mono)',
                      }}>auto</span>}
                    </div>
                    <div style={{ fontSize: big ? 11 : 9, color: bad[f.key] ? 'var(--color-danger)' : 'var(--color-text-dim)' }}>
                      {bad[f.key] ? `use ${f.min}–${f.max} cm` : f.note}
                    </div>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={f.label}
                    data-testid={`m-${f.key}`}
                    value={localValues[f.key]}
                    placeholder={autoCm ?? ''}
                    onChange={e => handleChange(f, e.target.value)}
                    min={f.min}
                    max={f.max}
                    step={0.5}
                    style={{
                      width: big ? 76 : 54,
                      padding: big ? '8px 8px' : '3px 6px',
                      fontSize: big ? 16 : 11,
                      backgroundColor: 'var(--color-surface)',
                      border: `1px solid ${bad[f.key] ? 'var(--color-danger)' : 'var(--color-border)'}`,
                      borderRadius: 4,
                      color: 'var(--color-text)',
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'right',
                      outline: 'none',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
