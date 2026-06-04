import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeVin, getRecallsByVin, getRecalls, getComplaints } from "./client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchResponse = { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> };

function makeFetchResponse(json: unknown): FetchResponse {
  return { ok: true, status: 200, statusText: "OK", json: async () => json };
}

/** Mock all fetch calls to return the same JSON. */
function mockFetch(json: unknown): void {
  global.fetch = vi.fn(async () => makeFetchResponse(json)) as unknown as typeof fetch;
}

/** Mock fetch calls in sequence (first call → first item, etc.). */
function mockFetchSequence(responses: unknown[]): void {
  const mock = vi.fn();
  for (const resp of responses) {
    mock.mockResolvedValueOnce(makeFetchResponse(resp));
  }
  global.fetch = mock as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// decodeVin
// ---------------------------------------------------------------------------

describe("decodeVin", () => {
  it("extracts make, model and coerces ModelYear to number", async () => {
    mockFetch({
      Count: 1,
      Message: "Results returned successfully",
      Results: [
        {
          Make: "HONDA",
          Model: "Accord",
          ModelYear: "2015",
          VIN: "1HGCM82633A004352"
        }
      ]
    });

    const result = await decodeVin("1HGCM82633A004352");
    expect(result).not.toBeNull();
    expect(result?.make).toBe("HONDA");
    expect(result?.model).toBe("Accord");
    expect(result?.modelYear).toBe(2015);
    expect(typeof result?.modelYear).toBe("number");
  });

  it("returns null when Make is empty (incomplete decode)", async () => {
    mockFetch({
      Count: 1,
      Message: "Results returned successfully",
      Results: [{ Make: "", Model: "Accord", ModelYear: "2015" }]
    });

    const result = await decodeVin("00000000000000000");
    expect(result).toBeNull();
  });

  it("returns null when ModelYear is empty string", async () => {
    mockFetch({
      Count: 1,
      Message: "Results returned successfully",
      Results: [{ Make: "HONDA", Model: "Accord", ModelYear: "" }]
    });

    const result = await decodeVin("00000000000000000");
    expect(result).toBeNull();
  });

  it("hits the vPIC endpoint (not the NHTSA api.nhtsa.gov endpoint)", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      capturedUrl = url.toString();
      return makeFetchResponse({
        Count: 1,
        Message: "",
        Results: [{ Make: "FORD", Model: "F-150", ModelYear: "2020" }]
      });
    }) as unknown as typeof fetch;

    await decodeVin("1FTFW1ET0EKE32452");
    expect(capturedUrl).toContain("vpic.nhtsa.dot.gov");
    expect(capturedUrl).toContain("DecodeVinValues");
  });
});

// ---------------------------------------------------------------------------
// getRecallsByVin
// ---------------------------------------------------------------------------

const VPIC_DECODE_RESPONSE = {
  Count: 1,
  Message: "Results returned successfully",
  Results: [{ Make: "HONDA", Model: "Accord", ModelYear: "2015" }]
};

const NHTSA_RECALLS_RESPONSE = {
  count: 2,
  results: [
    { CampNo: "15V100000", Component: "ENGINE", Summary: "Engine may stall." },
    { CampNo: "15V200000", Component: "BRAKES", Summary: "Brake failure possible." }
  ]
};

