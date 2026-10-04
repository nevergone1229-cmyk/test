// Generate narration for each telop with the standard narration voice.
// Usage: node scripts/narrate.mjs <project id>
//
// Reads the telops in data/<id>/timeline.json and calls Gemini TTS with
// DEFAULT_NARRATION.voice. Writes work/<id>/narration/<telop id>.wav and
// data/<id>/narration.json, then prints how render will fit each telop's clips
// to its narration. Needs GEMINI_API_KEY. Run it again after changing a telop.
// Silence before and after the speech is trimmed: TTS sometimes returns many
// seconds of trailing silence, which would otherwise stretch the video. The
// speech is then sped up to DEFAULT_NARRATION.speed.
import fs from "node:fs";
import path from "node:path";
import { fitNarration } from "./lib/narration.mjs";
import { DEFAULT_NARRATION, ROOT, projectPaths, readJson, round, run, writeJson } from "./lib/project.mjs";

const [id] = process.argv.slice(2);
if (!id) {
  console.error("usage: node scripts/narrate.mjs <project id>");
  process.exit(1);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set");
  process.exit(1);
}
const paths = projectPaths(id);
const timeline = readJson(paths.timeline);
const outDir = path.join(paths.work, "narration");
fs.mkdirSync(outDir, { recursive: true });

const { voice, model, speed } = DEFAULT_NARRATION;

const synthesize = async (text) => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { voice } },
        },
      }),
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`TTS failed (${res.status}): ${body.error?.message ?? ""}`);
  const audio = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (audio?.mimeType !== "audio/wav") {
    throw new Error(`unexpected TTS response: ${audio?.mimeType ?? "no audio"}`);
  }
  return Buffer.from(audio.data, "base64");
};

// TTS occasionally answers without audio; try a few times before giving up.
const synthesizeWithRetry = async (text, attempts = 3) => {
  for (let i = 1; ; i++) {
    try {
      return await synthesize(text);
    } catch (error) {
      if (i >= attempts) throw error;
      console.warn(`retrying "${text}" (${error.message})`);
    }
  }
};

// Trim silence at both ends (reverse, trim the start, reverse back), then
// speed up to DEFAULT_NARRATION.speed without changing the pitch.
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05";
const finish = (raw, file) =>
  run("ffmpeg", [
    "-v", "error", "-y", "-i", raw,
    "-af", `${TRIM},areverse,${TRIM},areverse,atempo=${speed}`,
    "-c:a", "pcm_s16le", file,
  ]);

const telops = [];
for (const { id: telopId, text } of timeline.telops) {
  const file = path.join(outDir, `${telopId}.wav`);
  const raw = path.join(outDir, `${telopId}.raw.wav`);
  fs.writeFileSync(raw, await synthesizeWithRetry(text));
  finish(raw, file);
  fs.rmSync(raw);
  const duration = Number(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]),
  );
  telops.push({ id: telopId, text, file: path.relative(ROOT, file), duration: round(duration) });
  console.log(`${telopId}  ${round(duration)}s  ${text}`);
}

const narration = { id, voice, model, speed, telops };
writeJson(paths.narration, narration);
console.log(`wrote ${paths.narration}`);

const { changes } = fitNarration(timeline, narration, DEFAULT_NARRATION);
for (const c of changes) {
  const hold = c.hold ? `, last frame held ${c.hold}s` : "";
  console.log(`render will lengthen ${c.telop}: ${c.from}s → ${c.to}s (clip ${c.clip} to ${c.end}s${hold})`);
}
