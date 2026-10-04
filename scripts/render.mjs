// Step 3b: render a confirmed timeline to out/<id>.mp4, plus out/<id>-check.jpg
// with one frame from the middle of every clip for a quick visual check.
// Usage: node scripts/render.mjs <project id> <materials dir>
import fs from "node:fs";
import path from "node:path";
import { prepare } from "./prepare.mjs";
import { projectPaths, readJson, ROOT, run, writeJson } from "./lib/project.mjs";
import { validateTimeline } from "./validate-timeline.mjs";

// Remotion's own Chrome download is blocked here; use the preinstalled headless shell.
const BROWSER = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

const [id, materialsDir] = process.argv.slice(2);
if (!id || !materialsDir) {
  console.error("usage: node scripts/render.mjs <project id> <materials dir>");
  process.exit(1);
}

const paths = projectPaths(id);
const timeline = readJson(paths.timeline);
const errors = validateTimeline(timeline, { requireConfirmed: true });
if (errors.length) {
  console.error(`cannot render ${id}:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}

prepare(id, materialsDir);

const props = path.join(paths.work, "props.json");
writeJson(props, { timeline });
const browser = fs.existsSync(BROWSER) ? ["--browser-executable", BROWSER] : [];
run(
  "npx",
  ["remotion", "render", "TelopVideo", paths.out, `--props=${props}`, ...browser],
  { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
);

// One frame from the middle of each clip, side by side.
const frames = [];
let cursor = 0;
for (const clip of timeline.telops.flatMap((t) => t.clips)) {
  const len = clip.end - clip.start;
  const frame = path.join(paths.work, `check-${frames.length}.png`);
  run("ffmpeg", [
    "-v", "error", "-y", "-ss", String(cursor + len / 2), "-i", paths.out,
    "-frames:v", "1", "-vf", "scale=270:-2", frame,
  ]);
  frames.push(frame);
  cursor += len;
}
run("ffmpeg", [
  "-v", "error", "-y",
  ...frames.flatMap((f) => ["-i", f]),
  "-filter_complex", frames.length > 1 ? `hstack=inputs=${frames.length}` : "null",
  paths.check,
]);
console.log(`rendered ${paths.out}`);
console.log(`check sheet ${paths.check}`);
