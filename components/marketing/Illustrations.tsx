// One illustration style for the marketing site: 3px cream line-art on the deep-blue panel, flat lighter-blue shapes for
// light and depth, marigold used for two or three small accents. No faces, no gradients, no glows.
const CREAM = "#FAF7F2";
const MARIGOLD = "#E8A317";
const BLUE_LIGHT = "#1B62AD";   // flat shapes (window light)
const JACKET = "#2A78C8";
const SKIN = "#F6E3B4";
const HAIR = "#1B2430";
const BLUE_DEEP = "#093A70";    // desk front and shadows

const line = { fill: "none", stroke: CREAM, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A calm reception: window light, a plant, a framed picture, and a person at the desk with a tablet. Decorative. */
export function ReceptionScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 560" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden focusable="false">
      {/* window light, laid across the wall and floor as flat shapes */}
      <polygon points="262,64 436,64 404,560 120,560" fill={BLUE_LIGHT} opacity="0.7" />
      <polygon points="300,64 346,64 296,560 232,560" fill="#2A78C8" opacity="0.45" />
      {/* window */}
      <rect x="276" y="70" width="156" height="206" rx="14" fill="#1E67B4" stroke={CREAM} strokeWidth="3" />
      <path d="M354 70 V276 M276 173 H432" {...line} />
      <path d="M290 92 q18 -10 36 0 M372 92 q18 -10 36 0" {...line} strokeWidth={2} opacity="0.55" />
      {/* framed picture: hills and a sun */}
      <rect x="58" y="104" width="112" height="84" rx="8" {...line} />
      <path d="M58 168 l34 -34 l22 22 l24 -30 l32 42" {...line} strokeWidth={2.5} />
      <circle cx="136" cy="128" r="9" fill={MARIGOLD} />
      {/* plant, left */}
      <path d="M92 404 C84 360 66 336 56 312 M92 404 C96 352 112 326 128 304 M92 404 C92 366 90 340 96 312 M92 404 C70 380 44 380 30 366 M92 404 C116 384 140 384 154 372" {...line} />
      <path d="M56 312 q-14 8 -10 24 q16 -2 10 -24z M128 304 q16 4 14 22 q-16 0 -14 -22z M96 312 q-10 -14 2 -26 q12 12 -2 26z" fill={CREAM} opacity="0.9" />
      <path d="M62 404 H122 L116 452 H68 Z" fill={MARIGOLD} stroke={CREAM} strokeWidth="3" strokeLinejoin="round" />
      {/* person behind the desk: head, hair knot, shoulders, stethoscope, lanyard */}
      <circle cx="208" cy="252" r="34" fill={SKIN} stroke={CREAM} strokeWidth="3" />
      <path d="M174 250 C176 212 240 208 242 250 C230 232 196 228 174 250Z" fill={HAIR} />
      <circle cx="228" cy="214" r="13" fill={HAIR} />
      <path d="M112 400 C112 332 150 304 208 304 C266 304 304 332 304 400" fill={JACKET} stroke={CREAM} strokeWidth="3" strokeLinejoin="round" />
      <path d="M172 306 C168 352 184 372 208 372 C232 372 248 352 244 306" {...line} strokeWidth={2.5} />
      <circle cx="244" cy="306" r="5" fill={MARIGOLD} stroke={CREAM} strokeWidth="2" />
      <path d="M208 304 V352" stroke={MARIGOLD} strokeWidth="4" strokeLinecap="round" />
      <rect x="198" y="350" width="20" height="26" rx="4" fill={CREAM} />
      {/* the desk */}
      <rect x="30" y="396" width="420" height="22" rx="11" fill={CREAM} />
      <path d="M52 418 H428 V560 H52 Z" fill={BLUE_DEEP} stroke={CREAM} strokeWidth="3" strokeLinejoin="round" />
      <path d="M52 462 H428" {...line} strokeWidth={2} opacity="0.35" />
      {/* tablet on the desk */}
      <rect x="318" y="338" width="86" height="58" rx="8" fill={JACKET} stroke={CREAM} strokeWidth="3" />
      <path d="M332 356 H390 M332 370 H372" {...line} strokeWidth={2.5} />
      <path d="M352 396 V404 M334 404 H372" {...line} />
    </svg>
  );
}
