// Check timeline.json files before rendering.
// Usage: node scripts/validate-timeline.mjs [project id ...] [--confirmed]
// With no ids, every data/*/timeline.json is checked. --confirmed also
// requires status "confirmed" (render uses this).
import fs from "node:fs";
import path from "node:path";
import { ROOT, projectPaths, readJson } from "./lib/project.mjs";

export const validateTimeline = (timeline, { requireConfirmed = false } = {}) => {
  const errors = [];
  const { video, assets, telops } = timeline;

  if (requireConfirmed && timeline.status !== "confirmed") {
    errors.push(`status is "${timeline.status}", not "confirmed"`);
  }
  for (const key of ["width", "height", "fps"]) {
    if (!(video?.[key] > 0)) errors.push(`video.${key} must be a positive number`);
  }
  if (!Array.isArray(telops) || telops.length === 0) errors.push("no telops");

  for (const [i, telop] of (telops ?? []).entries()) {
    const where = `telops[${i}] (${telop.id})`;
    if (!telop.text?.trim()) errors.push(`${where}: empty text`);
    if (!telop.clips?.length) errors.push(`${where}: no clips`);
    for (const clip of telop.clips ?? []) {
      const asset = assets?.[clip.asset];
      const label = `${where} clip ${clip.segment}`;
      if (!asset) {
        errors.push(`${label}: unknown asset ${clip.asset}`);
        continue;
      }
      if (!(clip.start >= 0)) errors.push(`${label}: start must be >= 0`);
      if (!(clip.end > clip.start)) errors.push(`${label}: end must be after start`);
      const type = asset.type ?? "video";
      if (type === "video" && clip.end > asset.duration + 0.05) {
        errors.push(`${label}: end ${clip.end}s is past the clip length ${asset.duration}s`);
      }
    }
  }
  return errors;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const requireConfirmed = args.includes("--confirmed");
  let ids = args.filter((a) => !a.startsWith("--"));
  if (ids.length === 0) {
    const dataDir = path.join(ROOT, "data");
    ids = fs
      .readdirSync(dataDir)
      .filter((d) => fs.existsSync(path.join(dataDir, d, "timeline.json")));
  }

  let failed = false;
  for (const id of ids) {
    const errors = validateTimeline(readJson(projectPaths(id).timeline), { requireConfirmed });
    if (errors.length) {
      failed = true;
      console.error(`✗ ${id}`);
      for (const e of errors) console.error(`  - ${e}`);
    } else {
      console.log(`✓ ${id}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
