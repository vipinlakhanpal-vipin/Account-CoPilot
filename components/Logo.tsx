/** Account CoPilot mark: a compass-rose "A" on a teal-to-sky tile. */
export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Account CoPilot logo">
      <defs>
        <linearGradient id="acp-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2EC4A6" />
          <stop offset="1" stopColor="#3A7BD5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#acp-g)" />
      <rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke="rgba(255,255,255,.35)" />
      <path d="M20 8 L30 31 L20 25.5 L10 31 Z" fill="#FFFFFF" />
      <path d="M20 8 L20 25.5 L10 31 Z" fill="#DDF7F0" />
      <circle cx="29.5" cy="11" r="3" fill="#FFE08A" stroke="#0D1830" strokeWidth="1.2" />
    </svg>
  );
}