describe("getRecallsByVin", () => {
  it("composes decode → recalls and returns vehicle identity + recalls", async () => {
    mockFetchSequence([VPIC_DECODE_RESPONSE, NHTSA_RECALLS_RESPONSE]);

    const result = await getRecallsByVin("1HGCM82633A004352");
    expect(result).toHaveProperty("vin", "1HGCM82633A004352");
    expect(result).toHaveProperty("decoded");
    expect(result.decoded).toMatchObject({ make: "HONDA", model: "Accord", modelYear: 2015 });

    // Confirms it's a RecallsByVinResult with recalls array
    expect("recalls" in result).toBe(true);
    if ("recalls" in result) {
      expect(Array.isArray(result.recalls)).toBe(true);
      expect(result.recalls.length).toBe(2);
    }
  });

  it("makes exactly two fetch calls in sequence (vPIC decode, then NHTSA recalls)", async () => {
    const spy = vi.fn(async () => makeFetchResponse(VPIC_DECODE_RESPONSE));
    spy.mockResolvedValueOnce(makeFetchResponse(VPIC_DECODE_RESPONSE));
    spy.mockResolvedValueOnce(makeFetchResponse(NHTSA_RECALLS_RESPONSE));
    global.fetch = spy as unknown as typeof fetch;

    await getRecallsByVin("1HGCM82633A004352");
    expect(spy).toHaveBeenCalledTimes(2);

    const firstUrl = (spy.mock.calls[0][0] as string).toString();
    const secondUrl = (spy.mock.calls[1][0] as string).toString();
    expect(firstUrl).toContain("vpic.nhtsa.dot.gov");
    expect(secondUrl).toContain("api.nhtsa.gov/recalls");
    // Verify the decoded values (HONDA, Accord, 2015) flow into the recalls query
    expect(secondUrl).toContain("make=HONDA");
    expect(secondUrl).toContain("model=Accord");
    expect(secondUrl).toContain("modelYear=2015");
  });

  it("returns a message (not an exception) when VIN decode is incomplete", async () => {
    mockFetch({
      Count: 1,
      Message: "Results returned successfully",
      Results: [{ Make: "", Model: "", ModelYear: "" }]
    });

    const result = await getRecallsByVin("00000000000000000");
    expect(result).toHaveProperty("vin");
    expect(result).toHaveProperty("message");
    expect("recalls" in result).toBe(false);
    if ("message" in result) {
      expect(result.message).toMatch(/decode/i);
    }
  });
});

// ---------------------------------------------------------------------------
// getRecalls / getComplaints (NHTSA shape)
// ---------------------------------------------------------------------------

describe("getRecalls", () => {
  it("returns the results array from the NHTSA response envelope", async () => {
    mockFetch({
      count: 3,
      results: [
        { CampNo: "20V100000", Component: "FUEL SYSTEM" },
        { CampNo: "20V200000", Component: "STEERING" },
        { CampNo: "20V300000", Component: "AIRBAG" }
      ]
    });

    const recalls = await getRecalls("Toyota", "Camry", 2020);
    expect(Array.isArray(recalls)).toBe(true);
    expect(recalls.length).toBe(3);
    expect(recalls[0]).toMatchObject({ CampNo: "20V100000" });
  });

  it("handles capital-case Results envelope too", async () => {
    mockFetch({
      Count: 1,
      Results: [{ CampNo: "20V999000", Component: "TIRES" }]
    });

    const recalls = await getRecalls("Ford", "F-150", 2020);
    expect(recalls.length).toBe(1);
  });

  it("returns empty array when no recalls exist", async () => {
    mockFetch({ count: 0, results: [] });
    const recalls = await getRecalls("Tesla", "Model3", 2023);
    expect(recalls).toEqual([]);
  });
});

describe("getComplaints", () => {
  it("returns the results array from the NHTSA response envelope", async () => {
    mockFetch({
      count: 2,
      results: [
        { ODINumber: "11111111", Component: "ENGINE" },
        { ODINumber: "22222222", Component: "TRANSMISSION" }
      ]
    });

    const complaints = await getComplaints("Honda", "Civic", 2018);
    expect(Array.isArray(complaints)).toBe(true);
    expect(complaints.length).toBe(2);
    expect(complaints[0]).toMatchObject({ ODINumber: "11111111" });
  });

  it("returns empty array when no complaints exist", async () => {
    mockFetch({ count: 0, results: [] });
    const complaints = await getComplaints("Toyota", "Prius", 2022);
    expect(complaints).toEqual([]);
  });
});
