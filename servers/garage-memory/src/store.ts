import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Vehicle {
  id: string;
  nickname: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchEntry {
  id: string;
  query: string;
  context?: string;
  vehicleId?: string;
  createdAt: string;
}

export interface ProjectBuild {
  id: string;
  vehicleId?: string;
  name: string;
  goal?: string;
  notes: { text: string; createdAt: string }[];
  createdAt: string;
}

interface Db {
  vehicles: Vehicle[];
  searches: SearchEntry[];
  preferredBrands: string[];
  projects: ProjectBuild[];
}

/**
 * Fresh empty DB — a factory (not a shared module-level constant), so the inner
 * arrays are never aliased across loads or store instances. A shared constant
 * would let an empty-load's arrays be mutated in place and leak between stores.
 */
function emptyDb(): Db {
  return { vehicles: [], searches: [], preferredBrands: [], projects: [] };
}

function defaultDbPath(): string {
  const dir =
    process.env.GARAGE_MEMORY_DIR ?? join(homedir(), ".local", "share", "garage-memory");
  return join(dir, "db.json");
}

/**
 * A small JSON-file-backed store. Chosen over SQLite to avoid native
 * build dependencies; the dataset (a personal garage) is tiny.
 */
export class GarageStore {
  constructor(private readonly path: string = defaultDbPath()) {}

  private async load(): Promise<Db> {
    try {
      const raw = await readFile(this.path, "utf8");
      return { ...emptyDb(), ...(JSON.parse(raw) as Partial<Db>) };
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

  // --- Vehicles ---------------------------------------------------------

  async saveVehicle(input: Omit<Vehicle, "id" | "createdAt" | "updatedAt">): Promise<Vehicle> {
    const db = await this.load();
    const now = new Date().toISOString();
    const vehicle: Vehicle = { id: randomUUID(), createdAt: now, updatedAt: now, ...input };
    db.vehicles.push(vehicle);
    await this.save(db);
    return vehicle;
  }

  async listVehicles(): Promise<Vehicle[]> {
    return (await this.load()).vehicles;
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    return (await this.load()).vehicles.find(v => v.id === id);
  }

  async updateVehicle(
    id: string,
    patch: Partial<Omit<Vehicle, "id" | "createdAt">>
  ): Promise<Vehicle | undefined> {
    const db = await this.load();
    const vehicle = db.vehicles.find(v => v.id === id);
    if (!vehicle) return undefined;
    Object.assign(vehicle, patch, { updatedAt: new Date().toISOString() });
    await this.save(db);
    return vehicle;
  }

  async deleteVehicle(id: string): Promise<boolean> {
    const db = await this.load();
    const before = db.vehicles.length;
    db.vehicles = db.vehicles.filter(v => v.id !== id);
    const removed = db.vehicles.length < before;
    if (removed) await this.save(db);
    return removed;
  }

  // --- Searches ---------------------------------------------------------

  async logSearch(input: Omit<SearchEntry, "id" | "createdAt">): Promise<SearchEntry> {
    const db = await this.load();
    const entry: SearchEntry = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    db.searches.push(entry);
    await this.save(db);
    return entry;
  }

  async listRecentSearches(limit = 20): Promise<SearchEntry[]> {
    const db = await this.load();
    return db.searches.slice(-limit).reverse();
  }

  // --- Preferred brands -------------------------------------------------

  async setPreferredBrand(brand: string, preferred: boolean): Promise<string[]> {
    const db = await this.load();
    const norm = brand.trim();
    const has = db.preferredBrands.some(b => b.toLowerCase() === norm.toLowerCase());
    if (preferred) {
      if (!has) db.preferredBrands.push(norm);
    } else {
      db.preferredBrands = db.preferredBrands.filter(b => b.toLowerCase() !== norm.toLowerCase());
    }
    await this.save(db);
    return db.preferredBrands;
  }

  async listPreferredBrands(): Promise<string[]> {
    return (await this.load()).preferredBrands;
  }

  // --- Project builds ---------------------------------------------------

  async createProjectBuild(
    input: Omit<ProjectBuild, "id" | "createdAt" | "notes">
  ): Promise<ProjectBuild> {
    const db = await this.load();
    const project: ProjectBuild = {
      id: randomUUID(),
      notes: [],
      createdAt: new Date().toISOString(),
      ...input
    };
    db.projects.push(project);
    await this.save(db);
    return project;
  }

  async addProjectNote(projectId: string, text: string): Promise<ProjectBuild | undefined> {
    const db = await this.load();
    const project = db.projects.find(p => p.id === projectId);
    if (!project) return undefined;
    project.notes.push({ text, createdAt: new Date().toISOString() });
    await this.save(db);
    return project;
  }

  async listProjectBuilds(): Promise<ProjectBuild[]> {
    return (await this.load()).projects;
  }
}
