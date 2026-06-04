import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { InterchangeStore } from "../store.js";
import { registerInterchangeTools } from "./register.js";

/** Minimal structural fake that satisfies McpServer's registerTool surface. */
class FakeMcpServer {
  readonly tools = new Map<string, { config: Record<string, unknown>; handler: (input: Record<string, unknown>) => unknown }>();

  registerTool(
    name: string,
    config: Record<string, unknown>,
    handler: (input: Record<string, unknown>) => unknown
  ): void {
    this.tools.set(name, { config, handler });
  }
}

const EXPECTED_TOOLS = [
  "cross_reference_part",
  "find_aftermarket_equivalents",
  "add_interchange",
  "add_part_to_interchange",
  "list_interchanges",
  "remove_interchange"
] as const;

function makeTempStore(): InterchangeStore {
  return new InterchangeStore(join(tmpdir(), `part-interchange-reg-test-${randomUUID()}.json`));
}

describe("registerInterchangeTools", () => {
  it("registers exactly the 6 expected tools", () => {
    const server = new FakeMcpServer();
    const store = makeTempStore();
    registerInterchangeTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer, undefined, store);
    expect(server.tools.size).toBe(6);
    for (const name of EXPECTED_TOOLS) {
      expect(server.tools.has(name), `missing tool: ${name}`).toBe(true);
    }
  });

  it("registers tools in the expected order", () => {
    const server = new FakeMcpServer();
    const store = makeTempStore();
    registerInterchangeTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer, undefined, store);
    expect([...server.tools.keys()]).toEqual([...EXPECTED_TOOLS]);
  });
});

describe("add_interchange → cross_reference_part round-trip", () => {
  let server: FakeMcpServer;
  let store: InterchangeStore;

  beforeEach(() => {
    server = new FakeMcpServer();
    store = makeTempStore();
    registerInterchangeTools(server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer, undefined, store);
  });

  it("add_interchange then cross_reference_part returns the equivalent", async () => {
    const addTool = server.tools.get("add_interchange")!;
    await addTool.handler({
      members: [
        { number: "04465-42160", brand: "Toyota", type: "oem" },
        { number: "D1354", brand: "Bendix", type: "aftermarket" }
      ]
    }) as { content: Array<{ text: string }> };

    const xrefTool = server.tools.get("cross_reference_part")!;
    const result = await xrefTool.handler({ partNumber: "04465-42160" }) as { content: Array<{ text: string }> };

    expect(result.content).toBeDefined();
    const text = result.content[0].text;
    const parsed = JSON.parse(text) as { inputNumber: string; matches: Array<{ equivalents: Array<{ number: string }> }> };

    expect(parsed.inputNumber).toBe("04465-42160");
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].equivalents).toHaveLength(1);
    expect(parsed.matches[0].equivalents[0].number).toBe("D1354");
  });

  it("cross_reference_part returns guidance when no local match and provider not configured", async () => {
    const xrefTool = server.tools.get("cross_reference_part")!;
    const result = await xrefTool.handler({ partNumber: "UNKNOWN-99999" }) as { content: Array<{ text: string }> };

    const text = result.content[0].text;
    const parsed = JSON.parse(text) as { message: string };
    expect(parsed.message).toContain("add_interchange");
  });

  it("find_aftermarket_equivalents returns only aftermarket parts", async () => {
    const addTool = server.tools.get("add_interchange")!;
    await addTool.handler({
      members: [
        { number: "04465-42160", brand: "Toyota", type: "oem" },
        { number: "D1354", brand: "Bendix", type: "aftermarket" },
        { number: "OEM-SISTER", brand: "Lexus", type: "oem" }
      ]
    });

    const findTool = server.tools.get("find_aftermarket_equivalents")!;
    const result = await findTool.handler({ oemNumber: "04465-42160" }) as { content: Array<{ text: string }> };

    const text = result.content[0].text;
    const parsed = JSON.parse(text) as { matches: Array<{ equivalents: Array<{ type: string }> }> };

    expect(parsed.matches).toHaveLength(1);
    const equivalents = parsed.matches[0].equivalents;
    expect(equivalents.every((e: { type: string }) => e.type === "aftermarket")).toBe(true);
    expect(equivalents).toHaveLength(1);
  });

  it("list_interchanges returns all groups", async () => {
    const addTool = server.tools.get("add_interchange")!;
    await addTool.handler({
      members: [
        { number: "A1", type: "oem" },
        { number: "B1", type: "aftermarket" }
      ]
    });
    await addTool.handler({
      members: [
        { number: "C1", type: "oem" },
        { number: "D1", type: "aftermarket" }
      ]
    });

    const listTool = server.tools.get("list_interchanges")!;
    const result = await listTool.handler({}) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text) as { groups: unknown[] };
    expect(parsed.groups).toHaveLength(2);
  });

  it("remove_interchange deletes a group and reports removal", async () => {
    const addTool = server.tools.get("add_interchange")!;
    const addResult = await addTool.handler({
      members: [
        { number: "A1", type: "oem" },
        { number: "B1", type: "aftermarket" }
      ]
    }) as { content: Array<{ text: string }> };
    const group = JSON.parse(addResult.content[0].text) as { id: string };

    const removeTool = server.tools.get("remove_interchange")!;
    const removeResult = await removeTool.handler({ groupId: group.id }) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(removeResult.content[0].text) as { removed: boolean };
    expect(parsed.removed).toBe(true);

    const listTool = server.tools.get("list_interchanges")!;
    const listResult = await listTool.handler({}) as { content: Array<{ text: string }> };
    const listParsed = JSON.parse(listResult.content[0].text) as { groups: unknown[] };
    expect(listParsed.groups).toHaveLength(0);
  });

  it("remove_interchange reports not found for unknown groupId", async () => {
    const removeTool = server.tools.get("remove_interchange")!;
    const result = await removeTool.handler({ groupId: "no-such-id" }) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text) as { removed: boolean; message: string };
    expect(parsed.removed).toBe(false);
    expect(parsed.message).toContain("no-such-id");
  });
});
