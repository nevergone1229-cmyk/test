import { AbsoluteFill, useCurrentFrame } from "remotion";

export const MyComposition = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b84f3",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 80,
          color: "white",
          fontFamily: "sans-serif",
          transform: `scale(${1 + frame / 200})`,
        }}
      >
        Hello Remotion! 🎬
      </div>
    </AbsoluteFill>
  );
};
