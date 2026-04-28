// Icons.tsx -- Custom EVE Frontier tactical SVG icon library.
// Pure SVG paths -- no external icon libraries.
// Design language: angular, geometric, precision-instrument.
// Usage: <HexGridIcon className="w-4 h-4 text-sui-cyan" />

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 16,
  className = '',
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

// Gate Network -- hexagonal node cluster
export function HexGridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5 L10.5 4 L10.5 7 L8 8.5 L5.5 7 L5.5 4 Z" />
      <path d="M8 8.5 L10.5 10 L10.5 13 L8 14.5 L5.5 13 L5.5 10 Z" strokeOpacity="0.4" />
      <path d="M10.5 4 L13 5.5 L13 8.5 L10.5 10" strokeOpacity="0.4" />
      <path d="M5.5 4 L3 5.5 L3 8.5 L5.5 10" strokeOpacity="0.4" />
    </Icon>
  );
}

// Intel / Radar sweep
export function RadarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.5" strokeOpacity="0.5" />
      <path d="M8 8 L12.5 4.5" strokeWidth="1.4" />
      <circle cx="11" cy="5.5" r="0.8" fill="currentColor" stroke="none" />
    </Icon>
  );
}

// Attestation / Data Feed -- stacked signal bars
export function DataFeedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 5 L14 5" />
      <path d="M2 8.5 L10 8.5" />
      <path d="M2 12 L12 12" />
      <circle cx="13.5" cy="11" r="1.8" strokeOpacity="0.8" />
      <path d="M13.5 9.2 L13.5 7.5" />
    </Icon>
  );
}

// Leaderboard / Trophy silhouette
export function LeaderboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3 H11 V8 A3 3 0 0 1 5 8 Z" />
      <path d="M5 5.5 H3.5 A1 1 0 0 0 3.5 8.5 H5" />
      <path d="M11 5.5 H12.5 A1 1 0 0 1 12.5 8.5 H11" />
      <path d="M8 11 V13" />
      <path d="M5.5 13 H10.5" />
    </Icon>
  );
}

// Vault / Wallet -- safe door with dial
export function VaultIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 8 L10 6.5" strokeWidth="1.4" />
      <path d="M13.5 6 L14.5 6" />
      <path d="M13.5 10 L14.5 10" />
      <path d="M4 13.5 L4 15" />
      <path d="M12 13.5 L12 15" />
    </Icon>
  );
}

// Crosshair / Scan target
export function CrosshairIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 2 V5 M8 11 V14 M2 8 H5 M11 8 H14" />
    </Icon>
  );
}

// Shield -- for threat/security
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2 L13 4.5 V9.5 Q13 13 8 15 Q3 13 3 9.5 V4.5 Z" />
      <path d="M8 6.5 V9.5" strokeWidth="1.5" />
      <circle cx="8" cy="11" r="0.8" fill="currentColor" stroke="none" />
    </Icon>
  );
}

// Network / Signal strength
export function SignalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 13 L2 11.5" strokeWidth="2.5" />
      <path d="M5.5 13 L5.5 9"   strokeWidth="2.5" />
      <path d="M9 13 L9 6.5"     strokeWidth="2.5" />
      <path d="M12.5 13 L12.5 3" strokeWidth="2.5" />
    </Icon>
  );
}

// Jump Gate -- for selected gate indicator
export function GateIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 1.5 L14 5 L14 11 L8 14.5 L2 11 L2 5 Z" />
      <path d="M8 5 L11 6.8 L11 9.2 L8 11 L5 9.2 L5 6.8 Z" strokeOpacity="0.5" />
    </Icon>
  );
}

// Flare / Beacon -- for status indicators
export function BeaconIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" />
      <path d="M5 5 A4.2 4.2 0 0 0 5 11" />
      <path d="M11 5 A4.2 4.2 0 0 1 11 11" />
      <path d="M3 3 A7.1 7.1 0 0 0 3 13" strokeOpacity="0.45" />
      <path d="M13 3 A7.1 7.1 0 0 1 13 13" strokeOpacity="0.45" />
    </Icon>
  );
}

// Classified -- padlock
export function ClassifiedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="8" width="8" height="6" rx="1" />
      <path d="M6 8 V6 A2 2 0 0 1 10 6 V8" />
      <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

// Star / Rank-1 medal -- 5-pointed, hollow stroke
export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2 L9.6 6.2 L14 6.2 L10.5 8.9 L11.8 13 L8 10.5 L4.2 13 L5.5 8.9 L2 6.2 L6.4 6.2 Z" />
    </Icon>
  );
}

// Diamond / High-value marker
export function DiamondIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2 L13 8 L8 14 L3 8 Z" />
      <path d="M3 8 L8 6 L13 8 M8 6 L8 14" strokeOpacity="0.35" />
    </Icon>
  );
}

// Send / Transmit -- angular paper-plane silhouette
export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 2 L14 8 L2 14 L5 8 Z" />
      <path d="M5 8 L14 8" strokeOpacity="0.5" />
    </Icon>
  );
}

// Tribe / Syndicate -- three interlocked hexes representing factions
export function TribeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2 L10 3.2 L10 5.8 L8 7 L6 5.8 L6 3.2 Z" />
      <path d="M12 6.5 L14 7.7 L14 10.3 L12 11.5 L10 10.3 L10 7.7 Z" strokeOpacity="0.7" />
      <path d="M4 6.5 L6 7.7 L6 10.3 L4 11.5 L2 10.3 L2 7.7 Z" strokeOpacity="0.7" />
      <path d="M8 7 L10 7.7 M8 7 L6 7.7" strokeOpacity="0.35" />
    </Icon>
  );
}
