import { readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import type { PipelineStats } from "@/lib/pipeline";

const META_PATH = join(process.cwd(), "db", "meta.json");
const META_TMP  = META_PATH + ".tmp";

export interface Meta {
  lastPullAt: string | null;
  lastPullStats: PipelineStats | null;
}

export function readMeta(): Meta {
  try {
    return JSON.parse(readFileSync(META_PATH, "utf-8"));
  } catch {
    return { lastPullAt: null, lastPullStats: null };
  }
}

export function writeMeta(patch: Partial<Meta>): void {
  try {
    mkdirSync(join(process.cwd(), "db"), { recursive: true });
    const merged = { ...readMeta(), ...patch };
    writeFileSync(META_TMP, JSON.stringify(merged, null, 2));
    renameSync(META_TMP, META_PATH);
  } catch (e) {
    console.error("[meta] Failed to write meta.json:", e);
  }
}
