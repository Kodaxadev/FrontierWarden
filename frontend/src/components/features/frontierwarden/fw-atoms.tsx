// FrontierWarden shared atom components — Direction C design primitives.
// All components are presentational. Data-driven styles use CSS custom properties.

import type { CSSProperties, ReactNode } from 'react';

// ── FwPanel ──────────────────────────────────────────────────────────────────
interface FwPanelProps {
  children: ReactNode;
  style?: CSSProperties;
  accentColor?: string;
}

export function FwPanel({ children, style, accentColor }: FwPanelProps) {
  return (
    <div style={{
      background: 'var(--void-800)',
      border: '1px solid var(--b-05)',
      borderTop: accentColor ? `1px solid ${accentColor}` : '1px solid var(--b-08)',
      display: 'flex', flexDirection: 'column',
      minHeight: 0, minWidth: 0,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── ClsHeader (classified amber-stripe panel header) ─────────────────────────
interface ClsHeaderProps {
  priority?: string;
  label: string;
  classification?: string;
  right?: ReactNode;
  accent?: string;
}

export function ClsHeader({
  priority = 'MED', label, classification, right,
  accent = 'var(--frontier-amber)',
}: ClsHeaderProps) {
  return (
    <div style={{
      borderBottom: `1px solid ${accent}`,
      background: `linear-gradient(90deg, ${accent}10, transparent 60%)`,
      boxShadow: `0 1px 0 ${accent}25`,
      padding: '7px 12px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      minHeight: 30, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="fw-mono" style={{
          fontSize: 9, letterSpacing: '0.16em',
          color: accent, fontWeight: 700,
        }}>◣ PRIORITY: {priority}</span>
        <span className="fw-section-header" style={{ fontSize: 11 }}>{label}</span>
        {classification && (
          <span className="fw-mono" style={{
            fontSize: 9, color: 'var(--t-muted)', letterSpacing: '0.12em',
            paddingLeft: 10, borderLeft: '1px solid var(--b-08)',
          }}>{classification}</span>
        )}
      </div>
      {right && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {right}
        </div>
      )}
    </div>
  );
}

// ── DocFootC (doc-footer stripe) ─────────────────────────────────────────────
export function DocFootC({ children }: { children: ReactNode }) {
  return (
    <div style={{
      borderTop: '1px dashed var(--b-08)',
      padding: '4px 12px', flexShrink: 0,
      display: 'flex', justifyContent: 'space-between',
      fontFamily: 'var(--f-mono)', fontSize: 9,
      color: 'var(--t-muted)', letterSpacing: '0.08em',
    }}>
      {children}
    </div>
  );
}

// ── FwStanding pill ───────────────────────────────────────────────────────────
const STANDING_MAP: Record<string, { c: string; label: string }> = {
  ally:    { c: 'var(--standing-ally)',   label: 'ALLY' },
  neutral: { c: 'var(--standing-neutral)', label: 'NEUTRAL' },
  enemy:   { c: 'var(--standing-enemy)',  label: 'ENEMY' },
  kos:     { c: 'var(--tribe-crimson)',   label: 'KOS' },
  blue:    { c: '#3B82F6',               label: 'BLUE' },
};

interface FwStandingProps { kind: string; value?: number; }

export function FwStanding({ kind, value }: FwStandingProps) {
  const m = STANDING_MAP[kind] ?? STANDING_MAP.neutral;
  return (
    <span className="fw-mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 10, letterSpacing: '0.1em',
      color: m.c, padding: '2px 6px',
      border: `1px solid ${m.c}40`, background: `${m.c}10`,
    }}>
      <span style={{ width: 4, height: 4, background: m.c, boxShadow: `0 0 4px ${m.c}`, display: 'inline-block' }} />
      {m.label}
      {value != null && (
        <span style={{ color: 'var(--t-secondary)', marginLeft: 2 }}>
          {value > 0 ? `+${value}` : value}
        </span>
      )}
    </span>
  );
}

// ── FwHeat dot ────────────────────────────────────────────────────────────────
export function FwHeat({ level }: { level: 'low' | 'mid' | 'high' }) {
  const c = level === 'low' ? 'var(--heat-low)' : level === 'mid' ? 'var(--heat-mid)' : 'var(--heat-high)';
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: c, boxShadow: `0 0 6px ${c}`,
      display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// ── FwGateGlyph ───────────────────────────────────────────────────────────────
export function FwGateGlyph({ status = 'open', size = 10 }: { status?: string; size?: number }) {
  const c = status === 'open' ? 'var(--status-clear)' :
            status === 'camped' ? 'var(--status-camped)' : 'var(--frontier-amber)';
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      background: c, opacity: 0.9, boxShadow: `0 0 6px ${c}`,
      transform: 'rotate(45deg)', verticalAlign: 'middle', flexShrink: 0,
    }} />
  );
}

// ── FwSpark (mini SVG sparkline) ──────────────────────────────────────────────
interface FwSparkProps {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}

export function FwSpark({ data, color = 'var(--sui-cyan)', height = 22, fill = false }: FwSparkProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x},${y}`;
  });
  const polyPts = pts.join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height }}>
      {fill && (
        <polygon
          points={`0,${height} ${polyPts} ${w},${height}`}
          fill={color} fillOpacity="0.1"
        />
      )}
      <polyline points={polyPts} fill="none" stroke={color} strokeWidth="1"
        vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── FwSlider (static hi-fi) ───────────────────────────────────────────────────
interface FwSliderProps {
  leftLabel: string; rightLabel: string;
  value: number; marker: string; color?: string;
}

export function FwSlider({ leftLabel, rightLabel, value, marker, color = 'var(--sui-cyan)' }: FwSliderProps) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="fw-data-label" style={{ fontSize: 9 }}>{leftLabel}</span>
        <span className="fw-data-label" style={{ fontSize: 9 }}>{rightLabel}</span>
      </div>
      <div className="fw-slider">
        <div className="fw-slider-fill" style={{ width: `${value}%`, background: color }} />
        {[0, 25, 50, 75, 100].map(t => (
          <div key={t} className="fw-slider-tick" style={{ left: `${t}%` }} />
        ))}
        <div className="fw-slider-thumb" style={{
          left: `${value}%`,
          boxShadow: `0 0 0 2px var(--void-800), 0 0 14px ${color}40`,
        }} />
        <div style={{
          position: 'absolute', left: `${value}%`, top: -16,
          transform: 'translateX(-50%)',
          fontFamily: 'var(--f-mono)', fontSize: 9,
          color, letterSpacing: '0.05em', whiteSpace: 'nowrap',
        }}>
          {marker}
        </div>
      </div>
    </div>
  );
}

// ── StatC (small stat tile) ───────────────────────────────────────────────────
interface StatCProps { k: string; v: string; sub: string; color?: string; }

export function StatC({ k, v, sub, color }: StatCProps) {
  return (
    <div style={{
      border: '1px solid var(--b-05)', padding: '8px 10px',
      background: 'var(--void-780)',
    }}>
      <div className="fw-data-label" style={{ fontSize: 9 }}>{k}</div>
      <div className="fw-mono" style={{ fontSize: 18, color: color ?? 'var(--t-primary)', marginTop: 2 }}>{v}</div>
      <div className="fw-mono" style={{ fontSize: 9, color: 'var(--t-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
