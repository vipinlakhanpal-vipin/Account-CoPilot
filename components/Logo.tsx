/** Account CoPilot mark: a compass-rose "A" on a glossy teal-to-blue sphere, drawn in 3D like the profile circle. */
export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Account CoPilot logo">
      <defs>
        <radialGradient id="acp-sphere" cx="0.32" cy="0.26" r="0.85">
          <stop offset="0" stopColor="#C4FBEE" />
          <stop offset="0.3" stopColor="#2EC4A6" />
          <stop offset="0.68" stopColor="#1E8FD0" />
          <stop offset="1" stopColor="#1A4FB8" />
        </radialGradient>
        <linearGradient id="acp-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor="#031A5A" stopOpacity="0" />
          <stop offset="1" stopColor="#031A5A" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#acp-sphere)" />
      <circle cx="20" cy="20" r="19" fill="url(#acp-shade)" />
      <circle cx="20" cy="20" r="18.4" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1" />
      <ellipse cx="14.5" cy="9.5" rx="9" ry="4.8" fill="#fff" opacity=".38" transform="rotate(-24 14.5 9.5)" />
      <g className="acp-arrow">
        <path d="M20 9.5 L29.5 31.5 L20 26 L10.5 31.5 Z" fill="rgba(3,20,90,.38)" transform="translate(0 1.1)" />
        <path d="M20 9.5 L29.5 31.5 L20 26 L10.5 31.5 Z" fill="#FFFFFF" />
        <path d="M20 9.5 L20 26 L10.5 31.5 Z" fill="#DDF7F0" />
      </g>
      <g className="acp-orbit"><circle cx="29" cy="12" r="3" fill="#FFE08A" stroke="#0D2A70" strokeWidth="1.1" /></g>
    </svg>
  );
}
