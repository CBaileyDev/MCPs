export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
};

/** Format any value as a text tool result; attach structuredContent for objects. */
export function ok(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const res: ToolResult = { content: [{ type: "text", text }] };
  if (data && typeof data === "object" && !Array.isArray(data)) {
    res.structuredContent = data as Record<string, unknown>;
  }
  return res;
}
