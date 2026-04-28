# EVE FRONTIER TRIBAL INTELLIGENCE — DESIGN SYSTEM v2.0

**This is the authoritative visual specification for FrontierWarden. All component development and UI implementation must align with this document.**

---

# 1. DESIGN DOCTRINE

## Inspiration References: EVE Frontier Hackathon Winners

| Winner | Pattern to Steal | Your Application |
|---|---|---|
| **CradleOS** (1st) | Dense civilization dashboard with territory/resource/defense/economy modules | Your main intelligence dashboard � killboard + credit bureau + gate control in one view |
| **Civilization Control** (3rd) | Single-interface infrastructure management with clear rule-setting | Your Smart Gate policy editor � drag-to-set reputation thresholds |
| **EasyAssemblies** (Utility) | Beginner-friendly visual configuration for complex on-chain logic | Your reputation schema builder � make attestation rules visual, not code |
| **Frontier Flow** (Technical) | Node-based visual programming, browser-deployed | Your route planner � node graph for gate networks with intel weights |
| **Bazaar** (Creative) | Immersive spatial marketplace, social density | Your bounty marketplace � 3D starfield with bounty targets as luminous objects |
| **Shadow Broker** (Weirdest) | Spycraft aesthetic, intel as tradable artifact | Your killboard + attestation feed � "classified document" visual language |

---

## The North Star Principle

Tufte''s rule: **maximize data-ink ratio** � every pixel either carries information or it gets deleted. This is the exact philosophy FrontierWarden demands. Decoration is treason. Every border, every background element, every visual accent must justify its existence by adding structure, hierarchy, or signal � not atmosphere. Atmosphere comes from the data itself being brutal and real.

---

## Psychological Laws Applied to FrontierWarden

| Law | FrontierWarden Application |
|---|---|
| **Fitts''s Law** | Pass/Deny gate action: largest, most central button in the result screen |
| **Hick''s Law** | Never show more than 5 contract actions at once; filter to context first |
| **Peak–End Rule** | Gate traversal deny screen is disproportionately memorable — it must be sharp, informative, and never feel like a generic error |
| **Jakob''s Law** | Use table conventions from EVE''s own killboards and zkillboard � pilots already have the mental model |
| **Gestalt Proximity** | Group: system health + gate status + recent kills. Separate: reputation scores from live intel � they are different cognitive modes |
| **Visceral 50ms Reaction** | The first render frame communicates power before any data loads � skeleton states must feel like a dark cockpit powering on, not a spinner |

---

# 2. TYPOGRAPHY

## Primary Font Pairing: Oxanium + JetBrains Mono + Departure Mono

**Oxanium** (Google Fonts, OFL license) is a square, futuristic geometric sans with 7 weights. It shares the EVE Frontier Photon UI's core DNA: squared terminals, geometric construction, zero humanist softness. Any EVE player will read it as native to the ecosystem.

**JetBrains Mono** is screen-optimized for small sizes, has clean 0/O and 1/l/I disambiguation, and reads cleanly at any size � critical for the score values and entity IDs in the DispositionMatrix.

**Departure Mono** (self-hosted from departuremono.com) as accent: use in lore text, flavor headers, and flavor popups only � it is powerful atmosphere at those exact sizes (11px or 22px only).

## Hierarchy & Usage

| Role | Font | Weight | Size | Tracking | Line Height |
|---|---|---|---|---|---|
| Panel / section labels | Oxanium | SemiBold | 10–11px | +10% | 1.2 |
| Syndicate names, headings | Oxanium | Bold | 14�18px | +4% | 1.3� |
| Section headers (caps) | Oxanium | SemiBold | 11px | +10–12% | 1.2 |
| Data labels (all-caps) | JetBrains Mono | Regular | 10px | +8% | 1.2 |
| Data values | JetBrains Mono | Regular | 12–13px | 0% | 1.3 |
| Critical alerts, denied gates | JetBrains Mono | Bold | 14px | 0% | 1.1 |
| Body / lore text | JetBrains Mono | Regular | 13px | +1–2% | 1.5 |
| Lore / flavor callouts | Departure Mono | Regular | 11px or 22px only | +2% | 1.4 |
| Tooltip/supporting copy | Oxanium | Regular | 11–12px | +2% | 1.2 |

## Typography Rules

