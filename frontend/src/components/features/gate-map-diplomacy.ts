// gate-map-diplomacy.ts -- Canvas draw helpers for diplomatic map mode.
//
// Imported by GateMap.tsx only. Operates on the same canvas context and
// uses shared topology from gate-data.ts + syndicate data from tribe-data.ts.
//
// Single responsibility: draw-time diplomacy rendering. No React, no state.

import {
  NODES, EDGES,
}                          from '../../lib/gate-data';
import {
  syndicateOf,
  dispositionBetween,
  SYNDICATES,
  DISPOSITION_COLOR,
}                          from '../../lib/tribe-data';
import type { Disposition } from '../../lib/tribe-data';

// ---------------------------------------------------------------------------
// Internal draw helpers (mirrors GateMap's hexPath/withAlpha)
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

function withAlpha(hex: string, a: number): string {
  return hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

const DISP_EDGE_ALPHA: Record<Disposition, number> = {
  ally:    0.55,
  neutral: 0.18,
  hostile: 0.50,
};

const DISP_DASH: Record<Disposition, number[]> = {
  ally:    [],          // solid — allied connections
  neutral: [2, 5],      // sparse dots
  hostile: [4, 3],      // warning dashes
};

// ---------------------------------------------------------------------------
// Diplomatic edge pass
// ---------------------------------------------------------------------------

export function drawDiplomaticEdges(
  ctx:    CanvasRenderingContext2D,
  W:      number,
  H:      number,
  selIdx: number,
  rte:    string[],
): void {
  EDGES.forEach(({ a, b }) => {
    const nA   = NODES[a];
    const nB   = NODES[b];
    const sA   = syndicateOf(nA.id);
    const sB   = syndicateOf(nB.id);
    const disp = dispositionBetween(sA, sB);
    const col  = disp === 'ally' && sA === sB
      ? SYNDICATES[sA].hexColor          // intra-syndicate: own color
      : DISPOSITION_COLOR[disp];
    const active = a === selIdx || b === selIdx;
    const alpha  = active ? 0.80 : DISP_EDGE_ALPHA[disp];

    ctx.beginPath();
    ctx.moveTo(nA.x * W, nA.y * H);
    ctx.lineTo(nB.x * W, nB.y * H);
    ctx.setLineDash(active ? [] : DISP_DASH[disp]);
    ctx.strokeStyle = withAlpha(col, alpha);
    ctx.lineWidth   = active ? 1.75 : 0.9;
    ctx.stroke();
  });
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// Diplomatic node pass
// ---------------------------------------------------------------------------

export function drawDiplomaticNodes(
  ctx: CanvasRenderingContext2D,
  W:   number,
  H:   number,
  sel: string | null,
  hov: string | null,
  rte: string[],
  t:   number,
): void {
  NODES.forEach((node) => {
    const sid    = syndicateOf(node.id);
    const syn    = SYNDICATES[sid];
    const px     = node.x * W;
    const py     = node.y * H;
    const isSel  = node.id === sel;
    const isHov  = node.id === hov && !isSel;
    const isRoute = rte.length > 0 && rte.includes(node.id);
    const size   = isSel ? 9 : isHov ? 7.5 : 6;
    const col    = syn.hexColor;

    // Radial glow
    const glowR = isSel ? size * 5 : size * 3;
    const grd   = ctx.createRadialGradient(px, py, 0, px, py, glowR);
    grd.addColorStop(0, syn.glowRgba + (isSel ? '0.50)' : '0.22)'));
    grd.addColorStop(1, syn.glowRgba + '0)');
    ctx.beginPath();
    ctx.arc(px, py, glowR, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Route ring (cyan, same as threat mode)
    if (isRoute && !isSel) {
      hexPath(ctx, px, py, size + 5);
      ctx.strokeStyle = 'rgba(0,210,255,0.50)';
      ctx.lineWidth   = 1.25;
      ctx.stroke();
    }

    // Beacon rings on selected
    if (isSel) {
      for (let r = 0; r < 3; r++) {
        const prog = ((t * 0.0005 + r / 3) % 1);
        hexPath(ctx, px, py, size * (1 + prog * 2.8));
        ctx.strokeStyle = withAlpha(col, (1 - prog) * 0.45);
        ctx.lineWidth   = 0.75;
        ctx.stroke();
      }
    }

    // Node body
    hexPath(ctx, px, py, size);
    ctx.fillStyle   = withAlpha(col, isSel ? 0.22 : 0.10);
    ctx.fill();
    ctx.strokeStyle = withAlpha(col, isSel ? 1.0 : isHov ? 0.85 : 0.55);
    ctx.lineWidth   = isSel ? 1.75 : 1.25;
    ctx.stroke();

    // Inner pulse on selected
    if (isSel) {
      const pulse = Math.sin(t * 0.003) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(px, py, 2 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }

    // Label
    ctx.font         = `${isSel ? '600 ' : ''}9px "JetBrains Mono", monospace`;
    ctx.fillStyle    = isSel
      ? col
      : isRoute
      ? 'rgba(0,210,255,0.75)'
      : withAlpha(col, 0.70);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(node.label, px, py + size + 4);
  });
}
