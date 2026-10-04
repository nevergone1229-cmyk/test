import assert from "node:assert/strict";
import { test } from "node:test";
import { fitNarration } from "./narration.mjs";

const settings = { leadSeconds: 0.2, tailSeconds: 0.4, duckVolume: 0.25, rampSeconds: 0.2 };

const timeline = {
  id: "t",
  video: { width: 1080, height: 1920, fps: 30 },
  assets: {
    long: { file: "long.mov", type: "video", duration: 10 },
    short: { file: "short.mov", type: "video", duration: 3 },
    still: { file: "still.jpg", type: "image" },
  },
  telops: [
    { id: "T1", text: "一", clips: [{ segment: "A", asset: "long", start: 0, end: 4 }] },
    { id: "T2", text: "二", clips: [{ segment: "B", asset: "long", start: 5, end: 7 }] },
    { id: "T3", text: "三", clips: [{ segment: "C", asset: "still", start: 0, end: 2 }] },
    {
      id: "T4",
      text: "四",
      clips: [
        { segment: "D", asset: "long", start: 8, end: 9 },
        { segment: "E", asset: "short", start: 1, end: 3 },
      ],
    },
  ],
};

const narration = {
  telops: [
    { id: "T1", text: "一", duration: 1.5 },
    { id: "T2", text: "二", duration: 2.9 },
    { id: "T3", text: "三", duration: 4.4 },
    { id: "T4", text: "四", duration: 4.4 },
  ],
};

const fitted = fitNarration(timeline, narration, settings).timeline;
const seconds = (t) => t.clips.reduce((s, c) => s + c.end - c.start + (c.hold ?? 0), 0);

test("keeps clips that already fit the narration", () => {
  assert.deepEqual(fitted.telops[0].clips, timeline.telops[0].clips);
});

test("continues a video clip further into its source", () => {
  assert.deepEqual(fitted.telops[1].clips[0], { segment: "B", asset: "long", start: 5, end: 8.5 });
});

test("shows an image longer", () => {
  assert.equal(fitted.telops[2].clips[0].end, 5);
});

test("holds the last frame when the source runs out", () => {
  const [first, last] = fitted.telops[3].clips;
  assert.deepEqual(first, timeline.telops[3].clips[0]);
  assert.equal(last.end, 3);
  assert.equal(last.hold, 2);
  assert.equal(seconds(fitted.telops[3]), 5);
});

test("every telop is long enough for lead + narration + tail", () => {
  for (const [i, t] of fitted.telops.entries()) {
    assert.ok(seconds(t) >= 0.2 + narration.telops[i].duration + 0.4 - 1e-9, t.id);
    assert.deepEqual(t.narration, { file: `narration-${t.id}.wav`, offset: 0.2, duration: narration.telops[i].duration });
  }
  assert.deepEqual(fitted.audio, { duckVolume: 0.25, rampSeconds: 0.2 });
});

test("does not change the confirmed timeline", () => {
  assert.equal(timeline.telops[1].clips[0].end, 7);
  assert.equal(timeline.telops[0].narration, undefined);
});

test("rejects narration for an edited telop", () => {
  const stale = { telops: narration.telops.map((n) => (n.id === "T2" ? { ...n, text: "古い" } : n)) };
  assert.throws(() => fitNarration(timeline, stale, settings), /T2/);
});

test("rejects a telop without narration", () => {
  assert.throws(() => fitNarration(timeline, { telops: narration.telops.slice(1) }, settings), /T1/);
});

test("rejects narration made at a different speed", () => {
  assert.throws(() => fitNarration(timeline, { ...narration, speed: 1 }, { ...settings, speed: 1.2 }), /speed/);
});