**Monospace Hierarchy Principle:** Monospace carries raw data credibility — it says "telemetry, not interface". Pair monospace data with geometric sans headers to create the contrast between "live feed" and "classified label".

**Optical Correction:** All-caps labels must always have `+8–12%` tracking or they look crushed and amateur. This is the single most consistent tell separating real designers from scaffolded output.

**Tabular Numbers:** Every number column must use tabular/monospace numerals so digits stack vertically at exact pixel-width; proportional numbers in a column create misalignment that the eye detects as disorder.

**Line Height in Tables:** Tighten monospace table rows to `1.2–1.3` — too much air breaks the visual grid and makes scanning harder.

---

# 3. COLOR SYSTEM

## Void Black Done Right

Generic dark UIs use `#000000`. That is wrong, and it's visually abrasive. Build depth purely through **luminance stepping** — each layer is 7–10 lightness points brighter. Shadows read as harsh or invisible in deep-dark UIs; use only luminance.

| Layer | Role | Hex Target |
|---|---|---|
| Base void | Page background | `#08090B` |
| Surface 1 | Cards, panels | `#0F1115` |
| Surface 2 | Elevated modules | `#161A1F` |
| Surface 3 | Active/focused panel | `#1D2229` |
| Border default | Dividers | `#FFFFFF0D` (~5% white) |
| Border active | Focused edges | `#FFFFFF1A` (~10% white) |

## Core Palette (Deep Space)

```css
/* Background Hierarchy (Luminance-stepped) */
--void-900: #030508;        /* Deepest space � app background */
--void-800: #0A0E17;        /* Panel surfaces */
--void-700: #111827;        /* Elevated cards, modals */
--void-600: #1A2236;        /* Hover states, active rows */
--void-500: #243049;        /* Borders, dividers */

/* Accent Spectrum (Recalibrated for dark) */
--sui-cyan: #00D2FF;        /* ~L70 HSL, primary action, links, active gates */
--sui-cyan-glow: rgba(0, 210, 255, 0.15);
--frontier-amber: #F59E0B;  /* ~L65-70, warnings, bounties, heat traps */
--frontier-amber-glow: rgba(245, 158, 11, 0.15);
--tribe-crimson: #EF4444;   /* ~L60, hostile, kills, enemy standing */
--tribe-crimson-glow: rgba(239, 68, 68, 0.15);
--alloy-silver: #94A3B8;    /* Secondary text, inactive states */
--alloy-gold: #FBBF24;      /* Premium features, high reputation */
```

## Semantic Mapping

| Token | Value | Usage | Hackathon Source |
|---|---|---|---|
| `--status-clear` | `#10B981` | Safe gate / no threat | Bazaar "safe zone" ambient |
| `--status-camped` | `#DC2626` | Gate camped / hostile | Shadow Broker "compromised" red |
| `--standing-ally` | `#3B82F6` | Alliance member | CradleOS alliance blue |
| `--standing-neutral` | `--alloy-silver` | Unknown / neutral | Civilization Control default access |
| `--standing-enemy` | `--tribe-crimson` | Kill-on-sight | Blood Contract target highlight |
| `--heat-low` | `#10B981` | Safe zone | Frontier Factional Warfare |
| `--heat-mid` | `#F59E0B` | Contested | Frontier Factional Warfare |
| `--heat-high` | `#DC2626` | Active combat | Frontier Factional Warfare |

## Accent Recalibration for Dark Backgrounds

Dark backgrounds suppress perceived brightness of hues � standard web colors will read wrong:

- **Cyan:** aim for `~L70 in HSL`, desaturate 10�15% from your "feels right" starting point
- **Amber:** `~L65�70`, pull saturation down more aggressively (amber is naturally high-chroma in dark contexts)
- **Danger/red:** `~L60`, reds appear extremely aggressive in dark � use sparingly and at reduced saturation

---

# 4. LAYOUT & COMPONENTS

## Dashboard Grid (CradleOS Dense Module Pattern)

