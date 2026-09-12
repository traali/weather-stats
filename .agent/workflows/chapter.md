# Workflow: Chapter (Session Opening Rite)
The opening rite for any agent session in `weather-stats`.

## Steps
1. **Read `AGENTS.md`**: Verify non-negotiables, stack rules, and testing requirements.
2. **Read the tail of `ROLL.md`**: Review the last ~10 entries to understand recent decisions and dead ends.
3. **Read the Task**: Understand the user request or feature spec.
4. **Select Accountable Office & Model Tier**:
   - `cellarer_office`: Vite/PWA config, package scripts, edge caching (`pro`/`flash`)
   - `scriptorium_office`: FMI WFS/WMS/GML parsers, radar tile ingest (`pro`/`flash`)
   - `prior_office`: Forecast state, 30/30 lightning rule, turf condition math (`pro`)
   - `works_office`: Nova glass weather cards, radar/satellite drawers (`inherit`/`flash`)
   - `sacrist_office`: Unit test suites, deterministic FMI fixtures (`flash`)
   - `legate_office`: `WeatherForecastContract` conformance with Pelipäivä (`pro`/`inherit`)
   - `visitor_office`: Clean-room adversarial audit (`pro`/`inherit`)
5. **Plan Before Execution**: Formulate a concise plan. For major changes, write an implementation plan.
