import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadTomorrow } from "@remotion/google-fonts/Tomorrow";
import { Audio } from "@remotion/media";
import { ding, mouseClick } from "@remotion/sfx";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

const { fontFamily: headingFont } = loadTomorrow("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});
const { fontFamily: bodyFont } = loadGeist("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});
const { fontFamily: monoFont } = loadGeistMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

const colors = {
  background: "#000000",
  foreground: "#ededed",
  muted: "#8b8b8b",
  subtle: "#555555",
  border: "#25252b",
  surface: "#0a0a0c",
  accent: "#5af2a8",
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const baseFrame: CSSProperties = {
  backgroundColor: colors.background,
  color: colors.foreground,
  fontFamily: bodyFont,
};

const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        ...baseFrame,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 1540,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          textAlign: "center",
          opacity: interpolate(frame, [0, 8, 59, 70], [0, 1, 1, 0], {
            ...clamp,
            easing: ease,
          }),
          translate: `0 ${interpolate(frame, [0, 10, 59, 71], [28, 0, 0, -24], {
            ...clamp,
            easing: ease,
          })}px`,
        }}
      >
        <div
          style={{
            color: colors.accent,
            fontFamily: headingFont,
            fontSize: 72,
            fontWeight: 400,
            letterSpacing: "-0.035em",
            opacity: interpolate(frame, [0, 10], [0, 1], {
              ...clamp,
              easing: ease,
            }),
          }}
        >
          Your app needs notifications.
        </div>
        <div
          style={{
            fontFamily: headingFont,
            fontSize: 108,
            fontWeight: 400,
            letterSpacing: "-0.045em",
            lineHeight: 1.05,
            opacity: interpolate(frame, [12, 23], [0, 1], {
              ...clamp,
              easing: ease,
            }),
            translate: `0 ${interpolate(frame, [12, 23], [18, 0], {
              ...clamp,
              easing: ease,
            })}px`,
          }}
        >
          Not another dashboard.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OpeningScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        ...baseFrame,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 1540,
          textAlign: "center",
          opacity: interpolate(frame, [0, 18, 61, 79], [0, 1, 1, 0], {
            ...clamp,
            easing: ease,
          }),
          translate: `0 ${interpolate(
            frame,
            [0, 22, 61, 81],
            [34, 0, 0, -150],
            {
              ...clamp,
              easing: ease,
            },
          )}px`,
        }}
      >
        <div
          style={{
            fontFamily: headingFont,
            fontSize: 112,
            fontWeight: 400,
            letterSpacing: "-0.045em",
            lineHeight: 1.05,
          }}
        >
          <div>What if notifications</div>
          <div>
            lived <span style={{ color: colors.accent }}>inside your app?</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CodeLine: React.FC<{
  appearAt: number;
  children?: ReactNode;
  highlight?: boolean;
}> = ({ appearAt, children, highlight = false }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        minHeight: 62,
        display: "block",
        lineHeight: "62px",
        whiteSpace: "pre",
        opacity: interpolate(frame, [appearAt, appearAt + 6], [0, 1], {
          ...clamp,
          easing: ease,
        }),
        translate: `0 ${interpolate(frame, [appearAt, appearAt + 6], [14, 0], {
          ...clamp,
          easing: ease,
        })}px`,
        backgroundColor: highlight
          ? `rgba(90, 242, 168, ${interpolate(frame, [62, 70], [0, 0.075], clamp)})`
          : "transparent",
        borderLeft: highlight
          ? `3px solid rgba(90, 242, 168, ${interpolate(frame, [62, 70], [0, 1], clamp)})`
          : "3px solid transparent",
        paddingLeft: 28,
        marginLeft: -31,
      }}
    >
      {children}
    </div>
  );
};

const Token: React.FC<{
  children: ReactNode;
  color?: string;
  weight?: 400 | 500;
}> = ({ children, color = colors.foreground, weight = 400 }) => (
  <span style={{ color, fontWeight: weight }}>{children}</span>
);

const CodeScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        ...baseFrame,
        alignItems: "center",
        justifyContent: "center",
        opacity: interpolate(frame, [0, 10, 90, 104], [0, 1, 1, 0], {
          ...clamp,
          easing: ease,
        }),
      }}
    >
      <div
        style={{
          width: 1480,
          height: 680,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          translate: `0 ${interpolate(
            frame,
            [0, 12, 90, 104],
            [48, 0, 0, -38],
            {
              ...clamp,
              easing: ease,
            },
          )}px`,
          scale: interpolate(frame, [0, 12, 90, 104], [0.98, 1, 1, 0.985], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            height: 76,
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 34px",
            fontFamily: monoFont,
            color: colors.muted,
            fontSize: 27,
          }}
        >
          <span>lib/notifykit.ts</span>
          <span style={{ color: colors.subtle }}>TypeScript</span>
        </div>

        <div
          style={{
            padding: "38px 64px",
            fontFamily: monoFont,
            fontSize: 42,
            lineHeight: 1.48,
            letterSpacing: "-0.025em",
          }}
        >
          <CodeLine appearAt={8}>
            <Token color="#9888ff">const</Token>{" "}
            <Token weight={500}>notify</Token>{" "}
            <Token color={colors.muted}>=</Token>{" "}
            <Token color="#4db8ff">createNotifyKit</Token>
            <Token color={colors.muted}>({"{ ... }"})</Token>
          </CodeLine>
          <CodeLine appearAt={22} />
          <CodeLine appearAt={24} highlight>
            <Token color="#9888ff">await</Token>{" "}
            <Token weight={500}>notify</Token>
            <Token color={colors.muted}>.</Token>
            <Token color={colors.accent}>send</Token>
            <Token color={colors.muted}>{"({"}</Token>
          </CodeLine>
          <CodeLine appearAt={36}>
            {"  "}
            <Token color="#4db8ff">notificationId</Token>
            <Token color={colors.muted}>:</Token>{" "}
            <Token color="#ffc85a">&quot;comment_mentioned&quot;</Token>
            <Token color={colors.muted}>,</Token>
          </CodeLine>
          <CodeLine appearAt={44}>
            {"  "}
            <Token color="#4db8ff">recipientId</Token>
            <Token color={colors.muted}>:</Token>{" "}
            <Token color="#ffc85a">&quot;user_42&quot;</Token>
            <Token color={colors.muted}>,</Token>
          </CodeLine>
          <CodeLine appearAt={52}>
            {"  "}
            <Token color="#4db8ff">payload</Token>
            <Token color={colors.muted}>:</Token>{" "}
            <Token color={colors.muted}>{"{"}</Token>{" "}
            <Token color="#4db8ff">actorName</Token>
            <Token color={colors.muted}>:</Token>{" "}
            <Token color="#ffc85a">&quot;Rey&quot;</Token>
            <Token color={colors.muted}>, ... {"}"},</Token>
          </CodeLine>
          <CodeLine appearAt={60}>
            <Token color={colors.muted}>{"}"})</Token>
          </CodeLine>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Checkmark: React.FC<{ color?: string }> = ({ color = colors.accent }) => (
  <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
    <rect
      x="1"
      y="1"
      width="44"
      height="44"
      rx="22"
      fill="none"
      stroke={color}
      strokeWidth="2"
    />
    <path
      d="M14 23.5l6 6L33 16.5"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DatabaseIcon: React.FC = () => (
  <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
    <ellipse
      cx="21"
      cy="9"
      rx="14"
      ry="6"
      fill="none"
      stroke={colors.muted}
      strokeWidth="2"
    />
    <path
      d="M7 9v12c0 3.3 6.3 6 14 6s14-2.7 14-6V9M7 21v12c0 3.3 6.3 6 14 6s14-2.7 14-6V21"
      fill="none"
      stroke={colors.muted}
      strokeWidth="2"
    />
  </svg>
);

const OutputCard: React.FC<{
  appearAt: number;
  label: string;
  title: string;
  detail: string;
}> = ({ appearAt, label, title, detail }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        width: 560,
        height: 220,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        padding: "34px 38px",
        display: "flex",
        gap: 28,
        alignItems: "center",
        opacity: interpolate(frame, [appearAt, appearAt + 8], [0, 1], {
          ...clamp,
          easing: ease,
        }),
        translate: `0 ${interpolate(frame, [appearAt, appearAt + 8], [24, 0], {
          ...clamp,
          easing: ease,
        })}px`,
      }}
    >
      <Checkmark />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span
          style={{
            fontFamily: monoFont,
            color: colors.muted,
            fontSize: 24,
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </span>
        <strong style={{ fontSize: 42, fontWeight: 500 }}>{title}</strong>
        <span style={{ color: colors.muted, fontSize: 29 }}>{detail}</span>
      </div>
    </div>
  );
};

const DeliveryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const lineProgress = interpolate(frame, [8, 30], [0, 1], {
    ...clamp,
    easing: ease,
  });

  return (
    <AbsoluteFill
      style={{
        ...baseFrame,
        alignItems: "center",
        paddingTop: 150,
        opacity: interpolate(frame, [0, 5, 66, 74], [0, 1, 1, 0], {
          ...clamp,
          easing: ease,
        }),
      }}
    >
      <div
        style={{
          height: 82,
          padding: "0 38px",
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontFamily: monoFont,
          fontSize: 34,
          color: colors.foreground,
          scale: interpolate(frame, [0, 6, 10, 14], [0.96, 1, 1, 0.985], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <span style={{ color: colors.subtle }}>&gt;</span>
        <span>notify.</span>
        <span style={{ color: colors.accent, marginLeft: -18 }}>send()</span>
      </div>

      <svg
        width="1200"
        height="270"
        viewBox="0 0 1200 270"
        style={{ marginTop: -2, overflow: "visible" }}
        aria-hidden="true"
      >
        <path
          d="M600 0V112M600 112H286V270M600 112H914V270"
          fill="none"
          stroke={colors.accent}
          strokeWidth="2"
          strokeLinecap="square"
          strokeDasharray="1050"
          strokeDashoffset={1050 * (1 - lineProgress)}
          opacity={interpolate(frame, [6, 12], [0, 1], clamp)}
        />
        <circle
          cx="600"
          cy="112"
          r="5"
          fill={colors.accent}
          opacity={interpolate(frame, [20, 25], [0, 1], clamp)}
        />
      </svg>

      <div
        style={{
          display: "flex",
          gap: 80,
          marginTop: -18,
        }}
      >
        <OutputCard
          appearAt={28}
          label="IN-APP INBOX"
          title="Rey mentioned you"
          detail="In Launch Plan"
        />
        <OutputCard
          appearAt={38}
          label="EMAIL"
          title="Delivered"
          detail="jane@example.com"
        />
      </div>

      <div
        style={{
          marginTop: 52,
          display: "flex",
          alignItems: "center",
          gap: 18,
          color: colors.muted,
          fontSize: 34,
          opacity: interpolate(frame, [47, 56], [0, 1], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <DatabaseIcon />
        <span>stored in your database</span>
      </div>
    </AbsoluteFill>
  );
};

const Statement: React.FC<{ children: ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        ...baseFrame,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: headingFont,
          fontSize: 132,
          letterSpacing: "-0.05em",
          opacity: interpolate(frame, [0, 5, 21, 26], [0, 1, 1, 0], {
            ...clamp,
            easing: ease,
          }),
          translate: `0 ${interpolate(frame, [0, 5, 21, 27], [24, 0, 0, -18], {
            ...clamp,
            easing: ease,
          })}px`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

const FinalScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        ...baseFrame,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          opacity: interpolate(frame, [0, 12], [0, 1], {
            ...clamp,
            easing: ease,
          }),
          translate: `0 ${interpolate(frame, [0, 14], [28, 0], {
            ...clamp,
            easing: ease,
          })}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <Img
            src={staticFile("notifykit_logo.png")}
            style={{ width: 148, height: 148, objectFit: "cover" }}
          />
          <div
            style={{
              fontFamily: headingFont,
              fontSize: 112,
              fontWeight: 500,
              letterSpacing: "-0.045em",
            }}
          >
            NotifyKit
          </div>
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: headingFont,
            fontSize: 58,
            letterSpacing: "-0.025em",
          }}
        >
          Notifications,{" "}
          <span style={{ color: colors.accent }}>in your stack.</span>
        </div>
        <div style={{ color: colors.muted, fontSize: 34 }}>
          TypeScript notification infrastructure
        </div>
        <div
          style={{
            marginTop: 10,
            color: colors.subtle,
            fontFamily: monoFont,
            fontSize: 27,
          }}
        >
          github.com/reyabsaluja/notifykit
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const NotifyKitLaunchVideo: React.FC = () => {
  return (
    <AbsoluteFill style={baseFrame}>
      <Sequence durationInFrames={72}>
        <ProblemScene />
      </Sequence>
      <Sequence from={60} durationInFrames={81}>
        <OpeningScene />
      </Sequence>
      <Sequence from={126} durationInFrames={105}>
        <CodeScene />
      </Sequence>
      <Sequence from={231} durationInFrames={75}>
        <DeliveryScene />
      </Sequence>

      <Sequence from={306} durationInFrames={27}>
        <Statement>
          <span style={{ color: colors.muted }}>Your</span> code.
        </Statement>
      </Sequence>
      <Sequence from={333} durationInFrames={27}>
        <Statement>
          <span style={{ color: colors.muted }}>Your</span> database.
        </Statement>
      </Sequence>
      <Sequence from={360} durationInFrames={27}>
        <Statement>
          <span style={{ color: colors.muted }}>Your</span> providers.
        </Statement>
      </Sequence>
      <Sequence from={387} durationInFrames={63}>
        <FinalScene />
      </Sequence>

      <Sequence from={141} durationInFrames={8}>
        <Audio src={mouseClick} volume={0.025} />
      </Sequence>
      <Sequence from={161} durationInFrames={8}>
        <Audio src={mouseClick} volume={0.025} />
      </Sequence>
      <Sequence from={181} durationInFrames={8}>
        <Audio src={mouseClick} volume={0.025} />
      </Sequence>
      <Sequence from={233} durationInFrames={10}>
        <Audio src={mouseClick} volume={0.12} />
      </Sequence>
      <Sequence from={269} durationInFrames={28}>
        <Audio src={ding} volume={0.08} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const MyComposition: React.FC = () => (
  <Composition
    id="NotifyKitLaunch"
    component={NotifyKitLaunchVideo}
    durationInFrames={450}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{}}
  />
);