```
+-------------------------------------------------------------+
�  HEADER: Tribe Crest | Search | Wallet | Standing | Alerts  �
+-------------------------------------------------------------�
�              �              �                               �
�  STAR MAP    �  KILLBOARD   �      CREDIT BUREAU            �
�  (Canvas 2D) �  (Scroll)    �      (Score + Loans)          �
�              �              �                               �
�  +--------+  �  +--------+  �  +-------------------------+  �
�  � Gate   �  �  � Latest �  �  � Composite Score: 847    �  �
�  � Network�  �  � Kills  �  �  � ????????????????�����   �  �
�  � Graph  �  �  �        �  �  �                         �  �
�  +--------+  �  +--------+  �  � Loan Capacity: 12,400   �  �
�              �              �  � Active Bounties: 3      �  �
�              �              �  +-------------------------+  �
+-------------------------------------------------------------�
�  BOTTOM DOCK: Gate Policy Editor | Route Planner | Intel Feed�
+-------------------------------------------------------------+
```

## Panel Bolting & Border Grammar

Panels should feel **bolted together like ship systems**, not floated like SaaS cards:

- Borders should **touch, not gap** between adjacent panels
- Gaps filled with `1px` dividers at `~5% opacity`, not whitespace
- The grid is **not rigid** � modular cards with fixed anchor points
- Most critical data lives **upper-left** (natural F-scan pattern)
- Secondary data center, tertiary right

## Gate Policy Editor (Civilization Control + EasyAssemblies Visual Pattern)

Instead of code inputs, use **visual threshold sliders**:

```
[Standing Slider]  Enemy ◀━━━━━━━━━━━━━━━━━━●━━━━━▶ Ally
                   -1000      +247           +1000

[Pirate Index]     Clean ◀━━━━━━━━━━━━━━━━━━●━━━━━▶ Wanted
                   0                   73     100

[Toll Bracket]     Free  ◀━━━━━━━━━━━━━━━━━━●━━━━━▶ 10x
                   (Ally)      (Neutral)     (Enemy)
```

## Component Tokens

### Buttons

```css
/* Primary (Sui Cyan) */
--btn-primary-bg: var(--sui-cyan);
--btn-primary-text: var(--void-900);
--btn-primary-hover: #33DBFF;
--btn-primary-glow: 0 0 20px var(--sui-cyan-glow);

/* Secondary (Ghost) */
--btn-secondary-bg: transparent;
--btn-secondary-border: 1px solid var(--void-500);
--btn-secondary-text: var(--alloy-silver);
--btn-secondary-hover-bg: var(--void-600);

/* Danger (Crimson) */
--btn-danger-bg: var(--tribe-crimson);
--btn-danger-text: #FFFFFF;
--btn-danger-hover: #F87171;

/* Gate Control Specific */
--btn-gate-open: #10B981;
--btn-gate-closed: #DC2626;
--btn-gate-toll: var(--frontier-amber);
```

### Cards / Panels

```css
/* Intelligence Card (Killboard / Attestation) */
--card-bg: var(--void-800);
--card-border: 1px solid var(--void-500);
--card-radius: 6px;
--card-padding: 16px;
--card-hover-bg: var(--void-700);
--card-hover-border: 1px solid var(--sui-cyan);

/* Classified Document (Shadow Broker inspired) */
--classified-stripe: 3px solid var(--frontier-amber);
--classified-bg: rgba(245, 158, 11, 0.05);
```

### Inputs / Forms

```css
--input-bg: var(--void-900);
--input-border: 1px solid var(--void-500);
--input-radius: 4px;
--input-focus-border: var(--sui-cyan);
--input-focus-glow: 0 0 0 2px var(--sui-cyan-glow);
--input-placeholder: #475569;

/* Slider (for gate policy thresholds) */
--slider-track: var(--void-600);
--slider-fill: var(--sui-cyan);
--slider-thumb: #FFFFFF;
--slider-thumb-glow: 0 0 20px var(--sui-cyan-glow);
```

## Scan Path Engineering

- **The most dangerous hostile standing should always be the most visually prominent item** on screen regardless of sort order
- Use weight + color, not position alone
- Apply optical nudges: circles and triangles in grid cells need 1�2px position corrections above mathematical center

---

# 5. MOTION & FEEDBACK

## Motion Timing

Motion in military/intel UIs is not decoration — it is **signal**:

```css
/* Timing (from Frontier Flow's smooth node connections) */
--duration-instant: 100ms;
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;
--duration-ambient: 8000ms;  /* Background starfield drift */

/* Easing */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-snap: cubic-bezier(0.16, 1, 0.3, 1);

/* Specific Patterns */
--transition-panel: all var(--duration-fast) var(--ease-default);
--transition-gate-status: background-color var(--duration-normal) var(--ease-snap);
--transition-route-draw: stroke-dashoffset var(--duration-slow) linear;
--transition-kill-feed: transform var(--duration-fast) var(--ease-snap);
```

