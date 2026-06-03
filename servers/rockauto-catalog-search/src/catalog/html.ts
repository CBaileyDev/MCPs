import type { NormalizedPart } from "../domain/types.js";
import type { VehicleCandidate, VehicleQuery } from "./provider.js";

type RockAutoNode = Record<string, unknown>;

export function decodeHtml(input: string): string {
  return input
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

export function stripTags(input: string): string {
  return decodeHtml(input.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRockAutoNodes(html: string): RockAutoNode[] {
  const nodes: RockAutoNode[] = [];
  const matches = html.matchAll(/id="jsn\[[^\]]+\]"\s+value="([^"]+)"/g);

  for (const match of matches) {
    try {
      nodes.push(JSON.parse(decodeHtml(match[1] ?? "")) as RockAutoNode);
    } catch {
      continue;
    }
  }

  return nodes;
}

export function extractVehicleCandidates(html: string, query: VehicleQuery): VehicleCandidate[] {
  const candidates = extractRockAutoNodes(html)
    .filter(node => node.nodetype === "carcode" && typeof node.carcode === "string")
    .map(node => ({
      year: Number(node.year ?? query.year),
      make: String(node.make ?? query.make),
      model: String(node.model ?? query.model),
      engine: typeof node.engine === "string" ? node.engine : undefined,
      carCode: String(node.carcode),
      sourceUrl: buildCatalogUrl({
        year: Number(node.year ?? query.year),
        make: String(node.make ?? query.make),
        model: String(node.model ?? query.model),
        engine: typeof node.engine === "string" ? node.engine : undefined,
        carCode: String(node.carcode)
      })
    }));

  if (candidates.length > 0) {
    return candidates;
  }

  return [
    {
      ...query,
      sourceUrl: buildCatalogUrl(query)
    }
  ];
}

export function extractCategoryNames(html: string, vehicle: VehicleQuery & { engine?: string; carCode?: string }): Array<{ name: string; sourceUrl: string }> {
  const names = new Set<string>();

  for (const node of extractRockAutoNodes(html)) {
    for (const key of ["partgroup", "partcategory", "category"]) {
      const value = node[key];
      if (typeof value === "string" && value.trim().length > 0) {
        names.add(value.trim());
      }
    }
  }

  const hrefMatches = html.matchAll(/href="(\/en\/catalog\/[^"]+)"/g);
  for (const match of hrefMatches) {
    const href = decodeHtml(match[1] ?? "");
    const pieces = href.split(",");
    if (pieces.length >= 6) {
      const possibleCategory = pieces[5]?.replace(/\+/g, " ");
      if (possibleCategory) {
        names.add(stripTags(possibleCategory));
      }
    }
  }

  return [...names]
    .filter(name => name.length > 0)
    .sort((left, right) => left.localeCompare(right))
    .map(name => ({
      name,
      sourceUrl: buildCatalogUrl({ ...vehicle, category: name })
    }));
}

export function extractPageTitle(html: string): string {
  const title = html.match(/<title>(.*?)<\/title>/is)?.[1];
  return title ? stripTags(title) : "RockAuto catalog result";
}

export function createPageLevelPart(options: {
  id: string;
  brand?: string;
  partNumber: string;
  title: string;
  sourceUrl: string;
  fetchedAt: string;
  fitmentNotes?: string[];
}): NormalizedPart {
  return {
    id: options.id,
    brand: options.brand ?? "RockAuto",
    partNumber: options.partNumber,
    title: options.title,
    price: null,
    availability: null,
    fitmentNotes: options.fitmentNotes ?? ["Open the source URL for current listings, warehouses, prices, and fitment notes."],
    sourceUrl: options.sourceUrl,
    fetchedAt: options.fetchedAt
  };
}

export function buildCatalogUrl(input: VehicleQuery & { engine?: string; carCode?: string; category?: string; partType?: string }): string {
  const parts = [slug(input.make), String(input.year), slug(input.model)];

  if (input.engine && input.carCode) {
    parts.push(slug(input.engine), input.carCode);
  }

  if (input.category) {
    parts.push(slug(input.category));
  }

  if (input.partType) {
    parts.push(slug(input.partType));
  }

  return `https://www.rockauto.com/en/catalog/${parts.join(",")}`;
}

export function buildPartSearchUrl(partNumber: string): string {
  const url = new URL("https://www.rockauto.com/en/partsearch/");
  url.searchParams.set("partnum", partNumber.trim());
  return url.toString();
}

function slug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "+");
}
