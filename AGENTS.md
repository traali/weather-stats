# AGENTS.md — The Rule of Weather Stats

The canonical, tool-agnostic rule for all AI agents and contributors working in `weather-stats`.

---

## §0 Precedence
1. `AGENTS.md` (this file) is the supreme project rule.
2. Native tool configs (`CLAUDE.md`, `.cursorrules`, etc.) are thin pointers to this file and must contain no independent rules.
3. In conflicts between code comments and `AGENTS.md`, `AGENTS.md` wins.

---

## §1 Identity & Architecture
- **Identity:** Sovereign meteorological micro-service and WebMCP agent interface for the Finnish Youth Sports Federation.
- **Architecture:** Autonomous Vite + React 19 + Tailwind CSS v4 SPA delivering Nova liquid glassmorphic matchday weather cards, interactive radar & satellite imagery drawers, and tri-mounted WebMCP tools (`document.modelContext`, `navigator.modelContext`, `window.modelContext`).

---

## §2 Stack & Invariants

| Use | Never |
|---|---|
| Strict TypeScript (zero `any`) | Ad-hoc `any` casting, unvalidated external payloads |
| React 19 + Tailwind CSS v4 + Framer Motion | Legacy CSS, un-animated jarring layout shifts |
| Nova Design Tokens & Liquid Glassmorphism | Hardcoded random hex colors, broken clamp typography |
| FMI WFS/WMS open data; on failure an explicit "ei saatu" result | Reusing an old reading as current, mocking weather, fabricating lightning strikes |
| Finnish 30/30 Lightning Rule (10 km danger / 20 km watch) | Ignoring player safety or returning unverified clear states |
| WebMCP Tri-Mount Registry + 500 ms SLA postMessage bridge | Breaking standard tool envelopes or exceeding response timeouts |
| Zero template token leaks (`[object Object]`, `[PVM]`, `NaN`, `undefined`) | Emitting unparsed template tokens in UI or WhatsApp briefings |

---

## §3 Testing & Quality Gates
- **Pre-visitation Gate:** Run `npm run visit` before any commit.
- **Contract Verification:** Local types and exports must satisfy `WeatherForecastContract`.
- **Definition of Done:**
  1. `npm run lint` reports 0 errors and 0 warnings.
  2. `npm run typecheck` passes with 0 diagnostics.
  3. `npm test` passes with 100% green tests.
  4. Cross-repo contract compatibility check passes.

---

## §4 Security & Meteorological Integrity
- **Zero Mock, Zero Stale:** When FMI times out, errors, or answers with something that is not a FeatureCollection, return `available: false` (forecast/observation) or lightning `status: 'unknown'` ("Salamatietoa ei saatu"). Never serve a remembered reading as current, never show a failed lightning check as clear, never show a missing (`NaN`) value as 0.
- **Zero Secrets:** Never commit credentials, tokens, or environment keys.
- **Defensive API Ingestion:** Validate and sanitize all external XML/GML/JSON payloads before rendering.
- **Rate-Limiting & Timeouts:** All remote API calls must use `AbortController` (5000 ms ceiling).

---

## §5 Design & Usability ("Nova Protocol")
- **Palette:** Dark canvas (`#090d16`), liquid glassmorphic surfaces (`rgba(17, 24, 39, 0.75)`), hairline borders (`rgba(255, 255, 255, 0.08)`).
- **Responsive Typography:** Mandatory fluid typography `clamp()` formulas per Antigravity Rule 7.
- **Touch Targets:** All buttons and interactive tabs must have minimum 44px height (`min-h-[44px]`).
- **Cards & Visuals:** Smooth spring physics, high-contrast fresh strike pulsing halos (< 15 min), and muted amber older strike indicators.

---

## §6 Visitation (Separation of Duties)
- The author who wrote a change does NOT perform its final audit.
- An independent **Visitor subagent** receives only: `AGENTS.md`, the git diff, and test results (no conversation history).
- **Verdicts:** `PASS` · `PASS WITH FINDINGS` · `BLOCK`
- **Finding Classes:**
  - `blocking`: Security flaw, contract breach, build failure. Must fix before merge.
  - `advisory`: Rule violation without breakage. Fix or log in `DEBT.md`.
- **Fault Attribution:** `house` (fix code) vs `RULE` (amend `AGENTS.md` and log in `ROLL.md`).

---

## §7 Volatile Facts
Do NOT put volatile facts in `AGENTS.md`. Single sources of truth:
- Library versions: `package.json`
- Recent history: `CHANGELOG.md` and git log
- Architecture decisions: `ROLL.md` and `docs/`

## Neighbor check
`npm run visit` includes `scripts/check-neighbors.mjs`: peer AGENTS.md + canonical contract fields + 5-point plans. Do not drop a required contract field without a major version.

