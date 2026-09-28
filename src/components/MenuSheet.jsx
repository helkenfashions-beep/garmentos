import { useState } from 'react';
import { EASE_PRESETS } from '../lib/blocks/trouserBlock';
import MeasurementPanel from './MeasurementPanel';
import { FABRICS, BODY_TYPES } from '../lib/options';



const BLOCK_TYPES = [{ value: 'trouser', label: 'Trouser block' }];
const FITS = Object.entries(EASE_PRESETS).map(([value, { label }]) => ({ value, label }));



function Section({ title, children }) {
  return (
    <section style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
      <h2 style={{
        fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--color-text-dim)', fontWeight: 600, marginBottom: 10,
      }}>{title}</h2>
      {children}
    </section>
  );
}

const btn = {
  minHeight: 44, padding: '0 14px', fontSize: 14, borderRadius: 8,
  border: '1px solid var(--color-border)', background: 'var(--color-surface-2)',
  color: 'var(--color-text)', cursor: 'pointer', flex: 1,
};
const primary = { ...btn, background: 'var(--color-accent-dim)', borderColor: 'var(--color-accent)', color: '#fff', fontWeight: 600 };
const select = {
  minHeight: 44, padding: '0 10px', fontSize: 16, borderRadius: 8, width: '100%',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)',
};
const label = { fontSize: 12, color: 'var(--color-text-dim)', display: 'block', marginBottom: 4 };

export default function MenuSheet({
  open, onClose, side = 'bottom',
  patternName, onRename, onNew, onOpen, onSave,
  onGenerate, measurements, onMeasurementChange, measurementsKey,
  bodyType, onBodyType, fabricColor, onFabric, canInstall, onInstall, needsApply, onApply,
}) {
  const [blockType, setBlockType] = useState('trouser');
  const [fit, setFit] = useState('trouser');
  if (!open) return null;

  const panelStyle = side === 'bottom' ? {
    left: 0, right: 0, bottom: 0, maxHeight: '88dvh',
    borderRadius: '14px 14px 0 0', borderTop: '1px solid var(--color-border)',
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
  } : {
    top: 0, right: 0, bottom: 0, width: 380, borderLeft: '1px solid var(--color-border)',
  };

  return (
    <div
      data-testid="menu-sheet"
      role="dialog" aria-modal="true" aria-label="Menu"
      style={{ position: 'fixed', inset: 0, zIndex: 50 }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{
        position: 'absolute', ...panelStyle, overflowY: 'auto',
        background: 'var(--color-panel)', padding: '8px 16px 16px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          {side === 'bottom' && <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '0 auto' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 2px' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>GarmentOS</span>
          <button data-testid="menu-close" onClick={onClose} aria-label="Close menu"
            style={{ ...btn, flex: 'none', width: 44, padding: 0, fontSize: 20 }}>×</button>
        </div>

        <Section title="Pattern">
          <label style={label} htmlFor="pattern-name">Name</label>
          <input
            id="pattern-name" data-testid="pattern-name"
            value={patternName} onChange={e => onRename(e.target.value)}
            style={{ ...select, marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="btn-new" style={btn} onClick={onNew}>New</button>
            <button data-testid="btn-open" style={btn} onClick={onOpen}>Open</button>
            <button data-testid="btn-save" style={btn} onClick={onSave}>Save</button>
          </div>
        </Section>

        <Section title="Block">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={label} htmlFor="block-type">Type</label>
              <select id="block-type" style={select} value={blockType} onChange={e => setBlockType(e.target.value)}>
                {BLOCK_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="block-fit">Fit</label>
              <select id="block-fit" data-testid="block-fit" style={select} value={fit} onChange={e => setFit(e.target.value)}>
                {FITS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <button data-testid="btn-generate" style={{ ...primary, width: '100%' }} onClick={() => onGenerate(blockType, fit)}>
            Generate block from measurements
          </button>
        </Section>

        <Section title="Fabric">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {FABRICS.map(f => (
              <button
                key={f.label}
                data-testid={`fabric-${f.label.toLowerCase()}`}
                onClick={() => onFabric(f.id)}
                aria-label={f.label}
                aria-pressed={fabricColor === f.id}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', fontSize: 11 }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 18, background: f.color,
                  border: fabricColor === f.id ? '3px solid var(--color-accent)' : '2px solid var(--color-border)',
                }} />
                {f.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Body">
          <label style={label} htmlFor="body-type">Body type</label>
          <select id="body-type" data-testid="body-type" style={{ ...select, marginBottom: 6 }} value={bodyType} onChange={e => onBodyType(e.target.value)}>
            {BODY_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
          <MeasurementPanel key={measurementsKey} inline measurements={measurements} onChange={onMeasurementChange} needsApply={needsApply} onApply={onApply} />
        </Section>

        <div style={{ paddingTop: 12, fontSize: 12, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
          Works offline. Your pattern is saved on this device automatically; use Save to keep a copy as a file.
          {canInstall && (
            <button data-testid="btn-install" style={{ ...primary, width: '100%', marginTop: 10 }} onClick={onInstall}>
              Install GarmentOS on this phone
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

