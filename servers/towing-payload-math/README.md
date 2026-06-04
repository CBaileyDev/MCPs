# towing-payload-math MCP

Deterministic towing and payload arithmetic as an MCP stdio server. Pure math — no API key, no network, no vehicle database.

## What it does (and doesn't do)

This server does the arithmetic and safety-margin checks on numbers **you supply**. It does **not** know any vehicle's ratings. GVWR, GCWR, curb weight, payload capacity, and tongue-weight ratings come from the vehicle's **door-jamb label** and the **manufacturer's towing guide**. Look those up and hand them to this server; it does the math.

## The 4 tools

### `tongue_weight`
Calculates tongue weight or tongue-weight percentage (provide exactly one; the other is derived) and classifies it against the conventional bumper-pull guideline of **10–15% of trailer weight**.
- `< 10%` → too light, trailer sway risk
- `10–15%` → in range
- `> 15%` → heavy (note: gooseneck/5th-wheel rigs intentionally run 15–25%, a different setup)

### `payload_check`
The most commonly overlooked towing constraint: **tongue weight counts against the tow vehicle's payload**, together with passengers and cargo. Payload capacity = GVWR − curb weight (from the door-jamb label). Returns used payload, remaining payload, and whether you're over.

### `towing_headroom`
GCWR (Gross Combined Weight Rating) limits truck + trailer **together**. Many callers confuse GCWR (combined) with GVWR (truck alone). This tool calculates remaining GCWR headroom and the maximum trailer weight at the vehicle's current loaded weight. Use **actual scale weight** of the loaded truck, not curb weight.

### `tow_setup_check`
Consolidated audit: runs all three checks (payload/GVWR, GCWR, tongue weight) in one call and identifies the **binding constraint** — the tightest or failing limit. Ideal for a complete pre-trip safety check.

## No API key required

Pure math, stdio transport. No external services.
