// Line-art scenes for the landing page, one style throughout (see Illustrations.tsx): 3px cream lines on the deep-blue panel, flat
// lighter-blue shapes for light and depth, a few marigold accents, no faces, no gradients, no glows. Decorative (aria-hidden).
import type { ReactNode } from "react";

const L = "#FAF7F2";          // line / cream
const M = "#E8A317";          // marigold accent
const B1 = "#1B62AD";         // flat light shape
const B2 = "#2A78C8";         // brighter flat shape
const BD = "#093A70";         // deep (desk fronts)
const SKIN = "#F6E3B4";
const HAIR = "#1B2430";

const ln = { fill: "none", stroke: L, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Frame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 480 420" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden focusable="false">
      <polygon points="300,0 420,0 360,420 190,420" fill={B1} opacity="0.55" />
      {children}
    </svg>
  );
}

/** Reception desk used by several scenes: the top slab and the dark front. */
const Desk = ({ y = 330 }: { y?: number }) => (
  <>
    <rect x="30" y={y} width="420" height="20" rx="10" fill={L} />
    <path d={`M52 ${y + 20} H428 V440 H52 Z`} fill={BD} stroke={L} strokeWidth="3" strokeLinejoin="round" />
  </>
);

const Plant = ({ x = 70, y = 330 }: { x?: number; y?: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0 0 C-8 -40 -26 -64 -34 -88 M0 0 C4 -44 18 -66 30 -86 M0 0 C0 -34 -2 -60 4 -86" {...ln} />
    <path d="M-34 -88 q-14 8 -10 22 q16 -2 10 -22z M30 -86 q16 4 14 20 q-16 0 -14 -20z M4 -86 q-10 -12 2 -24 q12 10 -2 24z" fill={L} />
    <path d="M-28 0 H28 L24 -2 L20 40 H-20 Z" transform="translate(0 0)" fill={M} stroke={L} strokeWidth="3" strokeLinejoin="round" />
  </g>
);

/** Clinic: reception desk, a stethoscope, a clipboard, a plant. */
export function ClinicScene({ className = "" }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="300" y="40" width="130" height="170" rx="12" fill={B2} stroke={L} strokeWidth="3" /><path d="M365 40 V210 M300 125 H430" {...ln} />
      <Plant x={80} y={340} />
      <Desk />
      <path d="M170 330 C150 270 200 250 220 290 C240 250 290 270 270 330" {...ln} stroke={L} />
      <circle cx="270" cy="338" r="0" />
      <path d="M220 290 V250" {...ln} /><circle cx="220" cy="240" r="10" fill={M} stroke={L} strokeWidth="3" />
      <rect x="310" y="270" width="80" height="60" rx="6" fill={B2} stroke={L} strokeWidth="3" /><path d="M325 290 H375 M325 304 H360" {...ln} strokeWidth={2.5} />
      <rect x="338" y="262" width="24" height="12" rx="4" fill={M} stroke={L} strokeWidth="2.5" />
    </Frame>
  );
}

/** Salon: a salon chair and a mirror. */
export function SalonScene({ className = "" }: { className?: string }) {
  return (
    <Frame className={className}>
      <ellipse cx="330" cy="170" rx="70" ry="100" fill={B2} stroke={L} strokeWidth="3" /><ellipse cx="330" cy="170" rx="56" ry="86" {...ln} strokeWidth={2} opacity="0.6" />
      <Plant x={80} y={360} />
      <path d="M180 360 H300" {...ln} /><path d="M240 360 V300 M200 392 H280" {...ln} />
      <path d="M170 300 H310 C316 300 320 296 320 290 V270 H160 V290 C160 296 164 300 170 300Z" fill={M} stroke={L} strokeWidth="3" strokeLinejoin="round" />
      <path d="M170 270 C160 220 160 190 176 150 H250 C268 190 266 220 260 270" fill={B2} stroke={L} strokeWidth="3" strokeLinejoin="round" />
      <rect x="186" y="118" width="60" height="30" rx="10" fill={L} />
      <path d="M310 285 V320 H340" {...ln} />
      <path d="M92 250 l24 -24 M92 226 l24 24 M104 238 m-22 30 l16 -20" {...ln} />
      <rect x="40" y="396" width="400" height="16" rx="8" fill={L} />
    </Frame>
  );
}

