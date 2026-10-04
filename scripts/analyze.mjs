// Step 1: probe uploaded materials and make contact sheets for Claude to look at.
// Usage: node scripts/analyze.mjs <project id> <materials dir>
//
// Writes data/<id>/assets.json. Each asset gets an empty "segments" list that
// Claude fills in after viewing the sheets in work/<id>/sheets/. Assets that
// were already analyzed keep their segments.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  assetIdFor,
  listMaterials,
  mediaType,
  originalName,
  probe,
  projectPaths,
  readJson,
  round,
  run,
  TONEMAP,
  writeJson,
} from "./lib/project.mjs";

const [id, materialsDir] = process.argv.slice(2);
if (!id || !materialsDir) {
  console.error("usage: node scripts/analyze.mjs <project id> <materials dir>");
  process.exit(1);
}

const paths = projectPaths(id);
const sheetsDir = path.join(paths.work, "sheets");
fs.mkdirSync(sheetsDir, { recursive: true });

const previous = fs.existsSync(paths.assets) ? readJson(paths.assets).assets : {};
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const MAX_SHEET_FRAMES = 60;

const videoSheet = (file, info, out) => {
  // One frame per second, spread out further for long clips, stamped with time.
  const frames = Math.max(1, Math.min(MAX_SHEET_FRAMES, Math.ceil(info.duration)));
  const fps = frames / Math.max(info.duration, 1);
  const cols = Math.min(frames, 10);
  const rows = Math.ceil(frames / cols);
  run("ffmpeg", [
    "-v", "error", "-y", "-i", file,
    "-vf",
    `${info.hdr ? `${TONEMAP},` : ""}fps=${fps},scale=270:-2,drawtext=fontfile=${FONT}:text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${cols}x${rows}`,
    "-frames:v", "1", out,
  ]);
};

// Times (seconds) where the picture cuts, so long clips can be split into segments.
const scenes = (file) => {
  const { stderr } = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-vf", "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  return [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => round(Number(m[1])));
};

const assets = {};
for (const file of listMaterials(materialsDir)) {
  const assetId = assetIdFor(file);
  const type = mediaType(file);
  const sheet = path.join(sheetsDir, `${assetId}.jpg`);
  const asset = {
    file: originalName(file),
    type,
    sheet: path.relative(path.dirname(paths.assets), sheet),
    segments: previous[assetId]?.segments ?? [],
  };

  if (type === "video") {
    const info = probe(file);
    Object.assign(asset, {
      duration: round(info.duration),
      width: info.width,
      height: info.height,
      hdr: info.hdr,
      hasAudio: info.hasAudio,
      sceneChanges: scenes(file),
    });
    videoSheet(file, info, sheet);
  } else {
    // -auto-orient applies the EXIF rotation that phone photos rely on.
    run("convert", [file, "-auto-orient", "-resize", "540x960>", sheet]);
    const [width, height] = run("identify", ["-format", "%w %h", sheet]).split(" ").map(Number);
    Object.assign(asset, { width, height });
  }

  assets[assetId] = asset;
  console.log(
    `${assetId}: ${type}${asset.duration ? ` ${asset.duration}s` : ""}` +
      `${asset.hdr ? " HDR" : ""} sheet=${sheet}` +
      `${asset.segments.length ? ` (kept ${asset.segments.length} segments)` : ""}`,
  );
}

writeJson(paths.assets, { id, assets });
console.log(`wrote ${paths.assets}`);