## Motion Rules

- **Incoming data rows enter with a 120ms fade-in** from the top of a list, no slide � slides feel consumer-grade
- **Value changes animate as a number roll** (counter increment), not a crossfade � this communicates that the change is real, not a re-render
- **Alert pulses use a single 300ms glow flash**, not a looping animation � looping draws attention indefinitely and fatigues the eye
- **Gate status changes use a color transition with no easing** � instant color snaps communicate binary state changes (`OPEN`/`LOCKED`) more accurately than fades
- **Easing law:** `ease-out` for all entering elements, nothing linear � linear motion reads as machine error, not machine precision

## Glow Effects (Only)

Keep luminance-based depth for surfaces. Use only glow accents for emphasis:

```css
--glow-cyan: 0 0 20px rgba(0, 210, 255, 0.15);
--glow-amber: 0 0 20px rgba(245, 158, 11, 0.15);
--glow-crimson: 0 0 20px rgba(239, 68, 68, 0.15);
```

*Note: Remove drop shadows (`--shadow-md`, `--shadow-lg`) and glassmorphism. Depth comes from luminance stepping, not shadow depth or blur.*

---

# 6. PATTERNS & EXAMPLES

## The Classified Document Aesthetic

Every dossier, every gate record, every reputation profile should feel like intercepted intelligence, not a profile page:

- **Redacted placeholders as live UI pattern** � `[CLASSIFIED]`, `[INSUFFICIENT_CLEARANCE]`, `����` blocks where data isn''t available or trust-gated, using a monospace block character fill. These communicate information about permission levels.
- **Document-style headers** � `PRIORITY: HIGH`, `CLASSIFICATION: TRIBE-ONLY`, `LAST UPDATED: 14:32:07Z` in small-caps monospace before every content block.
- **Timestamp precision as atmosphere** � never show "2 hours ago." Show `2026-04-27T07:32:14Z`. The ISO format reads as machine-origin, not human-friendly, which is exactly right.
- **Sequential identifiers** � every entity gets a prefix code: `ENTITY#0041`, `GATE#7712`, `CONTRACT#0019`. This builds world depth with zero extra visual weight.
- **Degraded/corrupted data visual** � low-confidence intel gets a subtle `opacity: 0.6` treatment with an `[UNVERIFIED]` tag, rather than an icon or warning box. This is how field reports work in real intelligence workflows.

### Killboard Entry (Shadow Broker "Classified Document" Style)

```css
.kill-entry {
  background: var(--void-800);
  border-left: var(--classified-stripe);
  position: relative;
}

.kill-entry::before {
  content: ''VERIFIED'';
  position: absolute;
  top: 4px;
  right: 8px;
  font-family: ''JetBrains Mono'';
  font-size: 11px;
  color: var(--sui-cyan);
  opacity: 0.6;
  letter-spacing: 0.1em;
}

/* Attestation hash as micro-text footer */
.kill-hash {
  font-family: ''JetBrains Mono'';
  font-size: 10px;
  color: var(--void-500);
  letter-spacing: 0.05em;
}
```

### Route Planner (Frontier Flow Node Graph Aesthetic)

- Gates = **nodes** with glow intensity proportional to traffic heat
- Connections = **bezier curves** with color = safety (green / yellow / red)
- Active route = **animated dash stroke** via `--transition-route-draw`
- Hover gate = **expands tooltip** with live attestation badges

### Bounty Marketplace (Bazaar Immersive Spatial Pattern)

- Targets rendered as **luminous objects** in a 3D starfield
- Size = bounty value
- Color = standing (blue ally, gray neutral, red enemy)
- Click = **detail card** slides in from right

## Human Craft Essentials

These are the tells that separate human craft from generated output:

