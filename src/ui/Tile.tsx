import type { ReactNode } from 'react';
import { FLOWER, GREEN, RED, SOAP, rankOf, suitOf, tileName, type Tile } from '../engine/tiles';

// Tile faces are drawn here as vector art in the traditional style, on a 60 x 80 face.
const C = { green: '#1f7a4d', red: '#b3261e', blue: '#1f5fa8', ink: '#1d2433', purple: '#7a3fb0', pink: '#c2527a', gold: '#d9a441' };
const CJK = '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", serif';
const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_CHARS = ['北', '東', '西', '南'];
const WIND_LETTERS = ['N', 'E', 'W', 'S'];

function Dot({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} />
      <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke="#fbf7ec" strokeWidth={r * 0.18} />
      <circle cx={x} cy={y} r={r * 0.22} fill="#fbf7ec" />
    </g>
  );
}

const DOT_LAYOUT: [number, number, number, string][][] = [
  [[30, 46, 17, C.red]],
  [
    [30, 31, 10, C.green],
    [30, 61, 10, C.blue],
  ],
  [
    [16, 28, 7.5, C.blue],
    [30, 46, 7.5, C.red],
    [44, 64, 7.5, C.green],
  ],
  [
    [19, 33, 8.5, C.blue],
    [41, 33, 8.5, C.green],
    [19, 59, 8.5, C.green],
    [41, 59, 8.5, C.blue],
  ],
  [
    [17, 30, 7.5, C.blue],
    [43, 30, 7.5, C.green],
    [30, 46, 7.5, C.red],
    [17, 62, 7.5, C.green],
    [43, 62, 7.5, C.blue],
  ],
  [
    [19, 28, 7, C.green],
    [41, 28, 7, C.green],
    [19, 46, 7, C.red],
    [41, 46, 7, C.red],
    [19, 64, 7, C.red],
    [41, 64, 7, C.red],
  ],
  [
    [16, 23, 5.5, C.green],
    [30, 29, 5.5, C.green],
    [44, 35, 5.5, C.green],
    [20, 51, 6, C.red],
    [40, 51, 6, C.red],
    [20, 66, 6, C.red],
    [40, 66, 6, C.red],
  ],
  [24, 38, 52, 66].flatMap((y) => [
    [20, y, 5.6, C.blue] as [number, number, number, string],
    [40, y, 5.6, C.blue] as [number, number, number, string],
  ]),
  [28, 46, 64].flatMap((y, row) => [15, 30, 45].map((x) => [x, y, 6, [C.blue, C.red, C.green][row]] as [number, number, number, string])),
];

function Stick({ x, y, h, color }: { x: number; y: number; h: number; color: string }) {
  const w = 5.5;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2.2} fill={color} />
      <rect x={x - w / 2 - 1} y={y - 1.2} width={w + 2} height={2.4} rx={1.2} fill={color} />
      <rect x={x - w / 2 - 1} y={y - h / 2} width={w + 2} height={2} rx={1} fill={color} />
      <rect x={x - w / 2 - 1} y={y + h / 2 - 2} width={w + 2} height={2} rx={1} fill={color} />
      <line x1={x} y1={y - h / 2 + 3.5} x2={x} y2={y - 3} stroke="#fbf7ec" strokeWidth={1} />
      <line x1={x} y1={y + 3} x2={x} y2={y + h / 2 - 3.5} stroke="#fbf7ec" strokeWidth={1} />
    </g>
  );
}

const COLS: Record<number, number[]> = { 1: [30], 2: [20, 40], 3: [15, 30, 45], 4: [12, 24, 36, 48] };
/** Rows of bamboo sticks for 2-9: how many per row, and which sticks are red. */
const BAM_ROWS: Record<number, { rows: number[]; red: [number, number][] }> = {
  2: { rows: [1, 1], red: [] },
  3: { rows: [1, 2], red: [] },
  4: { rows: [2, 2], red: [] },
  5: { rows: [2, 1, 2], red: [[1, 0]] },
  6: { rows: [3, 3], red: [] },
  7: { rows: [1, 3, 3], red: [[0, 0]] },
  8: { rows: [4, 4], red: [] },
  9: { rows: [3, 3, 3], red: [[0, 1], [1, 1], [2, 1]] },
};

function Bird() {
  return (
    <g>
      <path d="M14 62 Q8 70 6 76 M18 64 Q14 72 14 78 M22 64 Q22 72 24 77" stroke={C.red} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <ellipse cx={29} cy={50} rx={15} ry={11} fill={C.green} transform="rotate(-28 29 50)" />
      <path d="M22 54 Q32 44 42 46 Q34 56 22 54Z" fill="#fbf7ec" opacity={0.55} />
      <circle cx={43} cy={32} r={8} fill={C.green} />
      <path d="M50 30 L58 33 L50 36Z" fill={C.red} />
      <circle cx={45} cy={30.5} r={1.8} fill="#fbf7ec" />
      <path d="M38 25 Q40 18 45 20" stroke={C.red} strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M30 60 L30 70 M36 58 L37 68" stroke={C.ink} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

function FlowerArt({ cy = 44, s = 1 }: { cy?: number; s?: number }) {
  return (
    <g transform={`translate(30 ${cy}) scale(${s})`}>
      <path d="M0 12 Q-3 24 2 32" stroke={C.green} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <path d="M0 24 Q9 18 13 24 Q6 28 0 24Z" fill={C.green} />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={0} cy={-10} rx={6.5} ry={9} fill={C.pink} transform={`rotate(${a})`} />
      ))}
      <circle r={5} fill={C.gold} />
    </g>
  );
}

