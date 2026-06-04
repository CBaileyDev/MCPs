import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GarageStore } from "./store.js";

let store: GarageStore;

beforeEach(() => {
  store = new GarageStore(join(tmpdir(), `garage-test-${randomUUID()}.json`));
});

describe("GarageStore", () => {
  it("saves, lists, updates, and deletes vehicles", async () => {
    const vehicle = await store.saveVehicle({ nickname: "Daily", make: "BMW", model: "X3", year: 2011 });
    expect(vehicle.id).toBeTruthy();
    expect(await store.listVehicles()).toHaveLength(1);

    const updated = await store.updateVehicle(vehicle.id, { notes: "new tires" });
    expect(updated?.notes).toBe("new tires");

    expect(await store.deleteVehicle(vehicle.id)).toBe(true);
    expect(await store.listVehicles()).toHaveLength(0);
  });

  it("logs searches newest-first", async () => {
    await store.logSearch({ query: "first" });
    await store.logSearch({ query: "second" });
    const recent = await store.listRecentSearches();
    expect(recent[0].query).toBe("second");
  });

  it("dedupes preferred brands case-insensitively", async () => {
    await store.setPreferredBrand("Bilstein", true);
    await store.setPreferredBrand("bilstein", true);
    expect(await store.listPreferredBrands()).toEqual(["Bilstein"]);
    await store.setPreferredBrand("BILSTEIN", false);
    expect(await store.listPreferredBrands()).toEqual([]);
  });

  it("tracks project builds and notes", async () => {
    const project = await store.createProjectBuild({ name: "E30 Restoration", goal: "track car" });
    const withNote = await store.addProjectNote(project.id, "ordered coilovers");
    expect(withNote?.notes).toHaveLength(1);
    expect((await store.listProjectBuilds())[0].name).toBe("E30 Restoration");
  });

  it("does not leak data between separate store instances", async () => {
    // Regression: a shared empty-DB constant would alias inner arrays, so a
    // write to one store (whose file didn't exist yet) could leak into another.
    const storeA = new GarageStore(join(tmpdir(), `garage-A-${randomUUID()}.json`));
    const storeB = new GarageStore(join(tmpdir(), `garage-B-${randomUUID()}.json`));
    await storeA.logSearch({ query: "A only" });
    await storeA.saveVehicle({ nickname: "A's car" });
    // storeB's file never existed; it must see nothing from storeA.
    expect(await storeB.listRecentSearches()).toEqual([]);
    expect(await storeB.listVehicles()).toEqual([]);
  });
});
