#!/usr/bin/env node
/**
 * Build-time design generation (runs before `vite` / `vite build`).
 * No runtime cost: everything here is computed once and written to
 * src/generated/ as static CSS / TS.
 *
 *  1. Palette: authored in OKLCH, compiled to hex (works on every browser),
 *     and every text/background pair is checked against WCAG - the build
 *     fails if a pair drops below its required ratio.
 *  2. Easing: a damped spring (closed-form oscillator) sampled into a CSS
 *     linear() curve, so no JS spring library is needed.
 *  3. Art: the "aerial roots" background, a parametric curve family baked
 *     into one small static SVG path.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src', 'generated')
mkdirSync(outDir, { recursive: true })

// ---------- 1. palette ----------

// [L, C, h] - warm neutrals, one banyan-leaf green accent.
const PALETTE = {
  light: {
    bg: [0.985, 0.004, 91.4],
    surface: [1, 0, 0],
    sunken: [0.962, 0.006, 91.4],
    text: [0.252, 0.013, 160.3],
    muted: [0.499, 0.016, 155.2],
    line: [0.909, 0.01, 93.6], // decorative hairline
    'line-strong': [0.63, 0.012, 150], // form controls: needs 3:1
    accent: [0.472, 0.091, 160.6],
    'accent-hover': [0.41, 0.085, 160.6],
    'accent-soft': [0.955, 0.025, 160.6],
    'on-accent': [1, 0, 0],
    warn: [0.555, 0.146, 49],
    'warn-soft': [0.97, 0.03, 80],
    danger: [0.501, 0.178, 28.7],
    'danger-soft': [0.965, 0.02, 25],
  },
  dark: {
    bg: [0.195, 0.009, 153.1],
    surface: [0.236, 0.012, 156.2],
    sunken: [0.17, 0.008, 153],
    text: [0.939, 0.007, 145.5],
    muted: [0.738, 0.015, 155.5],
    line: [0.311, 0.015, 153],
    'line-strong': [0.56, 0.015, 153],
    accent: [0.733, 0.116, 159.8],
    'accent-hover': [0.79, 0.11, 159.8],
    'accent-soft': [0.29, 0.04, 159.8],
    'on-accent': [0.195, 0.009, 153.1], // white on this green is only 2.3:1
    warn: [0.8, 0.14, 75],
    'warn-soft': [0.28, 0.04, 75],
    danger: [0.834, 0.068, 22],
    'danger-soft': [0.28, 0.04, 22],
  },
}

// [foreground, background, minimum ratio]. Body text targets AAA (7:1).
const CHECKS = [
  ['text', 'bg', 7],
  ['text', 'surface', 7],
  ['muted', 'bg', 4.5],
  ['muted', 'surface', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['on-accent', 'accent', 4.5],
  ['warn', 'warn-soft', 4.5],
  ['warn', 'bg', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['danger', 'surface', 4.5],
  ['accent', 'accent-soft', 4.5],
  ['line-strong', 'surface', 3],
]

function oklchToHex([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return (
    '#' +
    lin
      .map((c) => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const hex = {}
const failures = []
for (const [mode, tokens] of Object.entries(PALETTE)) {
  hex[mode] = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, oklchToHex(v)]))
  for (const [fg, bg, min] of CHECKS) {
    const ratio = contrast(hex[mode][fg], hex[mode][bg])
    if (ratio < min) failures.push(`${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)} (needs ${min})`)
  }
}
if (failures.length) {
  console.error('Palette contrast check failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}

const block = (tokens) =>
  Object.entries(tokens)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')

// ---------- 2. spring easing ----------

// Underdamped oscillator x(t) = 1 - e^(-ζωt)(cos ωd t + (ζω/ωd) sin ωd t),
// ζ = 0.8 gives a ~1.5% overshoot - lively but calm. Sampled to linear().
function springLinear(zeta = 0.8, omega = 14, samples = 18, settle = 0.55) {
  const wd = omega * Math.sqrt(1 - zeta * zeta)
  const pts = []
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * settle
    const x = 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t))
    pts.push(i === samples ? '1' : String(Math.round(x * 1000) / 1000))
  }
  return `linear(${pts.join(', ')})`
}

// ---------- 3. the banyan tree (landing page) ----------

// Seeded PRNG (mulberry32): the same seed always builds the same tree.
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 2D rotation: [x', y'] = [[cos -sin], [sin cos]] . [x, y]
const rotate = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const r1 = (n) => Math.round(n * 10) / 10

/**
 * Recursive banyan: wide, low limbs that keep splitting; leaf clusters on
 * the tips; aerial roots dropping from the wide limbs to the ground.
 * Every path gets a start time (ms) and duration baked in, so the browser
 * just plays them: trunk 0-1.2 s, limbs 1.2-3 s by depth, leaves 3-4.2 s
 * by distance from the trunk, roots 4.2-6 s.
 *
 * Output rows: [kind, d, width, start, duration]
 *   kind 0 = wood (stroke), 1 = leaf cluster (circle "cx cy r"),
 *   2 = aerial root (stroke; thickens into a pillar via a transform once
 *       it reaches the ground)
 */
