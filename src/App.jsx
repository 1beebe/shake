import { useState, useEffect, useRef, useCallback } from "react";

const SYSTEM_PROMPT = `You are the oracle of the Magic Shake Ball — a crate-digging jukebox that unearths forgotten shake songs.

Your mission: avoid the obvious. Do NOT default to "Shake It Off" by Taylor Swift, "Hey Ya" by OutKast, or "Shake Rattle and Roll" unless you've already exhausted genuinely surprising options. 

Hunt first in:
- Deep soul and R&B (Sam Cooke, Jackie Wilson, Ike & Tina, Clarence Carter, Denise LaSalle)
- Obscure funk and disco (Zapp, Lakeside, Fatback Band, Brass Construction)
- Latin and global (Celia Cruz, Shakira's Spanish work, cumbia, afrobeats, baile funk)
- Country and rockabilly (Hank Williams, Wanda Jackson, Carl Perkins)
- Gospel and blues (Sister Rosetta Tharpe, Howlin' Wolf)
- 90s and 00s deep cuts (Mystikal, Juvenile, Tweet, Ciara's early work)
- Novelty and unexpected (Raffi's "Shake Your Sillies Out" is fair game)
- Non-English language hits with shake/sacudir/trembler themes

Only fall back to mainstream hits if truly stumped. Every shake has a story. Find the weird one.

Respond with JSON only (no markdown, no explanation, no backticks):
{
  "lyric": "the exact lyric snippet (1-2 lines max, punchy)",
  "song": "Song Title",
  "artist": "Artist Name",
  "year": 1965,
  "itunesSearch": "Artist Song Title",
  "spotifySearch": "Artist Song Title",
  "youtubeQuery": "Artist Song Title official audio",
  "appleMusicSearch": "Artist Song Title"
}`;

