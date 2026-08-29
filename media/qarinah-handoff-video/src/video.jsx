import React from "react";
import {
  AbsoluteFill,
  Composition,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

const COLORS = {
  background: "#070c11",
  panel: "#0d151e",
  border: "#263443",
  ink: "#f4f8f5",
  muted: "#9fb0bf",
  green: "#42edba",
  yellow: "#f6c85f",
  red: "#ff756d"
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

function Fade({ children, duration }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18, duration - 18, duration], [0, 1, 1, 0], clamp);
  const translateY = interpolate(frame, [0, 20], [24, 0], clamp);
  return <AbsoluteFill style={{ opacity, transform: `translateY(${translateY}px)` }}>{children}</AbsoluteFill>;
}

function Shell({ eyebrow, children, accent = COLORS.green }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, color: COLORS.ink, fontFamily: "Inter, Arial, sans-serif" }}>
      <div style={{ position: "absolute", inset: 42, border: `1px solid ${COLORS.border}`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 64, left: 72, right: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "Consolas, monospace", fontSize: 23, letterSpacing: 3.2, color: accent, textTransform: "uppercase" }}>
          {eyebrow}
        </div>
        <div style={{ fontFamily: "Consolas, monospace", fontSize: 21, color: COLORS.muted }}>QARINAH · REAL LOCAL DEMO</div>
      </div>
      <div style={{ position: "absolute", top: 112, left: 72, right: 72, height: 2, backgroundColor: COLORS.border }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, backgroundColor: accent }} />
      </div>
      {children}
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 58, display: "flex", justifyContent: "space-between", color: COLORS.muted, fontFamily: "Consolas, monospace", fontSize: 18 }}>
        <span>No model key · no telemetry · isolated fixture</span>
        <span>qarinah.io</span>
      </div>
    </AbsoluteFill>
  );
}

function TitleScene() {
  return (
    <Fade duration={480}>
      <Shell eyebrow="The handoff test">
        <div style={{ position: "absolute", left: 120, top: 240, width: 1580 }}>
          <h1 style={{ fontSize: 106, lineHeight: 0.98, letterSpacing: -5, margin: 0, maxWidth: 1550 }}>
            Start a new coding-agent session without re-explaining your project.
          </h1>
          <p style={{ fontSize: 38, lineHeight: 1.35, color: COLORS.muted, marginTop: 50, maxWidth: 1250 }}>
            We close Session A, remove its temporary transcript, and ask a fresh Session B to recover one exact engineering decision from Qarinah.
          </p>
        </div>
      </Shell>
    </Fade>
  );
}

function Terminal({ title, lines, footnote }) {
  return (
    <div style={{ position: "absolute", left: 150, right: 150, top: 210, bottom: 150, backgroundColor: COLORS.panel, border: `2px solid ${COLORS.border}` }}>
      <div style={{ height: 62, borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 13, padding: "0 25px" }}>
        <span style={{ width: 15, height: 15, borderRadius: 99, backgroundColor: COLORS.red }} />
        <span style={{ width: 15, height: 15, borderRadius: 99, backgroundColor: COLORS.yellow }} />
        <span style={{ width: 15, height: 15, borderRadius: 99, backgroundColor: COLORS.green }} />
        <span style={{ marginLeft: 15, color: COLORS.muted, fontSize: 21, fontFamily: "Consolas, monospace" }}>{title}</span>
      </div>
      <div style={{ padding: "38px 44px", fontFamily: "Consolas, monospace", fontSize: 29, lineHeight: 1.55 }}>
        {lines.map((line, index) => (
          <div key={`${line.text}-${index}`} style={{ color: line.color ?? COLORS.ink, marginBottom: line.gap ?? 9, whiteSpace: "pre-wrap" }}>
            {line.prefix && <span style={{ color: COLORS.green }}>{line.prefix}</span>}{line.text}
          </div>
        ))}
      </div>
      {footnote && <div style={{ position: "absolute", left: 44, right: 44, bottom: 28, color: COLORS.muted, fontSize: 20 }}>{footnote}</div>}
    </div>
  );
}

function DemoScene() {
  return (
    <Fade duration={660}>
      <Shell eyebrow="01 · Try it safely">
        <Terminal
          title="PowerShell · empty temporary workspace"
          lines={[
            { prefix: "> ", text: "npx qarinah@next demo", gap: 26 },
            { text: "✓ isolated workspace created", color: COLORS.green },
            { text: "✓ 3 project files mapped", color: COLORS.green },
            { text: "✓ 1 decision and 1 verified tool result captured", color: COLORS.green },
            { text: "✓ 31 graph nodes · 58 evidence links", color: COLORS.green },
            { text: "✓ activation tracking disabled", color: COLORS.green, gap: 24 },
            { text: "Dashboard: .qarinah/dashboard/index.html", color: COLORS.muted }
          ]}
          footnote="The demo never edits your current project and does not configure an editor or agent host."
        />
      </Shell>
    </Fade>
  );
}

