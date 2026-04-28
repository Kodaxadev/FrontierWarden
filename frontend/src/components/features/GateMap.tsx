// GateMap -- Canvas 2D tactical gate network.
// Imports shared topology from gate-data.ts (also used by route-graph.ts).
// Accepts highlightedPath from the route planner to overlay the computed route.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Panel }             from '../ui/Panel';
import { ThreatBadge }       from '../ui/StatusBadge';
import { useIntel }          from '../../hooks/useIntel';
import { systemThreatLevel } from '../../types/api.types';
import { HexGridIcon }       from '../ui/Icons';
import {
  NODES,
  EDGES,
  NODE_THREATS,
  THREAT_PRIORITY,
  threatOf,
}                            from '../../lib/gate-data';
import type { Threat }       from '../../lib/gate-data';
import {
  drawDiplomaticEdges,
  drawDiplomaticNodes,
}                            from './gate-map-diplomacy';

// ---------------------------------------------------------------------------
// Local display-only constants (not shared with route-graph)
// ---------------------------------------------------------------------------

const THREAT_STROKE: Record<Threat, string> = {
  hostile: '#EF4444',
  camped:  '#F59E0B',
  clear:   '#10B981',
  unknown: '#374151',
};

const THREAT_FILL: Record<Threat, string> = {
  hostile: 'rgba(239,68,68,0.10)',
  camped:  'rgba(245,158,11,0.08)',
  clear:   'rgba(16,185,129,0.07)',
  unknown: '#0A0E17',
};

const EDGE_BASE = '#1A2236';
const TEXT_DIM  = '#2D3748';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    i === 0
      ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