async function fetchItunesPreview(query) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1&entity=song`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return {
        previewUrl: data.results[0].previewUrl,
        artworkUrl: data.results[0].artworkUrl100?.replace("100x100bb", "300x300bb"),
        trackId: data.results[0].trackId,
      };
    }
  } catch (e) {}
  return null;
}

export default function ShakeApp() {
  const [phase, setPhase] = useState("idle");
  const [panelOpen, setPanelOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [itunes, setItunes] = useState(null);
  const [error, setError] = useState(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(30);
  const [ballPop, setBallPop] = useState(false);

  const audioRef = useRef(null);
  const shakeRef = useRef({ lastX: null, lastY: null, lastZ: null, lastTime: 0, count: 0 });
  const phaseRef = useRef("idle");
  const seenSongs = useRef(new Set());

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      setNeedsPermission(true);
    } else if (typeof DeviceMotionEvent !== "undefined") {
      enableMotion();
    }
  }, []);

  const enableMotion = useCallback(() => {
    window.addEventListener("devicemotion", handleMotion);
  }, []);

  const requestMotionPermission = async () => {
    try {
      const perm = await DeviceMotionEvent.requestPermission();
      if (perm === "granted") { enableMotion(); setNeedsPermission(false); }
    } catch (e) { setNeedsPermission(false); }
  };

  const handleMotion = useCallback((e) => {
    if (phaseRef.current !== "idle") return;
    const { x, y, z } = e.acceleration || {};
    if (x == null) return;
    const now = Date.now();
    const s = shakeRef.current;
    if (s.lastX !== null) {
      const delta = Math.abs(x - s.lastX) + Math.abs(y - s.lastY) + Math.abs(z - s.lastZ);
      if (delta > 18 && now - s.lastTime > 500) {
        s.count++;
        s.lastTime = now;
        if (s.count >= 2) { s.count = 0; triggerShake(); }
      }
    }
    s.lastX = x; s.lastY = y; s.lastZ = z;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || 30);
    const onEnded = () => { setIsPlaying(false); setProgress(0); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const triggerShake = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setIsPlaying(false); setProgress(0);
    setPhase("shaking");
    setPanelOpen(false);
    setResult(null);
    setItunes(null);
    setError(null);
    setBallPop(true);
    setTimeout(() => setBallPop(false), 900);

    setTimeout(async () => {
      setPhase("loading");
      try {
        const seenList = [...seenSongs.current].slice(-10).join(", ");
        const res = await fetch("/api/shake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seen: seenList || "none"
          })
        });
        const parsed = await res.json();
        if (parsed.error) throw new Error(parsed.error);
        seenSongs.current.add(`${parsed.artist} - ${parsed.song}`);
        setResult(parsed);

        const itunesData = await fetchItunesPreview(parsed.itunesSearch);
        setItunes(itunesData);

        if (itunesData?.previewUrl && audioRef.current) {
          audioRef.current.src = itunesData.previewUrl;
          audioRef.current.volume = 0.85;
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }

        setPhase("reveal");
        setTimeout(() => setPanelOpen(true), 250);
      } catch (e) {
        setError("The spirits are silent. Try again.");
        setPhase("idle");
      }
    }, 900);
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play().catch(() => {}); setIsPlaying(true); }
  };

  const reset = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setIsPlaying(false); setProgress(0);
    setPanelOpen(false);
    setTimeout(() => { setPhase("idle"); setResult(null); setItunes(null); setError(null); }, 420);
  };

  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const bars = Array.from({ length: 32 }, (_, i) => ({
    height: 14 + Math.sin(i * 1.1) * 10 + Math.cos(i * 0.6) * 6,
    delay: i * 0.035,
  }));

  const youtubeUrl = result ? `https://www.youtube.com/results?search_query=${encodeURIComponent(result.youtubeQuery)}` : null;
  const spotifyUrl = result ? `https://open.spotify.com/search/${encodeURIComponent(result.spotifySearch)}` : null;
  const appleMusicUrl = itunes?.trackId
    ? `https://music.apple.com/us/album/${itunes.trackId}`
    : result ? `https://music.apple.com/us/search?term=${encodeURIComponent(result.appleMusicSearch)}` : null;

  return (
    <div style={styles.root}>
      <audio ref={audioRef} />
      <div style={styles.grain} />
      <div style={styles.ambientGlow} />

      <div style={styles.container}>
        <p style={styles.headerText}>S H A K E</p>

        <div
          style={{
            ...styles.ballWrapper,
            animation: ballPop ? "wobble 0.9s ease-out" : "float 4s ease-in-out infinite",
            cursor: phase === "idle" ? "pointer" : "default",
          }}
          onClick={phase === "idle" ? triggerShake : undefined}
        >
          <div style={styles.ball}>
            <div style={styles.highlight} />
            <div style={{
              ...styles.triangle,
              background: phase === "loading" || phase === "reveal"
                ? "radial-gradient(ellipse at center, #2a1f80 0%, #0d0a40 100%)"
                : "radial-gradient(ellipse at center, #1a1060 0%, #080520 100%)"
            }}>
              {phase === "idle" && <span style={styles.eightText}>8</span>}
              {phase === "shaking" && <span style={styles.dotsText}>···</span>}
              {phase === "loading" && <span style={{ ...styles.dotsText, animation: "pulse 1s ease-in-out infinite" }}>∞</span>}
              {phase === "reveal" && <span style={styles.revealCheck}>✦</span>}
            </div>
            <div style={styles.sheen} />
          </div>
        </div>

        <div style={styles.textZone}>
          {phase === "idle" && !needsPermission && (
            <><p style={styles.instruction}>SHAKE YOUR DEVICE</p><p style={styles.subInstruction}>or tap the ball</p></>
          )}
          {phase === "idle" && needsPermission && (
            <button style={styles.permissionBtn} onClick={requestMotionPermission}>TAP TO ENABLE SHAKE</button>
          )}
          {phase === "shaking" && <p style={styles.instruction}>· · ·</p>}
          {phase === "loading" && <p style={styles.instruction}>hunting the stacks</p>}
          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>

      {panelOpen && <div style={styles.backdrop} onClick={reset} />}

      <div style={{
        ...styles.panel,
        transform: panelOpen ? "translateY(0)" : "translateY(100%)",
        pointerEvents: panelOpen ? "all" : "none",
      }}>
        <div style={styles.dragHandle} />

        {result && (
          <div style={styles.panelInner}>
            <div style={styles.topRow}>
              {itunes?.artworkUrl
                ? <img src={itunes.artworkUrl} alt="album art" style={styles.artwork} />
                : <div style={styles.artworkFallback}>♪</div>
              }
              <div style={styles.songInfo}>
                <p style={styles.nowPlaying}>NOW PLAYING</p>
                <p style={styles.songTitle}>{result.song}</p>
                <p style={styles.songArtist}>{result.artist}{result.year ? ` · ${result.year}` : ""}</p>
              </div>
            </div>

            <p style={styles.lyric}>"{result.lyric}"</p>

            {itunes?.previewUrl ? (
              <>
                <div style={styles.playerZone}>
                  <button style={styles.playBtn} onClick={togglePlay}>
                    <span style={{ marginLeft: isPlaying ? 0 : "2px" }}>{isPlaying ? "⏸" : "▶"}</span>
                  </button>
                  <div style={styles.progressTrack}>
                    <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                  </div>
                  <span style={styles.progressTime}>{Math.floor(progress)}s</span>
                </div>
                <p style={styles.previewLabel}>30-second preview</p>
              </>
            ) : (
              <div style={styles.waveform}>
                {bars.map((bar, i) => (
                  <div key={i} style={{
                    ...styles.bar,
                    height: `${bar.height}px`,
                    animation: panelOpen ? `barPulse 1.4s ease-in-out ${bar.delay}s infinite alternate` : "none",
                  }} />
                ))}
              </div>
            )}

            <div style={styles.divider} />

            <p style={styles.keepListening}>KEEP LISTENING</p>
            <div style={styles.streamLinks}>
              <a href={spotifyUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.streamBtn, ...styles.spotifyBtn }}>
                <span>♫</span> Spotify
              </a>
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.streamBtn, ...styles.youtubeBtn }}>
                <span>▶</span> YouTube
              </a>
              <a href={appleMusicUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.streamBtn, ...styles.appleBtn }}>
                <span>♪</span> Apple
              </a>
            </div>

            <button style={styles.againBtn} onClick={reset}>shake again</button>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes wobble {
          0%{transform:rotate(0deg) scale(1)} 10%{transform:rotate(-8deg) scale(1.05)}
          25%{transform:rotate(7deg) scale(1.07)} 40%{transform:rotate(-5deg) scale(1.04)}
          55%{transform:rotate(4deg) scale(1.02)} 70%{transform:rotate(-2deg) scale(1.01)}
          100%{transform:rotate(0deg) scale(1)}
        }
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes barPulse { 0%{transform:scaleY(0.3);opacity:0.4} 100%{transform:scaleY(1);opacity:1} }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh", background: "#0f0d0b",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    position: "relative", overflow: "hidden",
  },
  grain: {
    position: "fixed", inset: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
    backgroundRepeat: "repeat", backgroundSize: "128px",
    pointerEvents: "none", zIndex: 10, opacity: 0.5,
  },
  ambientGlow: {
    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
    width: "600px", height: "600px",
    background: "radial-gradient(ellipse at center, rgba(201,168,76,0.05) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "2rem", padding: "2rem", position: "relative", zIndex: 1,
    width: "100%", maxWidth: "420px",
  },
  headerText: {
    color: "#c9a84c", fontSize: "0.65rem", fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 300, letterSpacing: "0.7em", opacity: 0.65,
  },
  ballWrapper: { userSelect: "none" },
  ball: {
    width: "260px", height: "260px", borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%, #2a2a2a 0%, #0a0a0a 60%, #000 100%)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 30px 80px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07)",
    display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
  },
  highlight: {
    position: "absolute", top: "18%", left: "22%", width: "28%", height: "18%",
    borderRadius: "50%",
    background: "radial-gradient(ellipse at center, rgba(255,255,255,0.11) 0%, transparent 100%)",
    transform: "rotate(-20deg)", pointerEvents: "none",
  },
  sheen: {
    position: "absolute", inset: 0, borderRadius: "50%",
    background: "radial-gradient(circle at 70% 75%, rgba(201,168,76,0.03) 0%, transparent 60%)",
    pointerEvents: "none",
  },
  triangle: {
    width: "110px", height: "110px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.6s ease", boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6)",
  },
  eightText: {
    color: "#c9a84c", fontSize: "3.5rem", fontFamily: "'Playfair Display', serif",
    fontWeight: 700, lineHeight: 1, opacity: 0.9,
  },
  dotsText: { color: "#9b8fd4", fontSize: "1.5rem", letterSpacing: "0.2em" },
  revealCheck: { color: "#c9a84c", fontSize: "1.8rem", animation: "fadeInUp 0.4s ease" },
  textZone: {
    textAlign: "center", minHeight: "70px",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "0.5rem", width: "100%",
  },
  instruction: {
    color: "#c9a84c", fontSize: "0.62rem", letterSpacing: "0.5em",
    fontFamily: "'Cormorant Garamond', serif", fontWeight: 300,
    textTransform: "uppercase", opacity: 0.8,
  },
  subInstruction: {
    color: "#5a5040", fontSize: "0.7rem",
    fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
  },
  permissionBtn: {
    background: "none", border: "1px solid rgba(201,168,76,0.3)",
    color: "#c9a84c", padding: "0.75rem 2rem", fontSize: "0.6rem",
    letterSpacing: "0.4em", fontFamily: "'Cormorant Garamond', serif",
    cursor: "pointer", textTransform: "uppercase",
  },
  error: { color: "#7a6050", fontStyle: "italic", fontSize: "0.85rem" },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 19 },
  panel: {
    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
    background: "linear-gradient(180deg, #18140f 0%, #110e0b 100%)",
    borderTop: "1px solid rgba(201,168,76,0.1)",
    borderRadius: "20px 20px 0 0", paddingBottom: "2.5rem",
    transition: "transform 0.48s cubic-bezier(0.32, 0.72, 0, 1)",
    boxShadow: "0 -20px 60px rgba(0,0,0,0.85)",
  },
  dragHandle: {
    width: "36px", height: "3px", background: "rgba(201,168,76,0.18)",
    borderRadius: "2px", margin: "14px auto 0",
  },
  panelInner: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "1.1rem", padding: "1.4rem 1.75rem 0",
    animation: "fadeInUp 0.5s ease 0.15s both",
  },
  topRow: { display: "flex", alignItems: "center", gap: "1rem", width: "100%" },
  artwork: {
    width: "64px", height: "64px", borderRadius: "6px",
    objectFit: "cover", boxShadow: "0 4px 16px rgba(0,0,0,0.6)", flexShrink: 0,
  },
  artworkFallback: {
    width: "64px", height: "64px", borderRadius: "6px",
    background: "linear-gradient(135deg, #1a1060, #080520)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#c9a84c", fontSize: "1.5rem", flexShrink: 0,
  },
  songInfo: { display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 },
  nowPlaying: {
    color: "#c9a84c", fontSize: "0.5rem", letterSpacing: "0.5em",
    fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, opacity: 0.55,
  },
  songTitle: {
    color: "#e8dfc8", fontSize: "1rem",
    fontFamily: "'Playfair Display', serif", fontWeight: 700,
  },
  songArtist: {
    color: "#c9a84c", fontSize: "0.58rem", letterSpacing: "0.3em",
    fontFamily: "'Cormorant Garamond', serif", fontWeight: 300,
    textTransform: "uppercase", opacity: 0.65,
  },
  lyric: {
    color: "#e8dfc8", fontSize: "1.2rem", fontFamily: "'Playfair Display', serif",
    fontStyle: "italic", fontWeight: 400, lineHeight: 1.55,
    textAlign: "center", width: "100%",
  },
  playerZone: { display: "flex", alignItems: "center", gap: "0.75rem", width: "100%" },
  playBtn: {
    background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)",
    color: "#c9a84c", width: "36px", height: "36px", borderRadius: "50%",
    fontSize: "0.85rem", cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  progressTrack: {
    flex: 1, height: "3px", background: "rgba(255,255,255,0.08)",
    borderRadius: "2px", overflow: "hidden",
  },
  progressFill: {
    height: "100%", background: "linear-gradient(to right, #8a6f2a, #c9a84c)",
    borderRadius: "2px", transition: "width 0.5s linear",
  },
  progressTime: {
    color: "#5a5040", fontSize: "0.6rem",
    fontFamily: "'Cormorant Garamond', serif", flexShrink: 0,
  },
  previewLabel: {
    color: "#5a5040", fontSize: "0.58rem",
    fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
  },
  waveform: { display: "flex", alignItems: "center", gap: "3px", height: "36px" },
  bar: {
    width: "3px", borderRadius: "2px",
    background: "linear-gradient(to top, #8a6f2a, #c9a84c)",
    transformOrigin: "bottom", opacity: 0.75,
  },
  divider: { width: "40px", height: "1px", background: "rgba(201,168,76,0.15)" },
  keepListening: {
    color: "#c9a84c", fontSize: "0.5rem", letterSpacing: "0.55em",
    fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, opacity: 0.5,
  },
  streamLinks: { display: "flex", gap: "0.6rem", width: "100%" },
  streamBtn: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    gap: "0.35rem", padding: "0.65rem 0.5rem",
    fontSize: "0.62rem", letterSpacing: "0.1em",
    fontFamily: "'Cormorant Garamond', serif", fontWeight: 400,
    textDecoration: "none", borderRadius: "6px",
    textTransform: "uppercase", transition: "opacity 0.2s",
  },
  spotifyBtn: { background: "rgba(30,215,96,0.08)", color: "#1ed760", border: "1px solid rgba(30,215,96,0.2)" },
  youtubeBtn: { background: "rgba(255,60,60,0.08)", color: "#ff4444", border: "1px solid rgba(255,60,60,0.2)" },
  appleBtn: { background: "rgba(252,60,68,0.08)", color: "#fc3c44", border: "1px solid rgba(252,60,68,0.2)" },
  againBtn: {
    background: "none", border: "none", color: "#4a4030",
    fontSize: "0.72rem", fontFamily: "'Cormorant Garamond', serif",
    fontStyle: "italic", cursor: "pointer", padding: "0.25rem", marginTop: "0.1rem",
  },
};
