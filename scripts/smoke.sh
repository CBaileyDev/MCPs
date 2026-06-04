#!/usr/bin/env bash
#
# Live smoke tests for the networked servers. Hits the real public APIs
# (NHTSA vPIC + recalls, FuelEconomy.gov, OpenStreetMap Overpass, NREL AFDC) to
# catch upstream drift or outage that the hermetic CI matrix cannot — the kind of
# silent breakage that happened when NREL migrated its API domain.
#
# Opt-in and NON-GATING. Each server's smoke suite asserts only STABLE facts
# (a fixed VIN's decode, recall presence on an old vehicle, response shape) and
# SKIPS — rather than fails — on transient upstream errors (429/5xx/timeout), so
# it never cries wolf. A real failure means likely upstream drift, not a defect.
#
# Usage:
#   bash scripts/smoke.sh            # run every networked server's smoke suite
#
# Requires each server's deps to be installed (npm ci / npm install).
set -u

cd "$(dirname "$0")/.." || exit 2

SERVERS=(vpic repair-info fuel-economy-emissions local-auto-services ev-charging-range)
fail=0
SUMMARY=()

for s in "${SERVERS[@]}"; do
  echo "==================== $s ===================="
  if ( cd "servers/$s" && npm run --silent smoke ); then
    SUMMARY+=("PASS  $s")
  else
    SUMMARY+=("FAIL  $s")
    fail=1
  fi
  echo ""
done

echo "==================== summary ===================="
for line in "${SUMMARY[@]}"; do
  echo "  $line"
done
echo ""

if [ "$fail" -ne 0 ]; then
  echo "Smoke FAILED — a live API assertion failed. Investigate possible upstream drift"
  echo "(a moved endpoint, a changed response shape, or missing data)."
  exit 1
fi
echo "Smoke OK. (Skipped suites are tolerated upstream transients, not failures.)"