function withAlpha(hex: string, a: number) {
  return hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type MapMode = 'threat' | 'diplomatic';

interface GateMapProps {
  /** Ordered node IDs from the route planner -- rendered as bold cyan overlay. */
  highlightedPath?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GateMap({ highlightedPath }: GateMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const pathRef   = useRef<string[]>([]);
  useEffect(() => { pathRef.current = highlightedPath ?? []; }, [highlightedPath]);

  const modeRef   = useRef<MapMode>('threat');
  const [mapMode, setMapMode] = useState<MapMode>('threat');
  useEffect(() => { modeRef.current = mapMode; }, [mapMode]);

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered,  setHovered]  = useState<string | null>(null);

  const systemId = selected ? `0x${'0'.repeat(62)}${selected.slice(2)}` : '';
  const { data: intelData } = useIntel(systemId);
  const threatLevel = intelData ? systemThreatLevel(intelData) : 'unknown';

  const selRef    = useRef<string | null>(null);
  const hovRef    = useRef<string | null>(null);
  const threatRef = useRef<Threat>('unknown');
  useEffect(() => { selRef.current    = selected;                  }, [selected]);
  useEffect(() => { hovRef.current    = hovered;                   }, [hovered]);
  useEffect(() => { threatRef.current = threatLevel as Threat;     }, [threatLevel]);

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W   = canvas.width, H = canvas.height;
    const sel = selRef.current;
    const hov = hovRef.current;
    const rte = pathRef.current;
    const selIdx = sel ? NODES.findIndex(n => n.id === sel) : -1;

    // Background
    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, W, H);

    // Dot grid
    ctx.fillStyle = '#0F1620';
    for (let x = 24; x < W; x += 24)
      for (let y = 20; y < H; y += 20)
        ctx.fillRect(x, y, 1, 1);

    // Branch on map mode
    if (modeRef.current === 'diplomatic') {
      drawDiplomaticEdges(ctx, W, H, selIdx, rte);
      // Route path overlay (same in both modes)
      if (rte.length > 1) {
        for (let i = 0; i < rte.length - 1; i++) {
          const fNode = NODES.find(n => n.id === rte[i]);
          const tNode = NODES.find(n => n.id === rte[i + 1]);
          if (!fNode || !tNode) continue;
          ctx.beginPath();
          ctx.moveTo(fNode.x * W, fNode.y * H);
          ctx.lineTo(tNode.x * W, tNode.y * H);
          ctx.strokeStyle = 'rgba(0,210,255,0.82)';
          ctx.lineWidth   = 2;
          ctx.stroke();
        }
      }
      drawDiplomaticNodes(ctx, W, H, sel, hov, rte, t);
      return;
    }

    // Dim edges (threat-tinted, behind route overlay)
    EDGES.forEach(({ a, b }) => {
      const nA     = NODES[a];
      const nB     = NODES[b];
      const tA     = threatOf(nA.id);
      const tB     = threatOf(nB.id);
      const active = a === selIdx || b === selIdx;
      const top: Threat = THREAT_PRIORITY[tA] >= THREAT_PRIORITY[tB] ? tA : tB;
      ctx.beginPath();
      ctx.moveTo(nA.x * W, nA.y * H);
      ctx.lineTo(nB.x * W, nB.y * H);
      if (active) {
        const selThreat = sel ? threatOf(sel) : 'unknown';
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = withAlpha(THREAT_STROKE[selThreat], 0.65);
        ctx.lineWidth   = 1.5;
      } else if (top !== 'unknown') {
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = withAlpha(THREAT_STROKE[top], 0.18);
        ctx.lineWidth   = 0.75;
      } else {
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = EDGE_BASE;
        ctx.lineWidth   = 0.75;
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Route path overlay -- solid cyan edges on top of dim edges
    if (rte.length > 1) {
      for (let i = 0; i < rte.length - 1; i++) {
        const fNode = NODES.find(n => n.id === rte[i]);
        const tNode = NODES.find(n => n.id === rte[i + 1]);
        if (!fNode || !tNode) continue;
        ctx.beginPath();
        ctx.moveTo(fNode.x * W, fNode.y * H);
        ctx.lineTo(tNode.x * W, tNode.y * H);
        ctx.strokeStyle = 'rgba(0,210,255,0.82)';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }

    // Nodes
    NODES.forEach((node) => {
      const threat  = NODE_THREATS[node.id] ?? 'unknown';
      const stroke  = THREAT_STROKE[threat];
      const px      = node.x * W;
      const py      = node.y * H;
      const isSel   = node.id === sel;
      const isHov   = node.id === hov && !isSel;
      const isRoute = rte.length > 0 && rte.includes(node.id);
      const size    = isSel ? 9 : isHov ? 7.5 : 6;

      // Radial glow
      if (threat !== 'unknown') {
        const r   = isSel ? size * 5 : size * 3.5;
        const grd = ctx.createRadialGradient(px, py, 0, px, py, r);
        grd.addColorStop(0, withAlpha(stroke, isSel ? 0.40 : 0.22));
        grd.addColorStop(1, withAlpha(stroke, 0));
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Route node ring (cyan outer ring for path nodes)
      if (isRoute && !isSel) {
        hexPath(ctx, px, py, size + 5);
        ctx.strokeStyle = 'rgba(0,210,255,0.50)';
        ctx.lineWidth   = 1.25;
        ctx.stroke();
      }

      // Beacon rings on selected node
      if (isSel) {
        for (let r = 0; r < 3; r++) {
          const prog = ((t * 0.0005 + r / 3) % 1);
          hexPath(ctx, px, py, size * (1 + prog * 2.8));
          ctx.strokeStyle = withAlpha(stroke, (1 - prog) * 0.45);
          ctx.lineWidth   = 0.75;
          ctx.stroke();
        }
      }

      // Hover ambient
      if (isHov) {
        hexPath(ctx, px, py, size + 5);
        ctx.fillStyle = 'rgba(45,55,72,0.08)';
        ctx.fill();
      }

      // Node body
      hexPath(ctx, px, py, size);
      ctx.fillStyle   = THREAT_FILL[threat];
      ctx.fill();
      ctx.strokeStyle = isSel
        ? stroke
        : threat !== 'unknown'
        ? withAlpha(stroke, isHov ? 0.85 : 0.60)
        : isHov ? '#2D3748' : '#1F2937';
      ctx.lineWidth   = isSel ? 1.75 : threat !== 'unknown' ? 1.25 : 0.75;
      ctx.stroke();

      // Inner pulse dot on selected
      if (isSel) {
        const pulse = Math.sin(t * 0.003) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 2 + pulse * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
      }

      // Label
      ctx.font         = `${isSel ? '600 ' : ''}9px "JetBrains Mono", monospace`;
      ctx.fillStyle    = isSel
        ? '#00D2FF'
        : isRoute
        ? 'rgba(0,210,255,0.75)'
        : threat !== 'unknown'
        ? withAlpha(stroke, 0.75)
        : TEXT_DIM;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label, px, py + size + 4);
    });
  }, []);

  useEffect(() => {
    const loop = (t: number) => {
      draw(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  const nodeAt = useCallback((e: React.MouseEvent<HTMLCanvasElement>): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    for (const node of NODES) {
      const dx = node.x * canvas.width  - mx;
      const dy = node.y * canvas.height - my;
      if (Math.sqrt(dx * dx + dy * dy) <= 14) return node.id;
    }
    return null;
  }, []);

  const selThreat = selected ? (NODE_THREATS[selected] ?? 'unknown') : 'unknown';

  return (
    <Panel
      title="Gate Network"
      subtitle="hex-node tactical overlay"
      icon={<HexGridIcon size={14} />}
      live
      headerRight={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMapMode(m => m === 'threat' ? 'diplomatic' : 'threat')}
            className={[
              'px-2 py-0.5 rounded font-mono text-[9px] tracking-wider border transition-colors',
              mapMode === 'diplomatic'
                ? 'bg-standing-ally/10 border-standing-ally/40 text-standing-ally'
                : 'bg-transparent border-void-500/50 text-void-500/50 hover:text-alloy-silver/70',
            ].join(' ')}
          >
            {mapMode === 'diplomatic' ? 'DIPLO' : 'THREAT'}
          </button>
          {selected && <ThreatBadge level={selThreat as Threat} compact />}
        </div>
      }
    >
      <canvas
        ref={canvasRef}
        width={480}
        height={220}
        className="w-full block cursor-crosshair"
        onClick={(e) => {
          const hit = nodeAt(e);
          setSelected(hit === selected ? null : hit);
        }}
        onMouseMove={(e) => setHovered(nodeAt(e))}
        onMouseLeave={() => setHovered(null)}
        aria-label="Hex gate network -- click a node to query intel"
        role="img"
      />

      <div className="flex items-center gap-3 px-4 py-2 border-t border-void-700/50 font-mono text-[10px] min-h-[32px]">
        {selected ? (
          <>
            <span className="text-void-500 tracking-wider">LOCKED</span>
            <span className="text-sui-cyan tracking-[0.15em]">{selected.toUpperCase()}</span>
            {intelData?.gate_hostile && (
              <span className="ml-auto text-frontier-crimson animate-flicker">HOSTILE CONTACT</span>
            )}
            {intelData?.gate_toll && !intelData?.gate_hostile && (
              <span className="ml-auto text-frontier-amber">TOLL {intelData.gate_toll.value}</span>
            )}
            {intelData && !intelData.gate_hostile && !intelData.gate_toll && (
              <span className="ml-auto text-void-500/50">NO ACTIVE THREAT</span>
            )}
          </>
        ) : (
          <span className="text-void-500/40 tracking-wider">SELECT NODE TO QUERY INTEL</span>
        )}
      </div>
    </Panel>
  );
}
