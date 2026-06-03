/**
 * Provider interface for part interchange data.
 *
 * There is no free/official API for OEM<->aftermarket cross-referencing;
 * real data comes from commercial catalogs (e.g. supplier ACES/PIES feeds)
 * or licensed datasets. This interface lets a real provider be dropped in
 * without touching the MCP tool layer. The default provider is a stub that
 * explains it is not configured.
 */

export interface CrossReference {
  inputNumber: string;
  brand?: string;
  equivalents: Array<{
    number: string;
    brand: string;
    type: "oem" | "aftermarket";
    confidence?: number;
    notes?: string;
  }>;
  source: string;
}

export interface InterchangeProvider {
  readonly name: string;
  crossReference(partNumber: string, brand?: string): Promise<CrossReference>;
  findAftermarket(oemNumber: string): Promise<CrossReference>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ProviderNotConfiguredError";
  }
}

/** Default provider: returns clear "not configured" guidance. */
export class NotConfiguredProvider implements InterchangeProvider {
  readonly name = "not-configured";

  private fail(): never {
    throw new ProviderNotConfiguredError(
      "Part interchange has no data provider configured. This MCP is scaffolded " +
        "but requires a licensed catalog/feed (e.g. ACES/PIES) to return real data. " +
        "Implement InterchangeProvider in src/provider.ts and register it via getProvider()."
    );
  }

  crossReference(): Promise<CrossReference> {
    return this.fail();
  }

  findAftermarket(): Promise<CrossReference> {
    return this.fail();
  }
}

/** Select the active provider. Wire a real one here when available. */
export function getProvider(): InterchangeProvider {
  return new NotConfiguredProvider();
}
