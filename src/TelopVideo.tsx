import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile } from "remotion";

export type Clip = {
  segment: string;
  asset: string;
  start: number;
  end: number;
};

export type Telop = {
  id: string;
  // "\n" starts a new line.
  text: string;
  clips: Clip[];
  // Sound effect played when the telop appears; must match SFX in scripts/prepare.mjs.
  sfx?: "sparkle";
};

// Optional per-project look. Anything left out keeps the test01 look.
export type TelopStyle = {
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  glowColor?: string;
  fontSize?: number;
};

export type Timeline = {
  id: string;
  video: { width: number; height: number; fps: number };
  style?: TelopStyle;
  telops: Telop[];
};

// Must match clipFileName() in scripts/prepare.mjs, which writes these files.
const clipFileName = (index: number) =>
  `clip-${String(index + 1).padStart(2, "0")}.mp4`;

const clipFrames = (clip: Clip, fps: number) =>
  Math.round((clip.end - clip.start) * fps);

export const timelineDuration = (timeline: Timeline) =>
  timeline.telops
    .flatMap((t) => t.clips)
    .reduce((sum, c) => sum + clipFrames(c, timeline.video.fps), 0);

const TELOP_MAX_WIDTH = 960;
const TELOP_MAX_FONT_SIZE = 76;

// Shrink long lines so each stays on one line instead of wrapping mid-word.
const telopFontSize = (text: string, maxFontSize: number) =>
  Math.min(
    maxFontSize,
    Math.floor(
      TELOP_MAX_WIDTH / Math.max(...text.split("\n").map((line) => [...line].length)),
    ),
  );

const TelopText = ({ text, style = {} }: { text: string; style?: TelopStyle }) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <div
      style={{
        textAlign: "center",
        whiteSpace: "pre",
        fontFamily: "'IPAGothic', 'IPAPGothic', sans-serif",
        fontWeight: 700,
        fontSize: telopFontSize(text, style.fontSize ?? TELOP_MAX_FONT_SIZE),
        lineHeight: 1.3,
        color: style.color ?? "white",
        WebkitTextStroke: `${style.strokeWidth ?? 14}px ${style.strokeColor ?? "black"}`,
        paintOrder: "stroke fill",
        ...(style.glowColor
          ? { filter: `drop-shadow(0 0 18px ${style.glowColor})` }
          : {}),
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

export const TelopVideo = ({ timeline }: { timeline: Timeline }) => {
  const { fps } = timeline.video;
  const clips: { key: string; from: number; duration: number }[] = [];
  const telops: {
    key: string;
    text: string;
    sfx?: Telop["sfx"];
    from: number;
    duration: number;
  }[] = [];

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
      sfx: telop.sfx,
      from: telopFrom,
      duration: cursor - telopFrom,
    });
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {clips.map((c) => (
        <Sequence key={c.key} from={c.from} durationInFrames={c.duration}>
          <OffthreadVideo src={staticFile(`${timeline.id}/${c.key}`)} />
        </Sequence>
      ))}
      {telops.map((t) => (
        <Sequence key={t.key} from={t.from} durationInFrames={t.duration}>
          <TelopText text={t.text} style={timeline.style} />
        </Sequence>
      ))}
      {telops
        .filter((t) => t.sfx)
        .map((t) => (
          <Sequence key={`sfx-${t.key}`} from={t.from}>
            <Audio src={staticFile(`${timeline.id}/sfx-${t.sfx}.wav`)} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
