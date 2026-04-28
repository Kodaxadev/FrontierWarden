# ROUTING_SPEC — Ship Mechanics & Navigation
## EVE Frontier Tribal Intelligence Protocol
### Week 5 — Pathfinding & Route Planning
### Extracted from MASTER_FINDINGS_REPORT.md Section 9

---

## SHIP MECHANICS & ROUTING

### 9.1 Jump Range Formula

```
range = (ΔT × C_eff × M_hull) / (3 × M_current)

Where:
  ΔT = 150 - ship_temperature (equilibrates to system external temp)
  C_eff = specific_heat × (1 + adaptive_level × 0.02)
  M_hull = ship base mass in kg
  M_current = total loaded mass (hull + cargo + fuel)
```

**Interpretation:** Jump range is inversely proportional to loaded mass and directly proportional to the temperature differential and ship's heat dissipation characteristics. Cargo and fuel loading reduce range significantly.

Source: [^99^] EF-Map AI Facts — Ship Mechanics

---

### 9.2 External Temperature (Heat Index)

```
H(D) = 100 × (2/π) × arctan(K × 2π × √(L / L_sun) / D)

Where:
  L_sun = 3.828 × 10²⁶ watts (solar luminosity constant)
  K = 100 (distance scale constant)
  D = distance from star in light-seconds
```

**Critical thresholds:**

| Zone | Temperature | Effect |
|---|---|---|
| **Red (heat trap)** | ≥ 90 | **No fuel jumps possible** — must use smart gates |
| **Orange** | 80–89 | Significantly reduced range (≈60% of normal) |
| **Yellow** | 70–79 | Moderately reduced range (≈80% of normal) |
| **White (safe)** | < 70 | Normal range |

**Tactical implication:** Red zones are natural chokepoints for gate camping. High-heat systems protect interior bases from rapid reinforcement. Route planners must flag heat-trap distances.

Source: [^99^]

---

### 9.3 Ship Specifications

| Ship | Mass (kg) | Specific Heat | Fuel Capacity | Cargo |
|---|---|---|---|---|
| **Reflex** (starter) | 9,750,000 | 3.0 | 1,750 | 520 m³ |
| **Recurve** | 10,200,000 | 1.0 | 970 | 520 m³ |
| **Lai** | 18,929,160 | 2.5 | 2,400 | 1,040 m³ |
| **USV** | 30,266,600 | 1.8 | 2,420 | 3,120 m³ |
| **Maul** (capital) | 548,435,920 | 2.5 | 24,160 | 20,800 m³ |

**Analysis:**
- **Reflex** (3.0 specific heat) is the only ship with superior heat dissipation — highest range per ton
- **Recurve** (1.0 specific heat) has minimal heat dissipation; range suffers significantly at full cargo
- **Maul** carries 20x the cargo of a Lai but has ~58× the mass — cargo efficiency is poor for capitals
- Smart gates and stargates bypass all fuel constraints entirely

Source: [^99^]

---

### 9.4 Fuel & Distance

```
distance = (fuel_quantity × fuel_quality) / (0.0000001 × ship_mass)
```

**Fuel quality varies by type:**
- SOF-40 = 0.40 quality (poor)
- Standard issue = 0.60–0.80 quality
- Premium fuel = 0.95–1.0 quality

**Critical rule:** Smart Gates and stargates cost **zero fuel**. Only raw space jumps consume fuel.

**Implication:** Routing algorithms should heavily favor gate networks over raw jumps when traversing dense regions.

---

### 9.5 Routing Algorithms

| Algorithm | Use Case | Performance |
|---|---|---|
| **A*** | Fast heuristic pathfinding; may use slightly more fuel | 10–50ms; acceptable for real-time UI |
| **Dijkstra** | Optimal fuel/jump count guarantee; slower | 100–500ms; batch queries |
| **Dijkstra WASM** | Compiled Dijkstra; 2–5× speed improvement | 20–100ms; production standard |
| **Dijkstra WASM Temp-Limited** | Temperature-aware; avoids heat traps, respects gate-only zones | 30–150ms; mission-critical routes |

**Recommendation:** Deploy Dijkstra WASM for baseline routing. Use Temp-Limited variant for:
- Reinforcement routing (avoid enemy heat traps)
- Logistics planning (predict fuel consumption)
- Alliance network visualization

Source: [^99^]

---

## IMPLEMENTATION NOTES FOR WEEK 5

1. **Heat index calculation** should be memoized per star; changes only on stellar evolution (rare).
2. **Jump range** varies per ship class — pre-compute for each cargo state (full, half, empty).
3. **Route caching** is critical: same origin-destination queries repeat frequently. TTL = 10 minutes (game resets rare, but possible).
4. **Temperature-aware routing** is strictly opt-in: toggle "avoid heat zones" in UI.
5. **Gate network** is the stable layer — prioritize gate data freshness over raw space topology.

---

## REFERENCES

- [^99^] EF-Map AI Facts — Ship Mechanics (Feb 18, 2026)
- MASTER_FINDINGS_REPORT.md §9 (canonical source)
