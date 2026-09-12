# ROLL.md — The Chronicle of Weather Stats
Append-only record of architectural decisions, dispensations, rule amendments, and visitation verdicts.

---

## 2026-09-12 — Monastic Pack Alignment with Federation Gold Standard
- **Office / Author:** Archon & Legate
- **Base / Commit:** weather-stats monastery charter
- **Verdict:** PASS
- **Summary:** Completed missing monastic files (`ROLL.md`, `.agent/workflows/*`, `.github/workflows/monastic-visit.yml`) to match pelipaiva / football-stats. `AGENTS.md`, `npm run visit`, and Lefthook were already present. Satisfies `WeatherForecastContract` v1.0.0.

---

## Format for Future Entries:

```markdown
## YYYY-MM-DD — <Title of Change>
- **Office / Author:** <Office Name>
- **Base / Commit:** <sha>
- **Verdict:** PASS | PASS WITH FINDINGS | BLOCK
- **Summary:** <1-2 sentences on what was decided, changed, or amended>
```

## 2026-09-12 — Chapter of Neighbors
- **Office / Author:** Legate
- **Verdict:** PASS
- **Summary:** Vendored check-neighbors.mjs into visit. Graph: federation.neighbors.json. 5-point HOUSE_TEST_SPEC.md. SupportedSport includes weather. Future contract/rule breaks fail closed.