function DecisionScene() {
  return (
    <Fade duration={570}>
      <Shell eyebrow="02 · Session A records the why">
        <div style={{ position: "absolute", left: 150, right: 150, top: 205, bottom: 155, display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 28 }}>
          <div style={{ border: `2px solid ${COLORS.border}`, backgroundColor: COLORS.panel, padding: 42 }}>
            <div style={{ color: COLORS.green, fontFamily: "Consolas, monospace", fontSize: 22 }}>SESSION A</div>
            <h2 style={{ fontSize: 60, lineHeight: 1.04, margin: "30px 0" }}>Checkout retry policy</h2>
            <p style={{ fontSize: 30, lineHeight: 1.45, color: COLORS.muted }}>
              Implement bounded retry handling and verify the permanent-client-failure boundary.
            </p>
          </div>
          <div style={{ border: `2px solid ${COLORS.green}`, backgroundColor: "#081713", padding: 42 }}>
            <div style={{ color: COLORS.green, fontFamily: "Consolas, monospace", fontSize: 22 }}>DECISION · VERIFIED BY NODE:TEST</div>
            <h3 style={{ fontSize: 49, lineHeight: 1.12, margin: "28px 0" }}>Retry checkout requests three times.</h3>
            <p style={{ fontSize: 31, lineHeight: 1.48, margin: 0 }}>
              Use exponential backoff. Retry only HTTP <strong>429</strong> and <strong>503</strong>. Do not retry other 4xx responses.
            </p>
            <p style={{ marginTop: 40, fontFamily: "Consolas, monospace", fontSize: 19, color: COLORS.muted, overflowWrap: "anywhere" }}>
              sha256:28bcab60a96ba4c93207a1fb6c00bb5b960c37635883cde48887fd470c193496
            </p>
          </div>
        </div>
      </Shell>
    </Fade>
  );
}

function CloseScene() {
  const frame = useCurrentFrame();
  const strike = interpolate(frame, [70, 190], [0, 100], clamp);
  return (
    <Fade duration={330}>
      <Shell eyebrow="03 · End the old session" accent={COLORS.red}>
        <div style={{ position: "absolute", inset: "250px 170px 190px", display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ display: "inline-block", position: "relative", fontFamily: "Consolas, monospace", fontSize: 47, color: COLORS.muted }}>
              session-a-transcript.txt
              <span style={{ position: "absolute", left: 0, top: "52%", height: 5, width: `${strike}%`, backgroundColor: COLORS.red }} />
            </div>
            <h2 style={{ fontSize: 92, lineHeight: 1, margin: "55px 0 26px" }}>Session A is gone.</h2>
            <p style={{ fontSize: 36, color: COLORS.muted, margin: 0 }}>No chat replay. No pasted summary. Start from an empty prompt.</p>
          </div>
        </div>
      </Shell>
    </Fade>
  );
}

function RetrievalScene() {
  return (
    <Fade duration={750}>
      <Shell eyebrow="04 · Session B retrieves evidence">
        <Terminal
          title="Fresh Session B · no previous chat"
          lines={[
            { prefix: "> ", text: "npx qarinah query \"Why are checkout retries limited to HTTP 429 and 503?\"", gap: 23 },
            { text: "# Retry checkout requests three times", color: COLORS.green, gap: 16 },
            { text: "Use exponential backoff. Retry only HTTP 429 and 503." },
            { text: "Do not retry other 4xx responses.", gap: 23 },
            { text: "Evidence coverage: partial (5/7 exact query terms)", color: COLORS.yellow },
            { text: "Unresolved conflicts: 0", color: COLORS.green },
            { text: "Event: evt_07e15de4-9974-4929-a167-7434f6b3e141", color: COLORS.muted },
            { text: "Hash: sha256:28bcab60…c193496", color: COLORS.muted }
          ]}
          footnote="This is the actual output of the isolated fixture generated for this video."
        />
      </Shell>
    </Fade>
  );
}

function GraphScene() {
  return (
    <Fade duration={540}>
      <Shell eyebrow="05 · Inspect the handoff">
        <div style={{ position: "absolute", left: 120, right: 120, top: 170, bottom: 140, overflow: "hidden", border: `2px solid ${COLORS.border}`, backgroundColor: COLORS.panel }}>
          <Img src={staticFile("graph.png")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
          <div style={{ position: "absolute", left: 28, bottom: 28, padding: "15px 20px", backgroundColor: "rgba(7, 12, 17, 0.92)", border: `1px solid ${COLORS.green}`, color: COLORS.green, fontFamily: "Consolas, monospace", fontSize: 20 }}>
            REAL LEDGER · SEARCHABLE NODES · CITED RELATIONSHIPS
          </div>
        </div>
      </Shell>
    </Fade>
  );
}

function CallToActionScene() {
  return (
    <Fade duration={270}>
      <Shell eyebrow="Try it before setup">
        <div style={{ position: "absolute", left: 160, right: 160, top: 260, textAlign: "center" }}>
          <h2 style={{ fontSize: 100, letterSpacing: -4, lineHeight: 1.02, margin: 0 }}>Your next session should know where the last one stopped.</h2>
          <div style={{ display: "inline-block", marginTop: 65, padding: "28px 42px", border: `2px solid ${COLORS.green}`, backgroundColor: COLORS.panel, color: COLORS.green, fontFamily: "Consolas, monospace", fontSize: 33 }}>
            npx qarinah@next demo
          </div>
        </div>
      </Shell>
    </Fade>
  );
}

function QarinahHandoff() {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={480}><TitleScene /></Sequence>
      <Sequence from={480} durationInFrames={660}><DemoScene /></Sequence>
      <Sequence from={1140} durationInFrames={570}><DecisionScene /></Sequence>
      <Sequence from={1710} durationInFrames={330}><CloseScene /></Sequence>
      <Sequence from={2040} durationInFrames={750}><RetrievalScene /></Sequence>
      <Sequence from={2790} durationInFrames={540}><GraphScene /></Sequence>
      <Sequence from={3330} durationInFrames={270}><CallToActionScene /></Sequence>
    </AbsoluteFill>
  );
}

export function VideoRoot() {
  return (
    <Composition
      id="QarinahHandoff"
      component={QarinahHandoff}
      durationInFrames={3600}
      fps={30}
      width={1920}
      height={1080}
    />
  );
}