function Star({ cy = 44, r = 18 }: { cy?: number; r?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${30 + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
  }).join(' ');
  return <polygon points={pts} fill={C.purple} />;
}

function text(ch: string, y: number, size: number, fill: string, family = CJK, weight = 700): ReactNode {
  return (
    <text x={30} y={y} fontSize={size} fill={fill} fontFamily={family} fontWeight={weight} textAnchor="middle">
      {ch}
    </text>
  );
}
const LATIN = 'Georgia, "Times New Roman", serif';

function Soap() {
  return (
    <g fill="none" stroke={C.blue}>
      <rect x={12} y={20} width={36} height={52} rx={3} strokeWidth={3} />
      <rect x={18} y={26} width={24} height={40} rx={1.5} strokeWidth={1.5} strokeDasharray="4 2.5" />
    </g>
  );
}

/** Full art with a small corner index, as on American sets. */
function fullFace(t: Tile): { index: string; color: string; art: ReactNode } {
  if (t < 27) {
    const n = rankOf(t);
    const suit = suitOf(t);
    if (suit === 0) {
      if (n === 1) return { index: '1', color: C.green, art: <Bird /> };
      const { rows, red } = BAM_ROWS[n];
      const h = rows.length === 2 ? 24 : 16;
      const ys = rows.length === 2 ? [33, 61] : [27, 46, 65];
      return {
        index: String(n),
        color: C.green,
        art: rows.flatMap((count, r) =>
          COLS[count].map((x, c) => (
            <Stick key={`${r}-${c}`} x={x} y={ys[r]} h={h} color={red.some(([rr, cc]) => rr === r && cc === c) ? C.red : C.green} />
          )),
        ),
      };
    }
    if (suit === 1)
      return {
        index: String(n),
        color: C.red,
        art: (
          <>
            {text(NUMERALS[n - 1], 42, 24, C.ink)}
            {text('萬', 71, 27, C.red)}
          </>
        ),
      };
    return { index: String(n), color: C.blue, art: DOT_LAYOUT[n - 1].map(([x, y, r, col], i) => <Dot key={i} x={x} y={y} r={r} color={col} />) };
  }
  if (t < GREEN) return { index: WIND_LETTERS[t - 27], color: C.ink, art: text(WIND_CHARS[t - 27], 62, 40, C.ink) };
  if (t === GREEN) return { index: 'G', color: C.green, art: text('發', 62, 40, C.green) };
  if (t === RED) return { index: 'R', color: C.red, art: text('中', 62, 40, C.red) };
  if (t === SOAP) return { index: '', color: C.blue, art: <Soap /> };
  if (t === FLOWER) return { index: 'F', color: C.pink, art: <FlowerArt cy={40} /> };
  return {
    index: 'J',
    color: C.purple,
    art: (
      <>
        <Star cy={40} r={17} />
        {text('JOKER', 73, 11, C.purple, 'system-ui, sans-serif', 800)}
      </>
    ),
  };
}

/** Simplified face for very small tiles: a large number or letter over a suit mark. */
function compactFace(t: Tile): ReactNode {
  if (t < 27) {
    const n = String(rankOf(t));
    const suit = suitOf(t);
    const color = [C.green, C.red, C.blue][suit];
    return (
      <>
        {text(n, 42, 44, color, LATIN)}
        {suit === 0 && <Stick x={30} y={61} h={24} color={C.green} />}
        {suit === 1 && text('萬', 75, 28, C.red)}
        {suit === 2 && <Dot x={30} y={61} r={11} color={C.blue} />}
      </>
    );
  }
  if (t < GREEN) return text(WIND_LETTERS[t - 27], 58, 52, C.ink, LATIN);
  if (t === GREEN) return text('發', 60, 50, C.green);
  if (t === RED) return text('中', 60, 50, C.red);
  if (t === SOAP)
    return (
      <g transform="translate(-9 -11.5) scale(1.3)">
        <Soap />
      </g>
    );
  if (t === FLOWER) return <FlowerArt cy={36} s={1.45} />;
  return <Star cy={40} r={27} />;
}

interface Props {
  t: Tile;
  size?: 'lg' | 'md' | 'sm' | 'xs';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function TileView({ t, size = 'md', className = '', onClick, disabled }: Props) {
  const cls = `tile ${size} ${className}`;
  let inner: ReactNode;
  if (size === 'xs') inner = compactFace(t);
  else {
    const f = fullFace(t);
    inner = (
      <>
        <text x={4} y={14} fontSize={14} fontWeight={700} fontFamily={LATIN} fill={f.color}>
          {f.index}
        </text>
        {f.art}
      </>
    );
  }
  const svg = (
    <svg viewBox="0 0 60 80" aria-hidden="true">
      {inner}
    </svg>
  );
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={tileName(t)}>
        {svg}
      </button>
    );
  return (
    <span className={cls} role="img" aria-label={tileName(t)}>
      {svg}
    </span>
  );
}

/** Face-down tiles, shown as a count. */
export function Backs({ n }: { n: number }) {
  return (
    <span className="backs" aria-label={`${n} tiles`}>
      <span className="tile xs back" />
      <span className="backs-n">×{n}</span>
    </span>
  );
}