- **Optical nudges on icons** � circles and triangles in grid cells need 1�2px position corrections above mathematical center
- **1px borders as near-white + opacity** � not full-value borders at low opacity; near-white responds correctly to background luminance changes
- **Tabular numbers in columns** � every number column must use tabular/monospace numerals for exact pixel-width stacking
- **The empty state as designed moment** � `DispositionMatrix` before syndicates load, contract queue with no contracts, gate intel pane with no recent kills � all need intentional designed states, not blank panels
- **Hover states that add information** � a `DispositionMatrix` cell on hover should surface the underlying score value and last-updated timestamp in a non-modal tooltip, not just highlight the cell

---

# 7. IMPLEMENTATION APPENDIX

## Spacing & Grid System

```css
/* 8px Base Grid */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
--space-8: 64px;

/* Panel Architecture (from CradleOS dense dashboard) */
--panel-padding: 16px;
--panel-gap: 8px;           /* Tight gaps = information density */
--panel-radius: 6px;        /* Slight rounding, not bubbly */
--panel-border: 1px solid var(--void-500);

/* Z-Index Stack */
--z-base: 0;
--z-sticky: 10;
--z-dropdown: 20;
--z-modal: 30;
--z-toast: 40;
--z-tooltip: 50;
```

## Information Density: The Tufte Mandate

EVE's Photon UI is the cautionary tale — CCP pushed whitespace and the playerbase revolted. FrontierWarden operates at the opposite extreme:

- **Data density = entries per pixel area.** Every panel should ask "can this show more without losing clarity?"
- **Chartjunk = zero.** No decorative grid lines, no gradient fills on bars, no shadow on charts.
- **Small multiples over large singles.** Six small sparklines beat one large chart. The pattern across multiples is the insight.
- **Delta indicators are mandatory.** Every value that can change must show its direction — `↑ +14` next to a score reads in 40ms; "Increased" takes 400ms.
- **Progressive disclosure, not progressive hiding.** Advanced data is accessible via keyboard or hover, not buried behind tabs. Expert users expect everything available at once.

## Responsive Breakpoints

```css
--bp-mobile: 640px;     /* PWA single-column stack */
--bp-tablet: 1024px;    /* 2-column: Map + Panel */
--bp-desktop: 1440px;   /* Full 3-column CradleOS dashboard */
--bp-ultrawide: 1920px; /* Add 4th intel feed column */
```

## Tailwind Config (Ready to Drop In)

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        void: {
          900: '#030508',
          800: '#0A0E17',
          700: '#111827',
          600: '#1A2236',
          500: '#243049',
        },
        sui: {
          cyan: '#00D2FF',
          glow: 'rgba(0, 210, 255, 0.15)',
        },
        frontier: {
          amber: '#F59E0B',
          crimson: '#EF4444',
          gold: '#FBBF24',
        },
        alloy: {
          silver: '#94A3B8',
        },
        status: {
          clear: '#10B981',
          camped: '#DC2626',
        },
        standing: {
          ally:    ''#3B82F6'',
          neutral: ''#94A3B8'',
          enemy:   ''#EF4444'',
        },
      },
      fontFamily: {
        oxanium: [''Oxanium'', ''sans-serif''],
        mono:    [''JetBrains Mono'', ''monospace''],
        departure: [''Departure Mono'', ''monospace''],
      },
      boxShadow: {
        ''glow-cyan'':    ''0 0 20px rgba(0, 210, 255, 0.15)'',
        ''glow-amber'':   ''0 0 20px rgba(245, 158, 11, 0.15)'',
        ''glow-crimson'': ''0 0 20px rgba(239, 68, 68, 0.15)'',
      },
      animation: {
        ''route-draw'': ''dash 2s linear infinite'',
        ''pulse-slow'': ''pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite'',
      },
    },
  },
}
```

## Font Import

```css
@import url(''https://fonts.googleapis.com/css2?family=Oxanium:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap'');

/* Departure Mono: self-host as woff2 from departuremono.com */
@font-face {
  font-family: ''Departure Mono'';
  src: url(''/fonts/departure-mono.woff2'') format(''woff2'');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

## Design Spec Checkpoint

You now have doctrine. The next step is not to design a screen � it is to write a **one-page design spec** that locks:

1. The six-layer color scale (void-900 through void-500)
2. The font pairing decision (Oxanium + JetBrains Mono + Departure Mono)
3. The panel border grammar (touching, 1px dividers at ~5% opacity)
4. The three canonical states for every data element (`live`, `stale`, `unavailable`)

That spec becomes the ground truth Claude Code builds against. Without it, every generated component will drift.
