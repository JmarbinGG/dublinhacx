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
    // Banyan illustration (decorative, flat): three canopy greens back to
    // front, the ground patch, and a warm taupe trunk.
    'tree-deep': [0.43, 0.075, 152],
    'tree-mid': [0.55, 0.095, 146],
    'tree-light': [0.68, 0.1, 140],
    'tree-ground': [0.86, 0.06, 135],
    'tree-trunk': [0.52, 0.035, 60],
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
    'tree-deep': [0.33, 0.06, 152],
    'tree-mid': [0.43, 0.08, 148],
    'tree-light': [0.55, 0.09, 144],
    'tree-ground': [0.29, 0.045, 140],
    'tree-trunk': [0.55, 0.03, 60],
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
 * Stylized banyan in a 400 x 300 box: a wide lumpy dome canopy (~75% of
 * the height), a twisted multi-strand trunk (~12% of the width) flaring
 * into buttress roots, limbs curving up into the canopy, many thin aerial
 * roots, and a grassy ground patch.
 *
 * Timing: ONE clock. Everything is scheduled in "growth units" at a
 * constant speed (a stroke's duration is proportional to its length; a
 * child starts where its parent reaches it), then the whole timeline is
 * passed through a single ease-out, so per-element animations run linear
 * and the tree grows in one continuous motion over TOTAL ms.
 */
