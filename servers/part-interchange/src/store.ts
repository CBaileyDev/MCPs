import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface InterchangeMember {
  number: string;
  brand?: string;
  type: "oem" | "aftermarket";
  notes?: string;
}

export interface InterchangeGroup {
  id: string;
  category?: string;
  notes?: string;
  members: InterchangeMember[];
  createdAt: string;
  updatedAt: string;
}

interface Db {
  groups: InterchangeGroup[];
}

/** Returns a fresh empty Db — a factory, not a constant, to avoid sharing the array reference. */
const emptyDb = (): Db => ({ groups: [] });

export interface CrossReferenceResult {
  inputNumber: string;
  matches: Array<{
    groupId: string;
    equivalents: InterchangeMember[];
  }>;
}

/** Normalize a part number for matching: uppercase, strip spaces/dashes/dots. */
export function normalizePartNumber(n: string): string {
  return n.toUpperCase().replace(/[\s\-.]/g, "");
}

function defaultDbPath(): string {
  const dir =
    process.env.PART_INTERCHANGE_DIR ?? join(homedir(), ".local", "share", "part-interchange");
  return join(dir, "db.json");
}

/**
 * A small JSON-file-backed interchange store.
 * Uses atomic write (temp file + rename) to avoid corruption.
 */
export class InterchangeStore {
  constructor(private readonly path: string = defaultDbPath()) {}

  private async load(): Promise<Db> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<Db>;
      // Use fresh arrays rather than spreading EMPTY: { ...emptyDb(), ...parsed }
      // would shallow-copy the groups array and { ...emptyDb() } would still return
      // the factory's fresh array, but explicit construction makes the intent clear.
      return { groups: parsed.groups ?? [] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyDb();
      throw err;
    }
  }

  private async save(db: Db): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await rename(tmp, this.path); // atomic replace
  }

  async addGroup(input: {
    members: InterchangeMember[];
    category?: string;
    notes?: string;
  }): Promise<InterchangeGroup> {
    const db = await this.load();
    const now = new Date().toISOString();
    const group: InterchangeGroup = {
      id: randomUUID(),
      category: input.category,
      notes: input.notes,
      members: input.members,
      createdAt: now,
      updatedAt: now
    };
    db.groups.push(group);
    await this.save(db);
    return group;
  }

  async addMember(groupId: string, member: InterchangeMember): Promise<InterchangeGroup | undefined> {
    const db = await this.load();
    const group = db.groups.find(g => g.id === groupId);
    if (!group) return undefined;
    group.members.push(member);
    group.updatedAt = new Date().toISOString();
    await this.save(db);
    return group;
  }

  async removeGroup(groupId: string): Promise<boolean> {
    const db = await this.load();
    const before = db.groups.length;
    db.groups = db.groups.filter(g => g.id !== groupId);
    const removed = db.groups.length < before;
    if (removed) await this.save(db);
    return removed;
  }

  async listGroups(): Promise<InterchangeGroup[]> {
    return (await this.load()).groups;
  }

  async findGroupsByPartNumber(number: string): Promise<InterchangeGroup[]> {
    const db = await this.load();
    const norm = normalizePartNumber(number);
    return db.groups.filter(g => g.members.some(m => normalizePartNumber(m.number) === norm));
  }

  async crossReference(number: string, _brand?: string): Promise<CrossReferenceResult> {
    const groups = await this.findGroupsByPartNumber(number);
    const norm = normalizePartNumber(number);
    const matches = groups.map(g => ({
      groupId: g.id,
      equivalents: g.members.filter(m => normalizePartNumber(m.number) !== norm)
    }));
    return { inputNumber: number, matches };
  }
}
