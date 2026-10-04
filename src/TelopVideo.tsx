import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
} from "remotion";

export type Clip = {
  segment: string;
  asset: string;
  start: number;
  end: number;
  // Seconds to freeze the last frame (added when fitting narration).
  hold?: number;
};

// Added by scripts/lib/narration.mjs at render time.
export type Narration = {
  file: string;
  offset: number;
  duration: number;
};

export type Telop = {
  id: string;
  text: string;
  clips: Clip[];
  narration?: Narration;
};

export type Timeline = {
  id: string;
  video: { width: number; height: number; fps: number };
  telops: Telop[];
  audio?: { duckVolume: number; rampSeconds: number };
};

// Must match clipFileName() in scripts/prepare.mjs, which writes these files.
const clipFileName = (index: number) =>
  `clip-${String(index + 1).padStart(2, "0")}.mp4`;

const clipFrames = (clip: Clip, fps: number) =>
  Math.round((clip.end - clip.start + (clip.hold ?? 0)) * fps);

export const timelineDuration = (timeline: Timeline) =>
  timeline.telops
    .flatMap((t) => t.clips)
    .reduce((sum, c) => sum + clipFrames(c, timeline.video.fps), 0);

const TELOP_MAX_WIDTH = 960;
const TELOP_FONT_SIZE = 76;

// Telops are shown without punctuation; a mid-line mark becomes a space so the
// phrases stay apart. The narration still reads the original text.
export const telopDisplayText = (text: string) =>
  text
    .replace(/[、。，．,.！？!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Every telop uses the same size. A line that does not fit wraps between
// phrases (auto-phrase), balanced across lines.
const TelopText = ({ text }: { text: string }) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <div
      lang="ja"
      style={{
        maxWidth: TELOP_MAX_WIDTH,
        textAlign: "center",
        wordBreak: "auto-phrase" as React.CSSProperties["wordBreak"],
        textWrap: "balance",
        fontFamily: "'IPAGothic', 'IPAPGothic', sans-serif",
        fontWeight: 700,
        fontSize: TELOP_FONT_SIZE,
        lineHeight: 1.3,
        color: "white",
        WebkitTextStroke: "14px black",
        paintOrder: "stroke fill",
      }}
    >
      {telopDisplayText(text)}
    </div>
  </AbsoluteFill>
);

// Volume of the clips' own sound at a frame: lowered to duckVolume while any
// narration plays (fading in and out over rampFrames), otherwise full.
const clipVolumeAt = (
  frame: number,
  windows: { from: number; to: number }[],
  duckVolume: number,
  rampFrames: number,
) =>
  Math.min(
    1,
    ...windows.map((w) =>
      interpolate(
        frame,
        [w.from - rampFrames, w.from, w.to, w.to + rampFrames],
        [1, duckVolume, duckVolume, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      ),
    ),
  );

export const TelopVideo = ({ timeline }: { timeline: Timeline }) => {
  const { fps } = timeline.video;
  const clips: { key: string; from: number; duration: number }[] = [];
  const telops: { key: string; text: string; from: number; duration: number }[] =
    [];
  const narrations: { key: string; file: string; from: number; duration: number }[] =
    [];

  let cursor = 0;
  for (const [index, telop] of timeline.telops.entries()) {
    const telopFrom = cursor;
    for (const clip of telop.clips) {
      const duration = clipFrames(clip, fps);
      clips.push({ key: clipFileName(clips.length), from: cursor, duration });
      cursor += duration;
    }
    telops.push({
      key: `${index}-${telop.id}`,
      text: telop.text,
      from: telopFrom,
      duration: cursor - telopFrom,
    });
    if (telop.narration) {
      const from = telopFrom + Math.round(telop.narration.offset * fps);
      narrations.push({
        key: `${index}-${telop.id}-narration`,
        file: telop.narration.file,
        from,
        duration: Math.min(Math.ceil(telop.narration.duration * fps), cursor - from),
      });
    }
  }

  const duck = timeline.audio;
  const windows = narrations.map((n) => ({ from: n.from, to: n.from + n.duration }));
  const volumeFor = (clipFrom: number) =>
    duck && windows.length
      ? (frame: number) =>
          clipVolumeAt(clipFrom + frame, windows, duck.duckVolume, duck.rampSeconds * fps)
      : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {clips.map((c) => (
        <Sequence key={c.key} from={c.from} durationInFrames={c.duration}>
          <OffthreadVideo
            src={staticFile(`${timeline.id}/${c.key}`)}
            volume={volumeFor(c.from)}
          />
        </Sequence>
      ))}
      {narrations.map((n) => (
        <Sequence key={n.key} from={n.from} durationInFrames={n.duration}>
          <Audio src={staticFile(`${timeline.id}/${n.file}`)} />
        </Sequence>
      ))}
      {telops.map((t) => (
        <Sequence key={t.key} from={t.from} durationInFrames={t.duration}>
          <TelopText text={t.text} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
