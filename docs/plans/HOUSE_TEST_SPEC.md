# Weather Stats — 5-point test spec

1. **User Journey:** Parent checks kickoff turf + lightning before leaving home.
2. **Reason it exists:** Frozen turf and lightning stop junior matches.
3. **What it tests:** `WeatherForecastContract`, FMI, `suspendMatchRecommended`.
4. **When it succeeds:** Coordinates + temperatureC + lightningRiskStatus present.
5. **When it should fail:** Missing WeatherForecastContract; Pages NXDOMAIN left untracked.