function banyan(seed = 11) {
  const rand = rng(seed)
  const TOTAL = 4000
  const W = 400
  const GY = 284 // ground line
  const CX = 200
  const r0 = (n) => Math.round(n)

  // Global ease-out: clock progress P = 1 - (1 - t)^2. An element scheduled
  // at linear progress p starts at real time t = 1 - sqrt(1 - p).
  const at = (p) => r0(TOTAL * (1 - Math.sqrt(1 - Math.min(1, Math.max(0, p)))))
  // Spans are recorded in raw growth units first; at the end they're
  // normalised so the last element finishes exactly at p = 1.
  const spans = []
  const span = (p0, p1) => {
    const s = [p0, p1]
    spans.push(s)
    return s
  }
  const SPEED = 1 / 900 // growth units per px of length (constant speed)

  // Ground patch: ~85% of canopy width, spreads from its centre first.
  const ground = { e: [CX, GY, 170, 11], a: span(0, 0.07) }
  let grass = ''
  for (let i = 0; i < 9; i++) {
    const x = r0(CX - 150 + rand() * 300)
    grass += `M${x} ${GY - 2}l${r0(rand() * 4 - 2)} -${r0(4 + rand() * 4)}`
  }
  ground.g = grass

  // Trunk: six strands rising together; they cross (twist) and narrow in
  // the middle, flare at the base. Total width ~48 px = 12%.
  const TOP = 196
  const strands = []
  let trunkEnd = 0
  for (let i = 0; i < 6; i++) {
    const k = i - 2.5
    const bx = CX + k * 10 // base, flared
    const mx = CX - k * 3.5 // middle, crossed and narrow
    const tx = CX + k * 7 // top, spreading into the limbs
    const d = `M${r0(bx)} ${GY}C${r0(bx + k)} ${GY - 22} ${r0(mx)} ${GY - 40} ${r0(mx)} ${GY - 50}S${r0(tx - k * 2)} ${TOP + 18} ${r0(tx)} ${TOP}`
    const len = GY - TOP + 12
    const p0 = 0.04
    const p1 = p0 + len * SPEED
    trunkEnd = Math.max(trunkEnd, p1)
    strands.push([d, 8, span(p0, p1)])
  }

  // Buttress roots fan out along the ground as the trunk finishes.
  let buttress = ''
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1
    const j = i % 4
    const x0 = CX + side * (8 + j * 5)
    const x1 = CX + side * (34 + j * 14 + rand() * 8)
    buttress += `M${r0(x0)} ${GY - 14 + j * 3}Q${r0((x0 + x1) / 2)} ${GY - 2} ${r0(x1)} ${GY + 2}`
  }
  const buttressA = span(trunkEnd - 0.06, trunkEnd + 0.06)

  // Limbs: from the upper-middle trunk, up and out under the canopy.
  // Each starts where the growing trunk reaches its attach height.
  const limbs = []
  const tips = []
  const limbDefs = [[-1, 128, 96], [-1, 82, 74], [1, 82, 74], [1, 128, 96], [0.15, 26, 64]]
  limbDefs.forEach(([side, reach, rise], i) => {
    const ay = GY - 58 - (i % 2) * 10 // attach height
    const ax = CX + side * 6
    const ex = CX + side * reach
    const ey = ay - rise
    const d = `M${r0(ax)} ${r0(ay)}Q${r0(CX + side * reach * 0.35)} ${r0(ay - rise * 0.15)} ${r0(ex)} ${r0(ey)}`
    const len = Math.hypot(ex - ax, ey - ay) * 1.1
    const p0 = 0.04 + ((GY - ay) / (GY - TOP + 12)) * (trunkEnd - 0.04)
    const p1 = p0 + len * SPEED
    limbs.push([d, 7, span(p0, p1)])
    tips.push([ex, ey, p1])
  })

  // Canopy: ~140 overlapping circles inside a half-ellipse dome with a
  // wobbled outline. Bigger blobs in the middle, smaller at the edge.
  // Three tones, drawn back (deep) to front (light).
  const DOME = { cx: CX, cy: 206, rx: 196, ry: 196 }
  const wobble = (th) => 1 + 0.035 * Math.sin(5 * th + 1.3) + 0.025 * Math.sin(11 * th + 0.4)
  const blobs = []
  let guard = 0
  while (blobs.length < 145 && guard++ < 30000) {
    const x = 6 + rand() * (W - 12)
    const y = 8 + rand() * 205
    const dx = (x - DOME.cx) / DOME.rx
    const dy = (y - DOME.cy) / DOME.ry
    const th = Math.atan2(-dy, dx)
    const rn = Math.hypot(dx, dy) // 0 centre .. 1 edge
    const r = 10 + (1 - rn) * 14 + rand() * 4
    // Inside the wobbled dome, fully (centre + radius).
    if (rn + r / DOME.rx > wobble(th)) continue
    // Arched underside: higher in the middle so the trunk and limbs show
    // beneath the canopy, lower toward the sides where roots hang.
    const underside = 214 - 52 * Math.max(0, 1 - Math.abs(dx) * 1.6)
    if (y + r * 0.6 > underside) continue
    // Even packing: skip a blob whose centre sits deep inside another.
    if (blobs.some((b) => Math.hypot(b.x - x, b.y - y) < Math.min(b.r, r) * 0.55)) continue
    // Tone: deep at the back/top, light toward the front and lower middle.
    const z = rand() + (y / 210) * 0.5 - rn * 0.3
    const tone = z < 0.45 ? 0 : z < 0.85 ? 1 : 2
    blobs.push({ x, y, r, tone, th: Math.max(0, Math.min(Math.PI, th)) })
  }

  // 12 regions (angular sectors seen from the dome centre). Each region
  // blooms as the limb under it finishes, the middle first.
  const REGIONS = 12
  const canopy = Array.from({ length: REGIONS }, () => [])
  for (const b of blobs) canopy[Math.min(REGIONS - 1, Math.floor((b.th / Math.PI) * REGIONS))].push(b)
  const groups = canopy
    .map((list, i) => {
      if (!list.length) return null
      const th = ((i + 0.5) / REGIONS) * Math.PI
      const gx = DOME.cx + Math.cos(th) * DOME.rx * 0.7
      const gy = DOME.cy - Math.sin(th) * DOME.ry * 0.7
      // Nearest limb tip supports this region.
      const tip = tips.reduce((best, t) => (Math.hypot(t[0] - gx, t[1] - gy) < Math.hypot(best[0] - gx, best[1] - gy) ? t : best))
      const p0 = tip[2] - 0.06 + Math.abs(th - Math.PI / 2) * 0.03
      const c = []
      for (const b of list.sort((m, n) => m.tone - n.tone)) c.push(b.tone, r0(b.x), r0(b.y), r0(b.r))
      return { a: span(p0, p0 + 0.14), c, p0 }
    })
    .filter(Boolean)

  // Aerial roots: ~40 thin lines from the canopy underside, mostly on the
  // left and right; some reach the ground, some hang free. Sway decays
  // toward the bottom (gravity). Grouped into 8 bundles by x, each bundle
  // starting just after the canopy region above it appears.
  const BUNDLES = 8
  const bundles = Array.from({ length: BUNDLES }, () => '')
  const bundleStart = Array(BUNDLES).fill(1)
  for (let i = 0; i < 42; i++) {
    const side = rand() < 0.5 ? -1 : 1
    const off = rand() < 0.8 ? 40 + rand() * 140 : 26 + rand() * 20
    const x = CX + side * off
    const y = 196 + rand() * 12 + Math.pow(off / 180, 3) * 10
    const reach = rand() < 0.45 ? GY - 6 - y : (GY - y) * (0.35 + rand() * 0.45)
    const sway = (rand() - 0.5) * 6
    const d = `M${r0(x)} ${r0(y)}C${r0(x + sway)} ${r0(y + reach * 0.35)} ${r0(x - sway * 0.5)} ${r0(y + reach * 0.75)} ${r0(x + sway * 0.2)} ${r0(y + reach)}`
    const bi = Math.min(BUNDLES - 1, Math.floor((x / W) * BUNDLES))
    bundles[bi] += d
    const th = Math.acos(Math.max(-1, Math.min(1, (x - DOME.cx) / DOME.rx)))
    const g = groups[Math.min(groups.length - 1, Math.floor((th / Math.PI) * groups.length))]
    bundleStart[bi] = Math.min(bundleStart[bi], g.p0 + 0.05 + rand() * 0.08)
  }
  const roots = bundles
    .map((d, i) => (d ? { d, a: span(bundleStart[i], Math.min(1, bundleStart[i] + 0.22)) } : null))
    .filter(Boolean)

  const maxP = Math.max(...spans.map((sp) => sp[1]))
  for (const sp of spans) {
    const [p0, p1] = [sp[0] / maxP, sp[1] / maxP]
    sp[0] = at(p0)
    sp[1] = Math.max(60, at(p1) - at(p0))
  }

  return {
    vb: [0, 0, W, 300],
    T: TOTAL,
    ground,
    strands: strands.map(([d, w, sp]) => [d, w, sp[0], sp[1]]),
    buttress: { d: buttress, a: buttressA },
    limbs: limbs.map(([d, w, sp]) => [d, w, sp[0], sp[1]]),
    canopy: groups.map(({ a, c }) => ({ a, c })),
    roots,
  }
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
    `// Times are [start ms, duration ms] on one shared clock (global ease-out baked in).\n` +
    `// canopy[].c = flat [tone, cx, cy, r, ...] (tone 0 deep, 1 mid, 2 light).\n` +
    `type Span = [number, number]\n` +
    `export const TREE = ${JSON.stringify(tree)} as {\n` +
    `  vb: [number, number, number, number]; T: number\n` +
    `  ground: { e: number[]; g: string; a: Span }\n` +
    `  strands: [string, number, number, number][]; limbs: [string, number, number, number][]\n` +
    `  buttress: { d: string; a: Span }; canopy: { a: Span; c: number[] }[]; roots: { d: string; a: Span }[]\n` +
    `}\n`,
)

console.log(`design: ${Object.keys(hex.light).length} tokens x 2 modes, ${CHECKS.length * 2} contrast checks passed, banyan: ${tree.canopy.reduce((n, g) => n + g.c.length / 4, 0)} canopy blobs in ${tree.canopy.length} groups, ${tree.roots.length} root bundles, ${Object.keys(morphs).length} icon morphs`)
