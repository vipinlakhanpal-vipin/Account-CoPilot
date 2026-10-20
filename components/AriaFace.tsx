// Aria's face, shared by the roaming orb in the left panel and the host in her playroom. The mood changes her eyes and mouth: happy (default), cheer, oops, think, neutral.
export type Mood = "happy" | "cheer" | "oops" | "think" | "neutral" | "wink" | "dizzy" | "shy" | "silly" | "wow";
const look = { transform: "translate(calc(var(--ex,0) * 1px), calc(var(--ey,0) * 1px))" } as const; // her pupils follow the pointer (the playroom sets --ex and --ey)

export function AriaFace({ mood = "happy" }: { mood?: Mood }) {
  const eyes = mood === "cheer"
    ? <><path d="M7.4 12.3q1.7-2.4 3.4 0" stroke="#2A1E80" strokeWidth="1.3" strokeLinecap="round" fill="none" /><path d="M13.2 12.3q1.7-2.4 3.4 0" stroke="#2A1E80" strokeWidth="1.3" strokeLinecap="round" fill="none" /></>
    : mood === "shy"
    ? <><g style={{ transform: "translate(-0.9px,0.5px)" }}><circle cx="9.1" cy="11.5" r="1.85" fill="url(#ar-eye)" /><circle cx="8.5" cy="10.9" r=".55" fill="#fff" /><circle cx="14.9" cy="11.5" r="1.85" fill="url(#ar-eye)" /><circle cx="14.3" cy="10.9" r=".55" fill="#fff" /></g></>
    : mood === "wow"
    ? <><circle cx="9.1" cy="11.4" r="2.3" fill="url(#ar-eye)" /><circle cx="8.3" cy="10.6" r=".75" fill="#fff" /><circle cx="14.9" cy="11.4" r="2.3" fill="url(#ar-eye)" /><circle cx="14.1" cy="10.6" r=".75" fill="#fff" /></>
    : mood === "dizzy"
    ? <><path d="M7.6 10.2l3 3M10.6 10.2l-3 3M13.4 10.2l3 3M16.4 10.2l-3 3" stroke="#2A1E80" strokeWidth="1.2" strokeLinecap="round" /></>
    : <>
        {mood === "wink"
          ? <path d="M7.4 11.8q1.7-1.9 3.4 0" stroke="#2A1E80" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          : <g style={look}><circle cx="9.1" cy={mood === "think" ? 11 : 11.5} r="1.85" fill="url(#ar-eye)" /><circle cx={mood === "think" ? 9.4 : 8.5} cy={mood === "think" ? 10.2 : 10.8} r=".55" fill="#fff" /></g>}
        <g style={look}><circle cx="14.9" cy={mood === "think" ? 11 : 11.5} r="1.85" fill="url(#ar-eye)" /><circle cx={mood === "think" ? 15.2 : 14.3} cy={mood === "think" ? 10.2 : 10.8} r=".55" fill="#fff" /></g>
      </>;
  const mouth = mood === "shy" ? <><ellipse cx="6.7" cy="14.3" rx="1.4" ry=".85" fill="#FF8FB1" opacity=".8" /><ellipse cx="17.3" cy="14.3" rx="1.4" ry=".85" fill="#FF8FB1" opacity=".8" /><path d="M10.2 15.5q.9-.8 1.8 0t1.8 0" stroke="#19D3B0" strokeWidth="1.2" strokeLinecap="round" fill="none" filter="url(#ar-glow)" /></>
    : mood === "silly" ? <><path d="M8.8 14.4h6.4q-.3 2.5-3.2 2.5t-3.2-2.5z" fill="#19D3B0" filter="url(#ar-glow)" /><ellipse cx="12" cy="16.5" rx="1.3" ry="1.1" fill="#FF8FB1" /></>
    : mood === "wow" ? <circle cx="12" cy="15.3" r="1.4" fill="#19D3B0" filter="url(#ar-glow)" />
    : mood === "wink" ? <path d="M8.8 14.3q3.2 3.2 6.4 0" stroke="#19D3B0" strokeWidth="1.5" strokeLinecap="round" fill="none" filter="url(#ar-glow)" />
    : mood === "dizzy" ? <path d="M9 15.4q1-1.2 2 0t2 0 2 0" stroke="#19D3B0" strokeWidth="1.3" strokeLinecap="round" fill="none" filter="url(#ar-glow)" />
    : mood === "cheer" ? <path d="M8.6 14.4q3.4 3.6 6.8 0z" fill="#19D3B0" filter="url(#ar-glow)" />
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
export function AriaOrb({ mood = "happy", size = 96, anim = "", onClick }: { mood?: Mood; size?: number; anim?: "" | "hop" | "shake" | "spin" | "peek"; onClick?: () => void }) {
  const c = `aria-orb${anim ? ` ${anim}` : ""}${onClick ? " poke" : ""}`;
  return onClick ? <button type="button" className={c} style={{ width: size, height: size }} onClick={onClick} aria-label="Poke Aria"><AriaFace mood={mood} /></button>
    : <span className={c} style={{ width: size, height: size }}><AriaFace mood={mood} /></span>;
}
