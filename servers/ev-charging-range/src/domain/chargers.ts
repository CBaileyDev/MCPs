/** Unified charging station representation, normalised from any provider. */
export interface ChargingStation {
  id: string;
  source: "afdc" | "ocm";
  name: string;
  lat: number;
  lon: number;
  network?: string;
  connectors: string[];
  dcFastCount?: number;
  level2Count?: number;
  accessCode?: string;
  pricing?: string;
  phone?: string;
  /** Human-readable status derived from provider data. Omitted if source did not provide it. */
  status?: string;
  /** Always set alongside status: warns that the value may be stale. */
  statusNote?: string;
  distanceMiles?: number;
  address?: string;
}

// ---------------------------------------------------------------------------
// AFDC normalisation
// ---------------------------------------------------------------------------

/** Raw AFDC station shape (relevant fields only). */
export interface AfdcStation {
  id: number;
  station_name: string;
  latitude: number;
  longitude: number;
  ev_network?: string | null;
  ev_connector_types?: string[] | null;
  ev_dc_fast_num?: number | null;
  ev_level2_evse_num?: number | null;
  access_code?: string | null;
  ev_pricing?: string | null;
  station_phone?: string | null;
  status_code?: string | null;
  distance?: number | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
}

function afdcStatusToHuman(code: string | null | undefined): string | undefined {
  if (code == null) return undefined;
  switch (code) {
    case "E":
      return "available";
    case "P":
      return "planned";
    case "T":
      return "temporarily unavailable";
    default:
      return code;
  }
}

/** Normalise a raw AFDC station record into a unified ChargingStation. */
export function fromAfdc(station: AfdcStation): ChargingStation {
  const addressParts = [station.street_address, station.city, station.state].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : undefined;

  const humanStatus = afdcStatusToHuman(station.status_code);
  const statusNote = humanStatus != null ? "source-reported status; may be stale — verify before relying" : undefined;

  const result: ChargingStation = {
    id: String(station.id),
    source: "afdc",
    name: station.station_name,
    lat: station.latitude,
    lon: station.longitude,
    connectors: station.ev_connector_types ?? []
  };

  if (station.ev_network != null) result.network = station.ev_network;
  if (station.ev_dc_fast_num != null) result.dcFastCount = station.ev_dc_fast_num;
  if (station.ev_level2_evse_num != null) result.level2Count = station.ev_level2_evse_num;
  if (station.access_code != null) result.accessCode = station.access_code;
  if (station.ev_pricing != null) result.pricing = station.ev_pricing;
  if (station.station_phone != null) result.phone = station.station_phone;
  if (humanStatus != null) result.status = humanStatus;
  if (statusNote != null) result.statusNote = statusNote;
  if (station.distance != null) result.distanceMiles = station.distance;
  if (address != null) result.address = address;

  return result;
}

// ---------------------------------------------------------------------------
// Open Charge Map normalisation
// ---------------------------------------------------------------------------

/** Raw OCM connection shape. */
export interface OcmConnection {
  ConnectionType?: { Title?: string };
  PowerKW?: number | null;
  Level?: { Title?: string; IsFastChargeCapable?: boolean };
  Quantity?: number | null;
}

/** Raw OCM POI shape (relevant fields only). */
export interface OcmPoi {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    StateOrProvince?: string;
    Latitude?: number;
    Longitude?: number;
    ContactTelephone1?: string;
    Distance?: number;
  };
  OperatorInfo?: { Title?: string };
  UsageCost?: string | null;
  StatusType?: { IsOperational?: boolean | null; Title?: string } | null;
  Connections?: OcmConnection[];
}

/** Normalise a raw OCM POI record into a unified ChargingStation. */
export function fromOcm(poi: OcmPoi): ChargingStation {
  const addr = poi.AddressInfo;
  const addressParts = [addr?.AddressLine1, addr?.Town, addr?.StateOrProvince].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : undefined;

  // Derive status only if StatusType is present with meaningful info
  let status: string | undefined;
  let statusNote: string | undefined;
  if (poi.StatusType != null && (poi.StatusType.IsOperational != null || poi.StatusType.Title)) {
    if (poi.StatusType.IsOperational === true) {
      status = poi.StatusType.Title ?? "operational";
    } else if (poi.StatusType.IsOperational === false) {
      status = poi.StatusType.Title ?? "not operational";
    } else if (poi.StatusType.Title) {
      status = poi.StatusType.Title;
    }
    if (status != null) {
      statusNote = "source-reported status; may be stale — verify before relying";
    }
  }

  // Derive connectors from connections
  const connectors: string[] = [];
  let dcFastCount: number | undefined;
  let level2Count: number | undefined;

  for (const conn of poi.Connections ?? []) {
    const title = conn.ConnectionType?.Title;
    if (title) connectors.push(title);
    const qty = conn.Quantity ?? 1;
    if (conn.Level?.IsFastChargeCapable === true) {
      dcFastCount = (dcFastCount ?? 0) + qty;
    } else if (conn.Level?.Title?.toLowerCase().includes("level 2")) {
      level2Count = (level2Count ?? 0) + qty;
    }
  }

  const lat = addr?.Latitude ?? 0;
  const lon = addr?.Longitude ?? 0;

  const result: ChargingStation = {
    id: String(poi.ID),
    source: "ocm",
    name: addr?.Title ?? `OCM Station ${poi.ID}`,
    lat,
    lon,
    connectors
  };

  const network = poi.OperatorInfo?.Title;
  if (network) result.network = network;
  if (dcFastCount != null) result.dcFastCount = dcFastCount;
  if (level2Count != null) result.level2Count = level2Count;
  if (poi.UsageCost != null) result.pricing = poi.UsageCost;
  if (addr?.ContactTelephone1) result.phone = addr.ContactTelephone1;
  if (status != null) result.status = status;
  if (statusNote != null) result.statusNote = statusNote;
  if (addr?.Distance != null) result.distanceMiles = addr.Distance;
  if (address != null) result.address = address;

  return result;
}
