// Step 2: turn Claude's per-telop candidates into a review table and a draft timeline.
// Usage: node scripts/draft-timeline.mjs <project id> [--force]
//
// Reads data/<id>/assets.json and data/<id>/candidates.json:
//   { "telops": [ { "id": "T1", "text": "...",
//                   "candidates": [ { "segment": "B", "score": 90, "reason": "..." }, ... ],
//                   "pick": ["B", { "segment": "E", "start": 0, "end": 3 }] } ] }
// "pick" is optional (defaults to the top candidate). Writes data/<id>/candidates.md
// and data/<id>/timeline.json with status "draft". A confirmed timeline is only
// overwritten with --force.
import fs from "node:fs";
import {
  DEFAULT_IMAGE_SECONDS,
  DEFAULT_MAX_CLIP_SECONDS,
  DEFAULT_VIDEO,
  projectPaths,
  readJson,
  round,
  writeJson,
} from "./lib/project.mjs";

const [id, ...flags] = process.argv.slice(2);
if (!id) {
  console.error("usage: node scripts/draft-timeline.mjs <project id> [--force]");
  process.exit(1);
}
const paths = projectPaths(id);
const { assets } = readJson(paths.assets);
const { telops } = readJson(paths.candidates);

if (fs.existsSync(paths.timeline) && !flags.includes("--force")) {
  const current = readJson(paths.timeline);
  if (current.status === "confirmed") {
    console.error(`${paths.timeline} is confirmed; pass --force to replace it`);
    process.exit(1);
  }
}

const segments = new Map();
for (const [assetId, asset] of Object.entries(assets)) {
  for (const segment of asset.segments) {
    if (segments.has(segment.id)) throw new Error(`duplicate segment id: ${segment.id}`);
    segments.set(segment.id, { ...segment, assetId, asset });
  }
}

const lookup = (segmentId) => {
  const segment = segments.get(segmentId);
  if (!segment) throw new Error(`unknown segment: ${segmentId}`);
  return segment;
};

const clipFor = (pick) => {
  const { segment: segmentId, start, end } =
    typeof pick === "string" ? { segment: pick } : pick;
  const segment = lookup(segmentId);
  if (segment.asset.type === "image") {
    return {
      segment: segmentId,
      asset: segment.assetId,
      start: 0,
      end: end ?? DEFAULT_IMAGE_SECONDS,
      note: segment.description,
    };
  }
  const clipStart = start ?? segment.start;
  return {
    segment: segmentId,
    asset: segment.assetId,
    start: clipStart,
    end: end ?? round(Math.min(segment.end, clipStart + DEFAULT_MAX_CLIP_SECONDS)),
    note: segment.description,
  };
};

const timeline = {
  id,
  status: "draft",
  script: telops.map((t) => t.text).join("／"),
  video: DEFAULT_VIDEO,
  assets: Object.fromEntries(
    Object.entries(assets).map(([assetId, a]) => [
      assetId,
      {
        file: a.file,
        type: a.type,
        ...(a.type === "video" ? { duration: a.duration } : {}),
        description: a.segments.map((s) => s.description).join(" / "),
      },
    ]),
  ),
  telops: telops.map((t) => ({
    id: t.id,
    text: t.text,
    clips: (t.pick ?? [t.candidates[0].segment]).map(clipFor),
  })),
};

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = [
  `# ${id} 素材候補`,
  "",
  "| テロップ | 順位 | 区間 | 素材 | スコア | 理由 |",
  "|---|---|---|---|---|---|",
  ...telops.flatMap((t) =>
    t.candidates.map((c, i) => {
      const s = lookup(c.segment);
      const range = s.asset.type === "image" ? "画像" : `${s.start}–${s.end}s`;
      return `| ${i === 0 ? `${t.id} ${cell(t.text)}` : ""} | ${i + 1} | ${c.segment} | ${s.assetId} ${range} | ${c.score} | ${cell(c.reason)} |`;
    }),
  ),
  "",
  "## 下書きの並び",
  "",
  "| 時間 | テロップ | 区間 | 素材 | 使用範囲 |",
  "|---|---|---|---|---|",
];
let cursor = 0;
for (const t of timeline.telops) {
  for (const c of t.clips) {
    const len = c.end - c.start;
    md.push(
      `| ${cursor.toFixed(1)}–${(cursor + len).toFixed(1)}s | ${t.id} ${cell(t.text)} | ${c.segment} | ${c.asset} | ${c.start}–${c.end}s |`,
    );
    cursor += len;
  }
}
md.push("", `合計 ${cursor.toFixed(1)} 秒`);

fs.writeFileSync(paths.candidatesMd, md.join("\n") + "\n");
writeJson(paths.timeline, timeline);
console.log(`wrote ${paths.candidatesMd}`);
console.log(`wrote ${paths.timeline} (draft, ${cursor.toFixed(1)}s)`);
