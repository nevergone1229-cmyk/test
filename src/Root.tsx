import { CalculateMetadataFunction, Composition } from "remotion";
import { MyComposition } from "./MyComposition";
import { TelopVideo, Timeline, timelineDuration } from "./TelopVideo";
import test01 from "../data/test01/timeline.json";

const test01Timeline = test01 as Timeline;

type TelopVideoProps = { timeline: Timeline };

// Size and length come from whichever timeline is passed with --props.
const timelineMetadata: CalculateMetadataFunction<TelopVideoProps> = ({
  props,
}) => ({
  durationInFrames: timelineDuration(props.timeline),
  fps: props.timeline.video.fps,
  width: props.timeline.video.width,
  height: props.timeline.video.height,
});

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="MyComposition"
        component={MyComposition}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="test01"
        component={TelopVideo}
        durationInFrames={timelineDuration(test01Timeline)}
        fps={test01Timeline.video.fps}
        width={test01Timeline.video.width}
        height={test01Timeline.video.height}
        defaultProps={{ timeline: test01Timeline }}
      />
      <Composition
        id="TelopVideo"
        component={TelopVideo}
        calculateMetadata={timelineMetadata}
        defaultProps={{ timeline: test01Timeline }}
      />
    </>
  );
};
