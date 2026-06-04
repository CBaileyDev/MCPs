import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ok } from "../result.js";
import * as afdc from "../providers/afdc.js";
import * as ocm from "../providers/open-charge-map.js";
import { estimateRangeMargin } from "../domain/range.js";
import { getOcmKey } from "../safety/api-keys.js";
import type { ChargingStation } from "../domain/chargers.js";

const AFDC_ATTRIBUTION = "U.S. DOE/NREL Alternative Fuels Data Center";
const OCM_ATTRIBUTION = "Open Charge Map contributors";
const STATUS_CAVEAT = "Station status is source-reported and may be stale — verify before relying on it.";

const DEMO_KEY_NOTE =
  "Note: No AFDC_API_KEY environment variable is set; using DEMO_KEY which is rate-limited. " +
  "A free key from developer.nlr.gov is recommended for production use.";

export function registerEvChargingTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // 1. find_chargers
  // -----------------------------------------------------------------------
  server.registerTool(
    "find_chargers",
    {
      title: "Find EV Chargers",
      description:
        "Find EV charging stations near a location using NREL AFDC (always) and Open Charge Map (when a key is configured). " +
        "Returns a merged list of nearby stations with connector types, networks, access codes, and source attribution. " +
        "Station status is source-reported and may be stale.",
      inputSchema: {
        latitude: z.number().describe("Latitude of the search center"),
        longitude: z.number().describe("Longitude of the search center"),
        radiusMiles: z.number().min(0.1).max(100).optional().default(10).describe("Search radius in miles (max 100)"),
        limit: z.number().int().min(1).max(50).optional().default(20).describe("Max stations to return per source (max 50)"),
        connector: z.string().optional().describe("Optional connector type filter (e.g. J1772, CHADEMO, J1772COMBO, TESLA)"),
        network: z.string().optional().describe("Optional network name filter (case-insensitive partial match)")
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ latitude, longitude, radiusMiles, limit, connector, network }) => {
      const radius = radiusMiles ?? 10;
      const maxResults = limit ?? 20;

      const sourcesQueried: string[] = [];
      const notes: string[] = [];
      let allStations: ChargingStation[] = [];

      // AFDC — always
      const afdcResult = await afdc.findNearest({
        lat: latitude,
        lon: longitude,
        radiusMiles: radius,
        limit: maxResults,
        connector
      });
      sourcesQueried.push("AFDC");
      allStations = [...allStations, ...afdcResult.stations];
      if (afdcResult.usingDemoKey) {
        notes.push(DEMO_KEY_NOTE);
      }

      // OCM — only if key is set; track whether it was queried separately from result count
      const ocmKeySet = getOcmKey() != null;
      const ocmStations = await ocm.findNearby({
        lat: latitude,
        lon: longitude,
        radiusMiles: radius,
        limit: maxResults,
        connector
      });
      if (ocmKeySet) {
        sourcesQueried.push("OCM");
      }
      if (ocmStations.length > 0) {
        allStations = [...allStations, ...ocmStations];
      }

      // Optional network filter
      let filtered = allStations;
      if (network) {
        const lower = network.toLowerCase();
        filtered = allStations.filter(s => s.network?.toLowerCase().includes(lower));
      }

      // Sort by distance (stations without distance go last)
      filtered.sort((a, b) => {
        if (a.distanceMiles == null && b.distanceMiles == null) return 0;
        if (a.distanceMiles == null) return 1;
        if (b.distanceMiles == null) return -1;
        return a.distanceMiles - b.distanceMiles;
      });

      return ok({
        stations: filtered,
        count: filtered.length,
        sourcesQueried,
        attribution: sourcesQueried.includes("OCM")
          ? `${AFDC_ATTRIBUTION}; ${OCM_ATTRIBUTION}`
          : AFDC_ATTRIBUTION,
        caveat: STATUS_CAVEAT,
        notes
      });
    }
  );

  // -----------------------------------------------------------------------
  // 2. get_charger_details
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_charger_details",
    {
      title: "Get Charger Details",
      description:
        "Get detailed information for a single charging station by ID. " +
        "Currently supports AFDC station IDs. " +
        "Station status is source-reported and may be stale.",
      inputSchema: {
        id: z.string().min(1).describe("Station ID"),
        source: z.enum(["afdc", "ocm"]).optional().default("afdc").describe("Data source for the ID (default: afdc)")
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ id, source }) => {
      const src = source ?? "afdc";
      if (src === "afdc") {
        const station = await afdc.getById(id);
        return ok({
          station,
          attribution: AFDC_ATTRIBUTION,
          caveat: STATUS_CAVEAT
        });
      }
      // OCM get-by-id not implemented in v1 (no dedicated endpoint used)
      return ok({
        error: "OCM get-by-id is not available in this version. Use find_chargers to search by location.",
        attribution: OCM_ATTRIBUTION
      });
    }
  );

  // -----------------------------------------------------------------------
  // 3. compare_chargers
  // -----------------------------------------------------------------------
  server.registerTool(
    "compare_chargers",
    {
      title: "Compare Chargers",
      description:
        "Compare 2–5 charging stations side by side. " +
        "Accepts either a list of AFDC station IDs or pre-resolved station objects. " +
        "Compares connector types, charge levels, network, access, pricing, and status.",
      inputSchema: {
        ids: z.array(z.string().min(1)).min(2).max(5).optional().describe("2–5 AFDC station IDs to compare"),
        stations: z
          .array(
            z.object({
              id: z.string(),
              source: z.enum(["afdc", "ocm"]).optional(),
              name: z.string(),
              lat: z.number(),
              lon: z.number(),
              network: z.string().optional(),
              connectors: z.array(z.string()),
              dcFastCount: z.number().optional(),
              level2Count: z.number().optional(),
              accessCode: z.string().optional(),
              pricing: z.string().optional(),
              phone: z.string().optional(),
              status: z.string().optional(),
              statusNote: z.string().optional(),
              distanceMiles: z.number().optional(),
              address: z.string().optional()
            })
          )
          .min(2)
          .max(5)
          .optional()
          .describe("2–5 pre-resolved station objects to compare")
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ ids, stations: inputStations }) => {
      let stationsToCompare: ChargingStation[] = [];

      if (inputStations && inputStations.length >= 2) {
        stationsToCompare = inputStations as ChargingStation[];
      } else if (ids && ids.length >= 2) {
        // Fetch each AFDC station
        stationsToCompare = await Promise.all(ids.map(id => afdc.getById(id)));
      } else {
        return ok({
          error: "Provide either 'ids' (2–5 AFDC station IDs) or 'stations' (2–5 station objects)."
        });
      }

      const comparison = stationsToCompare.map(s => ({
        id: s.id,
        source: s.source,
        name: s.name,
        address: s.address,
        network: s.network ?? "Unknown",
        connectors: s.connectors,
        dcFastCount: s.dcFastCount ?? null,
        level2Count: s.level2Count ?? null,
        accessCode: s.accessCode ?? "unknown",
        pricing: s.pricing ?? "not reported",
        status: s.status ?? "not reported",
        distanceMiles: s.distanceMiles ?? null,
        phone: s.phone ?? null
      }));

      return ok({
        comparison,
        count: comparison.length,
        attribution: AFDC_ATTRIBUTION,
        caveat: STATUS_CAVEAT
      });
    }
  );

  // -----------------------------------------------------------------------
  // 4. estimate_range_margin
  // -----------------------------------------------------------------------
  server.registerTool(
    "estimate_range_margin",
    {
      title: "Estimate Range Margin",
      description:
        "Calculate a conservative EV range margin for a trip. " +
        "Supply either (batteryKwh + efficiencyMiPerKwh) or epaRangeMiles as the range basis. " +
        "All estimates include explicit assumptions, caveats, and a risk classification (ok/tight/insufficient). " +
        "This is a pure calculation — no live data is fetched.",
      inputSchema: {
        tripMiles: z.number().positive().describe("Trip distance in miles"),
        startSocPercent: z.number().min(0).max(100).describe("Starting state of charge (0-100%)"),
        batteryKwh: z.number().positive().optional().describe("Battery pack capacity in kWh"),
        efficiencyMiPerKwh: z.number().positive().optional().describe("Efficiency in miles per kWh"),
        epaRangeMiles: z.number().positive().optional().describe("EPA rated range in miles at 100% SOC"),
        targetReservePercent: z
          .number()
          .min(0)
          .max(50)
          .optional()
          .default(10)
          .describe("Target reserve SOC % to keep at destination (default 10%)"),
        deratePercent: z
          .number()
          .min(0)
          .max(50)
          .optional()
          .default(0)
          .describe("Conservative derate % for weather/speed/load (default 0; 10-20% is common)")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({
      tripMiles,
      startSocPercent,
      batteryKwh,
      efficiencyMiPerKwh,
      epaRangeMiles,
      targetReservePercent,
      deratePercent
    }) => {
      const result = estimateRangeMargin({
        tripMiles,
        startSocPercent,
        batteryKwh,
        efficiencyMiPerKwh,
        epaRangeMiles,
        targetReservePercent: targetReservePercent ?? 10,
        deratePercent: deratePercent ?? 0
      });
      return ok(result);
    }
  );

  // -----------------------------------------------------------------------
  // 5. plan_ev_route
  // -----------------------------------------------------------------------
  server.registerTool(
    "plan_ev_route",
    {
      title: "Plan EV Route (Feasibility, Not Navigation)",
      description:
        "Estimate EV charging feasibility for a multi-leg route. " +
        "IMPORTANT: This tool does NOT perform real road routing. It accepts either an explicit list of legs " +
        "(each with a user-provided distanceMiles) or a straight-line origin-to-destination distance that you label " +
        "as straight-line only. It then runs range math per leg and flags where charging is needed. " +
        "Actual road distances, elevation changes, and traffic can differ significantly from provided values. " +
        "This is a feasibility estimate only — always verify with a real navigation app before departing.",
      inputSchema: {
        legs: z
          .array(
            z.object({
              label: z.string().optional().describe("Descriptive label for this leg (e.g. 'Home to Midpoint')"),
              distanceMiles: z.number().positive().describe("Distance of this leg in miles (user-provided)"),
              lat: z.number().optional().describe("Latitude of the leg endpoint (for finding chargers nearby)"),
              lon: z.number().optional().describe("Longitude of the leg endpoint (for finding chargers nearby)")
            })
          )
          .min(1)
          .max(20)
          .optional()
          .describe("Ordered list of route legs with user-provided distances"),
        originLabel: z.string().optional().describe("Description of the origin"),
        destinationLabel: z.string().optional().describe("Description of the destination"),
        straightLineDistanceMiles: z
          .number()
          .positive()
          .optional()
          .describe(
            "Straight-line (as-the-crow-flies) distance in miles from origin to destination. " +
              "Actual road distance will be longer — this will be labeled as straight-line only."
          ),
        startSocPercent: z.number().min(0).max(100).describe("Starting state of charge (0-100%)"),
        batteryKwh: z.number().positive().optional().describe("Battery pack capacity in kWh"),
        efficiencyMiPerKwh: z.number().positive().optional().describe("Efficiency in miles per kWh"),
        epaRangeMiles: z.number().positive().optional().describe("EPA rated range in miles at 100% SOC"),
        targetReservePercent: z.number().min(0).max(50).optional().default(10).describe("Target reserve % (default 10%)"),
        deratePercent: z.number().min(0).max(50).optional().default(0).describe("Derate % for conditions (default 0)"),
        findChargersNearWaypoints: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, find nearby chargers at each leg endpoint where charging may be needed")
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({
      legs,
      originLabel,
      destinationLabel,
      straightLineDistanceMiles,
      startSocPercent,
      batteryKwh,
      efficiencyMiPerKwh,
      epaRangeMiles,
      targetReservePercent,
      deratePercent,
      findChargersNearWaypoints
    }) => {
      const reservePct = targetReservePercent ?? 10;
      const deratePct = deratePercent ?? 0;

      // Build the list of legs to evaluate
      let routeLegs: Array<{ label: string; distanceMiles: number; lat?: number; lon?: number }> = [];

      if (legs && legs.length > 0) {
        routeLegs = legs.map((leg, i) => ({
          label: leg.label ?? `Leg ${i + 1}`,
          distanceMiles: leg.distanceMiles,
          lat: leg.lat,
          lon: leg.lon
        }));
      } else if (straightLineDistanceMiles != null) {
        routeLegs = [
          {
            label: `${originLabel ?? "Origin"} → ${destinationLabel ?? "Destination"} (straight-line only)`,
            distanceMiles: straightLineDistanceMiles
          }
        ];
      } else {
        return ok({
          error: "Provide either 'legs' (with per-leg distances) or 'straightLineDistanceMiles'.",
          routingDisclaimer:
            "This tool does not perform real road routing. Distances must be provided by the caller."
        });
      }

      // Evaluate each leg
      let currentSoc = startSocPercent;
      const legResults = [];
      const chargingRecommendations = [];

      for (const leg of routeLegs) {
        const margin = estimateRangeMargin({
          tripMiles: leg.distanceMiles,
          startSocPercent: currentSoc,
          batteryKwh,
          efficiencyMiPerKwh,
          epaRangeMiles,
          targetReservePercent: reservePct,
          deratePercent: deratePct
        });

        const needsCharge = !margin.withinReserve || margin.risk === "insufficient";

        let nearbyChargers = null;
        if (needsCharge && findChargersNearWaypoints && leg.lat != null && leg.lon != null) {
          try {
            const { stations: found, usingDemoKey } = await afdc.findNearest({
              lat: leg.lat,
              lon: leg.lon,
              radiusMiles: 10,
              limit: 5
            });
            nearbyChargers = {
              stations: found.slice(0, 5),
              attribution: AFDC_ATTRIBUTION,
              note: usingDemoKey ? DEMO_KEY_NOTE : undefined
            };
          } catch {
            nearbyChargers = { error: "Could not fetch nearby chargers for this waypoint." };
          }
        }

        legResults.push({
          label: leg.label,
          distanceMiles: leg.distanceMiles,
          startSocPercent: currentSoc,
          estimatedArrivalSocPercent: margin.arrivalSocPercent,
          marginMiles: margin.marginMiles,
          risk: margin.risk,
          withinReserve: margin.withinReserve,
          chargingNeeded: needsCharge,
          nearbyChargers
        });

        if (needsCharge) {
          chargingRecommendations.push(
            `Charging recommended before or during "${leg.label}" (risk: ${margin.risk}, margin: ${margin.marginMiles} miles).`
          );
        }

        // Update SOC for the next leg (use arrival SOC, clamped to 0)
        currentSoc = Math.max(0, margin.arrivalSocPercent);
      }

      return ok({
        routingDisclaimer:
          "IMPORTANT: This is a range and charging FEASIBILITY ESTIMATE only, NOT real road routing. " +
          "Distances used are as provided by the caller (straight-line or user-estimated). " +
          "Actual road distances, elevation changes, and traffic conditions will differ. " +
          "Always verify with a real navigation application before departing.",
        legs: legResults,
        chargingRecommendations,
        overallRisk: legResults.some(l => l.risk === "insufficient")
          ? "insufficient"
          : legResults.some(l => l.risk === "tight")
            ? "tight"
            : "ok",
        assumptions: {
          startSocPercent,
          batteryKwh,
          efficiencyMiPerKwh,
          epaRangeMiles,
          targetReservePercent: reservePct,
          deratePercent: deratePct
        },
        caveat: STATUS_CAVEAT,
        attribution: AFDC_ATTRIBUTION
      });
    }
  );

  // -----------------------------------------------------------------------
  // 6. explain_charging_plan
  // -----------------------------------------------------------------------
  server.registerTool(
    "explain_charging_plan",
    {
      title: "Explain Charging Plan",
      description:
        "Translate a prior EV charging plan or range estimate into plain-language explanation. " +
        "Restates assumptions, explains risk levels, suggests alternatives, and provides full source attribution. " +
        "Pure calculation — no live data fetched.",
      inputSchema: {
        planSummary: z.string().optional().describe("Summary or JSON of the prior plan to explain"),
        risk: z.enum(["ok", "tight", "insufficient"]).optional().describe("Risk level from a prior estimate"),
        marginMiles: z.number().optional().describe("Margin miles from a prior estimate"),
        usableRangeMiles: z.number().optional().describe("Usable range from a prior estimate"),
        tripMiles: z.number().optional().describe("Trip distance"),
        startSocPercent: z.number().optional().describe("Starting SOC %"),
        targetReservePercent: z.number().optional().describe("Target reserve %"),
        deratePercent: z.number().optional().describe("Derate % applied")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ planSummary, risk, marginMiles, usableRangeMiles, tripMiles, startSocPercent, targetReservePercent, deratePercent }) => {
      const lines: string[] = [];

      lines.push("=== EV Charging Plan Explanation ===");
      lines.push("");
      lines.push("ASSUMPTIONS USED:");
      if (startSocPercent != null) lines.push(`  • Starting SOC: ${startSocPercent}%`);
      if (usableRangeMiles != null) lines.push(`  • Estimated usable range from start SOC: ${usableRangeMiles} miles`);
      if (tripMiles != null) lines.push(`  • Trip distance: ${tripMiles} miles`);
      if (targetReservePercent != null) lines.push(`  • Target reserve at destination: ${targetReservePercent}%`);
      if (deratePercent != null && deratePercent > 0)
        lines.push(`  • Conservative derate applied: ${deratePercent}% (for weather, speed, load, etc.)`);
      if (planSummary) lines.push(`  • Plan: ${planSummary}`);

      lines.push("");
      lines.push("RISK ASSESSMENT:");
      if (risk === "ok") {
        lines.push("  ✓ OK — comfortable margin above the reserve target.");
        lines.push("  The route appears feasible with the given parameters, assuming conditions match assumptions.");
      } else if (risk === "tight") {
        lines.push("  ⚠ TIGHT — margin is within the reserve buffer. Proceed with caution.");
        lines.push("  Consider: lower speed (improves efficiency), reduce HVAC use, or charge briefly en route.");
      } else if (risk === "insufficient") {
        lines.push("  ✗ INSUFFICIENT — the trip cannot be completed within the reserve target.");
        lines.push("  You will need to charge en route. Use find_chargers to locate stations along the way.");
      } else {
        lines.push("  Risk level not provided. Run estimate_range_margin for a full assessment.");
      }

      if (marginMiles != null) {
        lines.push(`  Margin above reserve: ${marginMiles} miles.`);
      }

      lines.push("");
      lines.push("ALTERNATIVES TO CONSIDER:");
      lines.push("  • Charge to a higher SOC before departure.");
      lines.push("  • Apply a conservative derate (10–20%) for cold weather, highway driving, or load.");
      lines.push("  • Plan an intermediate charge stop using find_chargers.");
      lines.push("  • Use plan_ev_route for a multi-leg feasibility estimate.");

      lines.push("");
      lines.push("CAVEATS:");
      lines.push("  • Estimates are based on provided figures; actual range varies with real-world conditions.");
      lines.push("  • Station status is source-reported and may be stale — verify before relying.");
      lines.push("  • This estimate does NOT constitute a guarantee of range sufficiency.");
      lines.push("  • plan_ev_route is a feasibility estimate, NOT real road routing.");

      lines.push("");
      lines.push("DATA SOURCES:");
      lines.push(`  • ${AFDC_ATTRIBUTION}`);
      lines.push(`  • ${OCM_ATTRIBUTION} (when OCM key is configured)`);

      return ok({
        explanation: lines.join("\n"),
        risk,
        marginMiles,
        sourceAttribution: [AFDC_ATTRIBUTION, OCM_ATTRIBUTION]
      });
    }
  );
}
