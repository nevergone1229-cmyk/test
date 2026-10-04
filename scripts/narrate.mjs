// Generate narration for each script line with the standard narration voice.
// Usage: node scripts/narrate.mjs <project id>
//
// Reads data/<id>/script.txt (one telop per line) and calls Gemini TTS with
// DEFAULT_NARRATION.voice. Writes work/<id>/narration/N01.wav, N02.wav, … and
// data/<id>/narration.json. Needs GEMINI_API_KEY.
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_NARRATION, ROOT, projectPaths, round, run, writeJson } from "./lib/project.mjs";

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
const lines = fs
  .readFileSync(paths.script, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const outDir = path.join(paths.work, "narration");
fs.mkdirSync(outDir, { recursive: true });

const { voice, model } = DEFAULT_NARRATION;

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

const items = [];
for (const [index, text] of lines.entries()) {
  const file = path.join(outDir, `N${String(index + 1).padStart(2, "0")}.wav`);
  fs.writeFileSync(file, await synthesize(text));
  const duration = Number(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]),
  );
  items.push({ index: index + 1, text, file: path.relative(ROOT, file), duration: round(duration) });
  console.log(`${path.basename(file)}  ${round(duration)}s  ${text}`);
}

writeJson(paths.narration, { id, voice, model, lines: items });
console.log(`wrote ${paths.narration}`);