function banyan(seed = 7) {
  const rand = rng(seed)
  const GROUND = 240
  const out = []
  const limbs = [] // [x0, y0, cx, cy, x1, y1, depth] for root drops
  const tips = []

  // Trunk: three stacked segments, each thinner - the taper.
  const base = [200, GROUND]
  const top = [200, 150]
  const seg = [[GROUND, 205, 12], [205, 175, 9.5], [175, 150, 7.5]]
  seg.forEach(([y0, y1, w], i) => out.push([0, `M200 ${y0}Q${r1(199 + rand() * 2)} ${r1((y0 + y1) / 2)} 200 ${y1}`, w, i * 400, 400]))

  // Branch: direction vector `dir`, rotated per child, length shrinks by
  // a factor each level; width shrinks with depth.
  function branch(from, dir, len, width, depth, order) {
    const to = [from[0] + dir[0] * len, from[1] + dir[1] * len]
    // Quadratic control point: halfway along, pushed sideways a little
    // (the perpendicular [-dy, dx]) for an organic bend.
    const bend = (rand() - 0.5) * len * 0.35
    const c = [from[0] + (dir[0] * len) / 2 - dir[1] * bend, from[1] + (dir[1] * len) / 2 + dir[0] * bend - len * 0.06]
    const start = 1200 + (depth - 1) * 600 + order * 20
    out.push([0, `M${r1(from[0])} ${r1(from[1])}Q${r1(c[0])} ${r1(c[1])} ${r1(to[0])} ${r1(to[1])}`, r1(width), start, 600])
    if (depth <= 2) limbs.push([...from, ...c, ...to, depth])
    if (depth === 3) {
      tips.push(to)
      return
    }
    const kids = 2
    for (let k = 0; k < kids; k++) {
      // Banyans spread wide: children fan sideways and slightly up.
      const spread = (k - (kids - 1) / 2) * (0.55 + rand() * 0.35)
      let d = rotate(dir, spread + (rand() - 0.5) * 0.25)
      // Pull deep branches toward horizontal (a broad, flat canopy).
      if (depth >= 2) d = [d[0], d[1] * 0.75 - 0.05]
      const n = Math.hypot(d[0], d[1])
      branch(to, [d[0] / n, d[1] / n], len * (0.72 + rand() * 0.12), width * 0.62, depth + 1, order * 2 + k)
    }
  }

  // Four main limbs: two low and wide, two higher.
  const mains = [[-1.32, 82], [-0.62, 66], [0.62, 66], [1.32, 82]]
  mains.forEach(([angle, len], i) => branch(top, rotate([0, -1], angle), len, 6, 1, i))

  // Leaf clusters on every tip; delay grows with distance from the trunk.
  const maxD = Math.max(...tips.map(([x, y]) => Math.hypot(x - 200, y - 150)))
  for (const [x, y] of tips) {
    const dist = Math.hypot(x - 200, y - 150)
    out.push([1, `${r1(x)} ${r1(y)} ${r1(18 + rand() * 9)}`, 0, Math.round(3000 + (dist / maxD) * 900), 300])
  }

  // Aerial roots: from points along the wide limbs, falling to the ground.
  // A small sway decays toward the ground and a gravity pull bends the
  // curve's control points downward - the same idea as the old roots strip.
  const drops = limbs
    .filter(([x0, , , , x1, , depth]) => depth === 2 || Math.abs(x1 - x0) > 40)
    .map(([x0, y0, cx, cy, x1, y1]) => {
      const t = 0.55 + rand() * 0.35 // point on the quadratic B(t)
      const u = 1 - t
      return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]
    })
    .filter(([x]) => Math.abs(x - 200) > 30)
    .sort((a, b) => Math.abs(a[0] - 200) - Math.abs(b[0] - 200))
    .slice(0, 8)
  drops.forEach(([x, y], i) => {
    const fall = GROUND - y
    const sway = (rand() - 0.5) * 10
    const d = `M${r1(x)} ${r1(y)}C${r1(x + sway)} ${r1(y + fall * 0.35)} ${r1(x - sway * 0.5)} ${r1(y + fall * 0.75)} ${r1(x + sway * 0.2)} ${GROUND}`
    out.push([2, d, 1.3, 4200 + i * 90, 900])
  })

  // Ground line.
  out.push([0, `M60 ${GROUND}H340`, 1, 0, 600])

  // Tight viewBox from every coordinate (+ leaf radii), so the reserved
  // aspect-ratio box holds the whole tree and nothing spills onto text.
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [kind, d] of out) {
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number)
    const pad = kind === 1 ? nums[2] : 6
    const pts = kind === 1 ? [[nums[0], nums[1]]] : nums.reduce((acc, n, i) => (i % 2 ? acc[acc.length - 1].push(n) : acc.push([n]), acc), [])
    for (const [x, y] of pts) {
      if (y === undefined) continue
      minX = Math.min(minX, x - pad)
      maxX = Math.max(maxX, x + pad)
      minY = Math.min(minY, y - pad)
      maxY = Math.max(maxY, y + pad)
    }
  }
  const vb = [Math.floor(minX), Math.floor(minY), Math.ceil(maxX - minX), Math.ceil(maxY - minY)]
  return { vb, rows: out }
}