/** Fitness: a bench, a pair of dumbbells, a kettlebell. */
export function GymScene({ className = "" }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="290" y="50" width="140" height="150" rx="12" fill={B2} stroke={L} strokeWidth="3" /><path d="M360 50 V200 M290 125 H430" {...ln} />
      <rect x="150" y="270" width="200" height="34" rx="14" fill={M} stroke={L} strokeWidth="3" />
      <path d="M180 304 V372 M320 304 V372 M160 372 H200 M300 372 H340" {...ln} />
      <path d="M70 380 H130" {...ln} /><rect x="58" y="344" width="14" height="36" rx="4" fill={L} /><rect x="128" y="344" width="14" height="36" rx="4" fill={L} /><path d="M72 362 H128" {...ln} />
      <path d="M380 372 a30 30 0 1 1 0 0.1" {...ln} /><circle cx="380" cy="350" r="26" fill={B2} stroke={L} strokeWidth="3" /><path d="M364 330 q16 -26 32 0" {...ln} />
      <rect x="40" y="396" width="400" height="16" rx="8" fill={L} />
    </Frame>
  );
}

/** Law: a desk with the scales of justice, a stack of books and a lamp. */
export function LawScene({ className = "" }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="60" y="50" width="120" height="90" rx="8" {...ln} /><path d="M82 80 H158 M82 100 H140 M82 120 H150" {...ln} strokeWidth={2.5} />
      <Desk />
      <path d="M250 330 V190 M200 190 H300" {...ln} /><path d="M200 190 L178 250 H222 Z M300 190 L278 250 H322 Z" fill={B2} stroke={L} strokeWidth="3" strokeLinejoin="round" /><circle cx="250" cy="184" r="8" fill={M} stroke={L} strokeWidth="2.5" /><path d="M226 330 H274" {...ln} />
      <rect x="70" y="296" width="100" height="14" rx="3" fill={M} stroke={L} strokeWidth="3" /><rect x="76" y="282" width="88" height="14" rx="3" fill={B2} stroke={L} strokeWidth="3" /><rect x="82" y="268" width="76" height="14" rx="3" fill={L} />
      <path d="M390 330 V270 L420 240" {...ln} /><path d="M406 232 L432 242 L422 258 Z" fill={M} stroke={L} strokeWidth="2.5" strokeLinejoin="round" />
    </Frame>
  );
}

/** Consultant: a laptop showing a video call, a mug, a plant. */
export function ConsultScene({ className = "" }: { className?: string }) {
  return (
    <Frame className={className}>
      <Plant x={400} y={330} />
      <Desk />
      <rect x="130" y="196" width="220" height="134" rx="10" fill={B2} stroke={L} strokeWidth="3" />
      <rect x="146" y="212" width="86" height="56" rx="6" fill={BD} /><rect x="244" y="212" width="86" height="56" rx="6" fill={BD} /><rect x="146" y="276" width="184" height="36" rx="6" fill={BD} />
      <circle cx="189" cy="234" r="11" fill={SKIN} /><path d="M170 262 q19 -22 38 0" fill={L} /><circle cx="287" cy="234" r="11" fill={SKIN} /><path d="M268 262 q19 -22 38 0" fill={M} />
      <path d="M160 294 H260" {...ln} strokeWidth={2.5} /><circle cx="310" cy="294" r="9" fill={M} stroke={L} strokeWidth="2.5" />
      <path d="M100 330 H380" {...ln} />
      <path d="M60 300 H92 V326 C92 332 88 336 82 336 H70 C64 336 60 332 60 326 Z" fill={L} /><path d="M92 308 q14 4 0 16" {...ln} strokeWidth={2.5} />
    </Frame>
  );
}

