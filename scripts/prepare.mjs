// Step 3a: cut every clip in data/<id>/timeline.json to a uniform H.264 file
// under public/<id>/clip-NN.mp4 (NN = order in the video) for Remotion.
// Usage: node scripts/prepare.mjs <project id> <materials dir>
//
// Videos: trimmed, rotation applied, HDR tone-mapped to SDR, scaled to fill the
// frame. Images: EXIF orientation applied, held for the clip length. Clips
// without sound get a silent track so every clip has the same layout. A video
// clip with `hold` (added when fitting narration) freezes its last frame for
// that many extra seconds, with silence.
import fs from "node:fs";
import path from "node:path";
import {
  findSource,
  probe,
  projectPaths,
  readJson,
  run,
  TONEMAP,
} from "./lib/project.mjs";

export const clipFileName = (index) => `clip-${String(index + 1).padStart(2, "0")}.mp4`;

export const prepare = (id, materialsDir, timeline = readJson(projectPaths(id).timeline)) => {
  const paths = projectPaths(id);
  const { width, height, fps } = timeline.video;
  const fill = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps}`;
  const encode = [
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  ];
  const silence = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];

  fs.rmSync(paths.public, { recursive: true, force: true });
  fs.mkdirSync(paths.public, { recursive: true });
  const imagesDir = path.join(paths.work, "images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const clips = timeline.telops.flatMap((t) => t.clips);
  clips.forEach((clip, index) => {
    const asset = timeline.assets[clip.asset];
    const src = findSource(materialsDir, asset.file);
    const out = path.join(paths.public, clipFileName(index));
    const duration = clip.end - clip.start;

    if ((asset.type ?? "video") === "image") {
      const still = path.join(imagesDir, `${clip.asset}.png`);
      run("convert", [src, "-auto-orient", still]);
      run("ffmpeg", [
        "-v", "error", "-y",
        "-loop", "1", "-framerate", String(fps), "-t", String(duration), "-i", still,
        ...silence,
        "-vf", `${fill},format=yuv420p`,
        ...encode,
        "-map", "0:v:0", "-map", "1:a:0", "-t", String(duration),
        "-movflags", "+faststart", out,
      ]);
    } else if (clip.hold) {
      // Trim on the input side so the clip's end is the end of the stream,
      // where tpad/apad add the frozen frame and silence.
      const info = probe(src);
      const vf = `${info.hdr ? `${TONEMAP},` : ""}${fill},tpad=stop_mode=clone:stop_duration=${clip.hold}`;
      const total = String(duration + clip.hold);
      run("ffmpeg", [
        "-v", "error", "-y", "-ss", String(clip.start), "-t", String(duration), "-i", src,
        ...(info.hasAudio ? [] : silence),
        "-vf", vf,
        ...(info.hasAudio ? ["-af", "apad"] : []),
        ...encode,
        "-map", "0:v:0", "-map", info.hasAudio ? "0:a:0" : "1:a:0",
        "-t", total,
        "-movflags", "+faststart", out,
      ]);
    } else {
      const info = probe(src);
      const vf = `${info.hdr ? `${TONEMAP},` : ""}${fill}`;
      run("ffmpeg", [
        "-v", "error", "-y", "-i", src,
        ...(info.hasAudio ? [] : silence),
        "-ss", String(clip.start), "-to", String(clip.end),
        "-vf", vf,
        ...encode,
        "-map", "0:v:0", "-map", info.hasAudio ? "0:a:0" : "1:a:0",
        ...(info.hasAudio ? [] : ["-shortest"]),
        "-movflags", "+faststart", out,
      ]);
    }
    const hold = clip.hold ? ` +${clip.hold}s hold` : "";
    console.log(`${clipFileName(index)} <- ${asset.file} [${clip.start}-${clip.end}]${hold} (${clip.segment})`);
  });
  return clips.length;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, materialsDir] = process.argv.slice(2);
  if (!id || !materialsDir) {
    console.error("usage: node scripts/prepare.mjs <project id> <materials dir>");
    process.exit(1);
  }
  prepare(id, materialsDir);
}