// ---------- 4. icon morphs ----------

// Each icon is a list of strokes (polylines in a 24x24 box). Both shapes in
// a pair get the same stroke count, and every stroke is resampled to the
// same number of points by arc length, so the browser only has to lerp two
// equal-length coordinate vectors: p(t) = a + (b - a) * t.
const circle = (cx, cy, r, n = 24, from = 0, to = Math.PI * 2) =>
  Array.from({ length: n }, (_, i) => {
    const t = from + ((to - from) * i) / (n - 1)
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)]
  })
const line = (x1, y1, x2, y2) => [[x1, y1], [x2, y2]]
const dot = (x, y) => [[x, y], [x, y]]

function resample(points, n) {
  const seg = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    seg.push(d)
    total += d
  }
  if (total === 0) return Array.from({ length: n }, () => points[0])
  const out = []
  for (let k = 0; k < n; k++) {
    let target = (total * k) / (n - 1)
    let i = 0
    while (i < seg.length - 1 && target > seg[i]) target -= seg[i++]
    const t = seg[i] ? Math.min(1, target / seg[i]) : 0
    const [a, b] = [points[i], points[i + 1]]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

// Crescent moon: outer arc of a circle, back along an inner offset arc.
const moon = [...circle(12, 12, 8, 16, -2.2, 2.2), ...circle(16.5, 9.5, 6.5, 16, 1.75, -1.4)]

const MORPHS = {
  // search -> cancel (while a request runs)
  searchCancel: [
    [circle(11, 11, 7), line(6, 6, 18, 18)],
    [line(16, 16, 20, 20), line(18, 6, 6, 18)],
  ],
  // menu -> close
  menuClose: [
    [line(4, 7, 20, 7), line(6, 6, 18, 18)],
    [line(4, 12, 20, 12), dot(12, 12)],
    [line(4, 17, 20, 17), line(6, 18, 18, 6)],
  ],
  // chevron down -> up
  chevron: [[[[6, 9], [12, 15], [18, 9]], [[6, 15], [12, 9], [18, 15]]]],
  // sun -> moon (rays shrink into the crescent)
  theme: [
    [circle(12, 12, 4.5), moon],
    [line(12, 2, 12, 4), dot(12, 4)],
    [line(12, 20, 12, 22), dot(12, 20)],
    [line(2, 12, 4, 12), dot(4, 12)],
    [line(20, 12, 22, 12), dot(19, 12)],
  ],
}

function buildMorphs() {
  const out = {}
  for (const [name, strokes] of Object.entries(MORPHS)) {
    const counts = []
    const a = []
    const b = []
    for (const [from, to] of strokes) {
      const n = Math.max(from.length, to.length, 2)
      counts.push(n)
      for (const [x, y] of resample(from, n)) a.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10)
      for (const [x, y] of resample(to, n)) b.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10)
    }
    out[name] = { counts, a, b }
  }
  return out
}

// ---------- write ----------

const spring = springLinear()
const css = `/* GENERATED by scripts/design.mjs - edit the script, not this file. */
:root {
${block(hex.light)}
  color-scheme: light;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-spring: var(--ease-out);
}
@supports (transition-timing-function: linear(0, 1)) {
  :root {
    --ease-spring: ${spring};
  }
}
:root[data-theme='dark'] {
${block(hex.dark)}
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${block(hex.dark).replace(/^/gm, '  ')}
    color-scheme: dark;
  }
}
`
writeFileSync(join(outDir, 'tokens.css'), css)

const tree = banyan()
const morphs = buildMorphs()
writeFileSync(
  join(outDir, 'morphs.ts'),
  `// GENERATED by scripts/design.mjs - matched point arrays for icon morphs.\n` +
    `export type Morph = { counts: number[]; a: number[]; b: number[] }\n` +
    `export const MORPHS = ${JSON.stringify(morphs)} as const satisfies Record<string, Morph>\n`,
)
writeFileSync(
  join(outDir, 'art.ts'),
  `// GENERATED by scripts/design.mjs - the landing page banyan, baked.\n` +
    `// rows: [kind 0 wood | 1 leaf "cx cy r" | 2 root | 3 pillar, d, width, start ms, duration ms]\n` +
    `export const TREE = ${JSON.stringify(tree)} as { vb: [number, number, number, number]; rows: [number, string, number, number, number][] }\n`,
)

console.log(`design: ${Object.keys(hex.light).length} tokens x 2 modes, ${CHECKS.length * 2} contrast checks passed, banyan ${tree.rows.length} paths, ${Object.keys(morphs).length} icon morphs`)
