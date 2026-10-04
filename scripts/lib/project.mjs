// Shared helpers for the TikTok telop pipeline (analyze → draft → render).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export const VIDEO_EXTS = [".mov", ".mp4", ".m4v"];
export const IMAGE_EXTS = [".jpg", ".jpeg", ".png"];

// Defaults that the first test video (test01) was approved with.
export const DEFAULT_VIDEO = { width: 1080, height: 1920, fps: 30 };
export const DEFAULT_IMAGE_SECONDS = 3;
export const DEFAULT_MAX_CLIP_SECONDS = 4;

// iPhone HDR (HLG / BT.2020) footage, tone-mapped to SDR BT.709. These are the
// settings test01 was approved with.
export const TONEMAP =
  "zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=linear:desat=2,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

export const projectPaths = (id) => {
  if (!/^[A-Za-z0-9_-]+$/.test(id ?? "")) {
    throw new Error(`invalid project id: ${id}`);
  }
  return {
    data: path.join(ROOT, "data", id),
    assets: path.join(ROOT, "data", id, "assets.json"),
    script: path.join(ROOT, "data", id, "script.txt"),
    candidates: path.join(ROOT, "data", id, "candidates.json"),
    candidatesMd: path.join(ROOT, "data", id, "candidates.md"),
    timeline: path.join(ROOT, "data", id, "timeline.json"),
    work: path.join(ROOT, "work", id),
    public: path.join(ROOT, "public", id),
    out: path.join(ROOT, "out", `${id}.mp4`),
    check: path.join(ROOT, "out", `${id}-check.jpg`),
  };
};

export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};

// Chat uploads are saved as "<8 hex>-<original name>"; strip that prefix.
export const originalName = (file) =>
  path.basename(file).replace(/^[0-9a-f]{8}-/, "");

export const assetIdFor = (file) =>
  path.parse(originalName(file)).name.replace(/[^A-Za-z0-9_-]/g, "_");

export const mediaType = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (IMAGE_EXTS.includes(ext)) return "image";
  return null;
};

export const listMaterials = (dir) =>
  fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile() && mediaType(file))
    .sort();

// Find the uploaded file for an asset by its original name.
export const findSource = (dir, fileName) => {
  const matches = listMaterials(dir).filter(
    (file) => originalName(file) === fileName,
  );
  if (matches.length === 0) throw new Error(`missing source: ${fileName} in ${dir}`);
  if (matches.length > 1) {
    throw new Error(`ambiguous source for ${fileName}: ${matches.join(", ")}`);
  }
  return matches[0];
};

export const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

export const probe = (file) => {
  const info = JSON.parse(
    run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]),
  );
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");
  const rotation = Number(
    video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
      video?.tags?.rotate ??
      0,
  );
  const swap = Math.abs(rotation) % 180 === 90;
  return {
    width: swap ? video.height : video.width,
    height: swap ? video.width : video.height,
    duration: Number(info.format.duration ?? 0),
    hasAudio: Boolean(audio),
    // HLG (arib-std-b67) and PQ (smpte2084) footage needs tone mapping to SDR.
    hdr: ["arib-std-b67", "smpte2084"].includes(video.color_transfer),
    colorTransfer: video.color_transfer ?? null,
  };
};

export const round = (n, digits = 2) => Number(n.toFixed(digits));
