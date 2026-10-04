import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";

export type Clip = {
  segment: string;
  asset: string;
  start: number;
  end: number;
};

export type Telop = {
  id: string;
  text: string;
  clips: Clip[];
};

export type Timeline = {
  id: string;
  video: { width: number; height: number; fps: number };
  telops: Telop[];
};

const clipFrames = (clip: Clip, fps: number) =>
  Math.round((clip.end - clip.start) * fps);

export const timelineDuration = (timeline: Timeline) =>
  timeline.telops
    .flatMap((t) => t.clips)
    .reduce((sum, c) => sum + clipFrames(c, timeline.video.fps), 0);

const TELOP_MAX_WIDTH = 960;
const TELOP_MAX_FONT_SIZE = 76;

// Shrink long telops so they stay on one line instead of wrapping mid-word.
const telopFontSize = (text: string) =>
  Math.min(TELOP_MAX_FONT_SIZE, Math.floor(TELOP_MAX_WIDTH / [...text].length));

const TelopText = ({ text }: { text: string }) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <div
      style={{
        textAlign: "center",
        whiteSpace: "nowrap",
        fontFamily: "'IPAGothic', 'IPAPGothic', sans-serif",
        fontWeight: 700,
        fontSize: telopFontSize(text),
        lineHeight: 1.3,
        color: "white",
        WebkitTextStroke: "14px black",
        paintOrder: "stroke fill",
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

export const TelopVideo = ({ timeline }: { timeline: Timeline }) => {
  const { fps } = timeline.video;
  const clips: { key: string; from: number; duration: number }[] = [];
  const telops: { key: string; text: string; from: number; duration: number }[] =
    [];

  let cursor = 0;
  for (const [index, telop] of timeline.telops.entries()) {
    const telopFrom = cursor;
    for (const clip of telop.clips) {
      const duration = clipFrames(clip, fps);
      clips.push({ key: clip.segment, from: cursor, duration });
      cursor += duration;
    }
    telops.push({
      key: `${index}-${telop.id}`,
      text: telop.text,
      from: telopFrom,
      duration: cursor - telopFrom,
    });
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {clips.map((c) => (
        <Sequence key={c.key} from={c.from} durationInFrames={c.duration}>
          <OffthreadVideo src={staticFile(`${timeline.id}/${c.key}.mp4`)} />
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
