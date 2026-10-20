// Aria's face, shared by the roaming orb in the left panel and the host in her playroom. The mood changes her eyes and mouth: happy (default), cheer, oops, think, neutral.
export type Mood = "happy" | "cheer" | "oops" | "think" | "neutral";

export function AriaFace({ mood = "happy" }: { mood?: Mood }) {
  const eyes = mood === "cheer"
    ? <><path d="M7.4 12.3q1.7-2.4 3.4 0" stroke="#2A1E80" strokeWidth="1.3" strokeLinecap="round" fill="none" /><path d="M13.2 12.3q1.7-2.4 3.4 0" stroke="#2A1E80" strokeWidth="1.3" strokeLinecap="round" fill="none" /></>
    : <>
        <circle cx="9.1" cy={mood === "think" ? 11 : 11.5} r="1.85" fill="url(#ar-eye)" /><circle cx="14.9" cy={mood === "think" ? 11 : 11.5} r="1.85" fill="url(#ar-eye)" />
        <circle cx={mood === "think" ? 9.4 : 8.5} cy={mood === "think" ? 10.2 : 10.8} r=".55" fill="#fff" /><circle cx={mood === "think" ? 15.2 : 14.3} cy={mood === "think" ? 10.2 : 10.8} r=".55" fill="#fff" />
      </>;
  const mouth = mood === "cheer" ? <path d="M8.6 14.4q3.4 3.6 6.8 0z" fill="#19D3B0" filter="url(#ar-glow)" />
    : mood === "oops" ? <path d="M9.2 16q2.8-2.4 5.6 0" stroke="#19D3B0" strokeWidth="1.4" strokeLinecap="round" fill="none" filter="url(#ar-glow)" />
    : mood === "think" ? <circle cx="12" cy="15.3" r="1" stroke="#19D3B0" strokeWidth="1.2" fill="none" filter="url(#ar-glow)" />
    : mood === "neutral" ? <path d="M9.4 15h5.2" stroke="#19D3B0" strokeWidth="1.5" strokeLinecap="round" filter="url(#ar-glow)" />
    : <path d="M9.1 14.5q2.9 2.3 5.8 0" stroke="#19D3B0" strokeWidth="1.5" strokeLinecap="round" fill="none" filter="url(#ar-glow)" />;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ar-head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.6" stopColor="#ECE8FF" /><stop offset="1" stopColor="#C9C2F2" /></linearGradient>
        <radialGradient id="ar-eye" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#8E7CFF" /><stop offset="0.55" stopColor="#4B3BB8" /><stop offset="1" stopColor="#241A72" /></radialGradient>
        <radialGradient id="ar-ant" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFF6C9" /><stop offset="1" stopColor="#FFC83D" /></radialGradient>
        <filter id="ar-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.55" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse cx="12" cy="21.6" rx="6.4" ry="1.1" fill="#1A1260" opacity=".35" />
      <path d="M12 4.3v2.2" stroke="#E4E0FF" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="2.9" r="1.45" fill="url(#ar-ant)" filter="url(#ar-glow)" />
      <rect x="2.3" y="9.6" width="2" height="4.8" rx="1" fill="url(#ar-head)" />
      <rect x="19.7" y="9.6" width="2" height="4.8" rx="1" fill="url(#ar-head)" />
      <rect x="4.6" y="6.4" width="14.8" height="11.2" rx="3.6" fill="url(#ar-head)" />
      <rect x="4.6" y="6.4" width="14.8" height="11.2" rx="3.6" fill="none" stroke="#FFFFFF" strokeOpacity=".9" strokeWidth=".5" />
      <path d="M6.2 8.4c1.2-1 3.4-1.4 5-1.3" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity=".9" fill="none" />
      {eyes}{mouth}
      <rect x="8" y="18.4" width="8" height="2.6" rx="1.3" fill="url(#ar-head)" />
    </svg>
  );
}

/** The 3D orb at any size, used in the playroom (the roaming one in the left panel is the .agame-bot button). */
export function AriaOrb({ mood = "happy", size = 96, anim = "" }: { mood?: Mood; size?: number; anim?: "" | "hop" | "shake" }) {
  return <span className={`aria-orb${anim ? ` ${anim}` : ""}`} style={{ width: size, height: size }}><AriaFace mood={mood} /></span>;
}
