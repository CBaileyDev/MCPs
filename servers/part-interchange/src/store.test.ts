import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { InterchangeStore } from "./store.js";

let store: InterchangeStore;

beforeEach(() => {
  store = new InterchangeStore(join(tmpdir(), `part-interchange-test-${randomUUID()}.json`));
});

describe("InterchangeStore", () => {
  it("adds a group and lists it", async () => {
    const group = await store.addGroup({
      members: [
        { number: "04465-42160", brand: "Toyota", type: "oem" },
        { number: "D1354", brand: "Bendix", type: "aftermarket" }
      ],
      category: "brake pads"
    });
    expect(group.id).toBeTruthy();
    expect(group.members).toHaveLength(2);

    const all = await store.listGroups();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(group.id);
  });

  it("finds a group by any member number, including with different spacing/dashes", async () => {
    await store.addGroup({
      members: [
        { number: "04465-42160", brand: "Toyota", type: "oem" },
        { number: "D1354", brand: "Bendix", type: "aftermarket" }
      ]
    });

    // All these should find the same group
    const byDashes = await store.findGroupsByPartNumber("04465-42160");
    const bySpaces = await store.findGroupsByPartNumber("04465 42160");
    const noSep = await store.findGroupsByPartNumber("0446542160");
    const lowerCase = await store.findGroupsByPartNumber("04465-42160");

    expect(byDashes).toHaveLength(1);
    expect(bySpaces).toHaveLength(1);
    expect(noSep).toHaveLength(1);
    expect(lowerCase).toHaveLength(1);
    expect(byDashes[0].id).toBe(bySpaces[0].id);
    expect(byDashes[0].id).toBe(noSep[0].id);
  });

  it("crossReference returns the OTHER members as equivalents", async () => {
    const oem = { number: "04465-42160", brand: "Toyota", type: "oem" as const };
    const am1 = { number: "D1354", brand: "Bendix", type: "aftermarket" as const };
    const am2 = { number: "MKD714", brand: "Hawk", type: "aftermarket" as const };

    await store.addGroup({ members: [oem, am1, am2] });

    const result = await store.crossReference("04465-42160");
    expect(result.inputNumber).toBe("04465-42160");
    expect(result.matches).toHaveLength(1);

    const equivalents = result.matches[0].equivalents;
    expect(equivalents).toHaveLength(2);
    const numbers = equivalents.map(e => e.number);
    expect(numbers).toContain("D1354");
    expect(numbers).toContain("MKD714");
    expect(numbers).not.toContain("04465-42160");
  });

  it("crossReference with normalized input returns equivalents", async () => {
    await store.addGroup({
      members: [
        { number: "04465-42160", brand: "Toyota", type: "oem" },
        { number: "D1354", brand: "Bendix", type: "aftermarket" }
      ]
    });

    // Query with no dashes — should still match
    const result = await store.crossReference("0446542160");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].equivalents).toHaveLength(1);
  });

  it("addMember appends a member and updates updatedAt", async () => {
    const group = await store.addGroup({
      members: [{ number: "04465-42160", brand: "Toyota", type: "oem" }]
    });
    const before = group.updatedAt;

    // Small delay to ensure timestamp changes
    await new Promise(r => setTimeout(r, 5));

    const updated = await store.addMember(group.id, {
      number: "MKD714",
      brand: "Hawk",
      type: "aftermarket"
    });
    expect(updated).toBeDefined();
    expect(updated!.members).toHaveLength(2);
    expect(updated!.updatedAt >= before).toBe(true);

    const all = await store.listGroups();
    expect(all[0].members).toHaveLength(2);
  });

  it("addMember returns undefined for unknown groupId", async () => {
    const result = await store.addMember("no-such-id", {
      number: "X123",
      type: "aftermarket"
    });
    expect(result).toBeUndefined();
  });

  it("removeGroup deletes the group and returns true", async () => {
    const group = await store.addGroup({
      members: [{ number: "04465-42160", type: "oem" }]
    });
    expect(await store.listGroups()).toHaveLength(1);

    const removed = await store.removeGroup(group.id);
    expect(removed).toBe(true);
    expect(await store.listGroups()).toHaveLength(0);
  });

  it("removeGroup returns false for unknown id", async () => {
    expect(await store.removeGroup("no-such-id")).toBe(false);
  });

  it("listGroups returns empty array for a fresh store", async () => {
    expect(await store.listGroups()).toEqual([]);
  });
});