/** Any service business: a small shop front with an awning and a calendar in the window. */
export function ShopScene({ className = "" }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="90" y="130" width="300" height="250" rx="8" fill={BD} stroke={L} strokeWidth="3" />
      <path d="M70 130 H410 L390 80 H90 Z" fill={L} /><path d="M130 80 L124 130 M170 80 L168 130 M210 80 L212 130 M250 80 L256 130 M290 80 L300 130 M330 80 L344 130 M370 80 L388 130" stroke={M} strokeWidth="14" />
      <rect x="120" y="170" width="150" height="120" rx="8" fill={B2} stroke={L} strokeWidth="3" />
      <path d="M120 200 H270" {...ln} /><path d="M146 160 V178 M244 160 V178" {...ln} />
      <path d="M140 220 H160 M178 220 H198 M216 220 H236 M140 244 H160 M178 244 H198 M140 268 H160" {...ln} strokeWidth={2.5} /><circle cx="216" cy="244" r="12" fill={M} />
      <rect x="296" y="170" width="70" height="210" rx="6" fill={B2} stroke={L} strokeWidth="3" /><circle cx="350" cy="280" r="5" fill={L} />
      <rect x="306" y="190" width="50" height="22" rx="5" fill={L} />
      <rect x="40" y="380" width="400" height="16" rx="8" fill={L} />
    </Frame>
  );
}

/** Token story: a person relaxing on a sofa at home, looking at a phone. */
export function AtHomeScene({ className = "" }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="290" y="50" width="140" height="190" rx="12" fill={B2} stroke={L} strokeWidth="3" /><path d="M360 50 V240 M290 145 H430" {...ln} />
      <path d="M70 260 C70 236 90 224 112 224 H150 M410 260 C410 236 390 224 368 224 H330" {...ln} opacity="0" />
      <path d="M50 380 V300 C50 276 66 262 90 262 H390 C414 262 430 276 430 300 V380 Z" fill={BD} stroke={L} strokeWidth="3" strokeLinejoin="round" />
      <path d="M50 330 H430" {...ln} strokeWidth={2} opacity="0.4" />
      <rect x="60" y="290" width="84" height="64" rx="14" fill={M} stroke={L} strokeWidth="3" />
      <circle cx="262" cy="196" r="30" fill={SKIN} stroke={L} strokeWidth="3" /><path d="M232 192 C234 160 292 156 294 192 C282 178 250 176 232 192Z" fill={HAIR} /><circle cx="286" cy="164" r="11" fill={HAIR} />
      <path d="M200 330 C200 262 232 236 262 236 C292 236 324 262 324 330" fill={B2} stroke={L} strokeWidth="3" strokeLinejoin="round" />
      <path d="M232 292 C246 280 262 280 276 288" {...ln} /><rect x="268" y="262" width="34" height="56" rx="6" fill={L} stroke={L} strokeWidth="2" transform="rotate(-14 285 290)" /><path d="M276 276 H292" stroke={B1} strokeWidth="3" strokeLinecap="round" transform="rotate(-14 285 290)" />
      <path d="M60 396 H420" {...ln} />
    </Frame>
  );
}

/** The team: three people behind a reception desk. */
export function TeamScene({ className = "" }: { className?: string }) {
  const person = (x: number, tone: string, hair: string) => (
    <g key={x}>
      <circle cx={x} cy="228" r="28" fill={SKIN} stroke={L} strokeWidth="3" /><path d={`M${x - 28} 226 C${x - 26} 196 ${x + 26} 196 ${x + 28} 226 C${x + 16} 212 ${x - 16} 212 ${x - 28} 226Z`} fill={hair} />
      <path d={`M${x - 64} 340 C${x - 64} 276 ${x - 30} 258 ${x} 258 C${x + 30} 258 ${x + 64} 276 ${x + 64} 340`} fill={tone} stroke={L} strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
  return (
    <Frame className={className}>
      <rect x="60" y="50" width="130" height="100" rx="8" {...ln} /><path d="M60 128 l40 -40 l26 26 l30 -36 l34 50" {...ln} strokeWidth={2.5} /><circle cx="150" cy="78" r="10" fill={M} />
      {person(130, B2, HAIR)}{person(240, M, HAIR)}{person(350, B2, HAIR)}
      <Desk y={340} />
      <rect x="196" y="300" width="88" height="40" rx="6" fill={B2} stroke={L} strokeWidth="3" /><path d="M210 316 H268" {...ln} strokeWidth={2.5} />
    </Frame>
  );
}
