// Fit generated narration (data/<id>/narration.json) onto a timeline.
//
// Each telop's narration starts `leadSeconds` after the telop appears. When the
// narration plus lead and tail is longer than the telop's clips, the telop's
// last clip is lengthened: images are simply shown longer, videos continue
// further into the source, and once the source runs out the last frame is
// held (`hold`). Clips are never shortened. The confirmed timeline.json is not
// changed; render uses the returned copy.
import { round } from "./project.mjs";

export const narrationFileName = (telopId) => `narration-${telopId}.wav`;

const clipSeconds = (clip) => clip.end - clip.start + (clip.hold ?? 0);

export const fitNarration = (timeline, narration, settings) => {
  const { leadSeconds, tailSeconds, duckVolume, rampSeconds } = settings;
  const byId = new Map(narration.telops.map((n) => [n.id, n]));
  const changes = [];

  const telops = timeline.telops.map((telop) => {
    const n = byId.get(telop.id);
    if (!n) throw new Error(`no narration for ${telop.id}; run npm run narrate`);
    if (n.text !== telop.text) {
      throw new Error(`narration for ${telop.id} is for "${n.text}", not "${telop.text}"; run npm run narrate`);
    }
    const clips = telop.clips.map((clip) => ({ ...clip }));
    const before = clips.reduce((sum, c) => sum + clipSeconds(c), 0);
    const target = leadSeconds + n.duration + tailSeconds;
    let need = round(target - before, 3);

    if (need > 0) {
      const last = clips[clips.length - 1];
      const type = timeline.assets[last.asset].type ?? "video";
      const room = type === "image" ? Infinity : Math.max(0, timeline.assets[last.asset].duration - last.end);
      const extend = Math.min(room, need);
      last.end = round(last.end + extend);
      need = round(need - extend, 3);
      if (need > 0) last.hold = round((last.hold ?? 0) + need);
      changes.push({
        telop: telop.id,
        from: round(before),
        to: round(clips.reduce((sum, c) => sum + clipSeconds(c), 0)),
        clip: last.segment,
        end: last.end,
        hold: last.hold ?? 0,
      });
    }

    return {
      ...telop,
      clips,
      narration: {
        file: narrationFileName(telop.id),
        offset: leadSeconds,
        duration: n.duration,
      },
    };
  });

  return {
    timeline: { ...timeline, telops, audio: { duckVolume, rampSeconds } },
    changes,
  };
};
