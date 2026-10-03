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

// ---------- 3. aerial roots art ----------

// Each root hangs from the canopy line: x(y) = x0 + A·(y/H)·sin(f·y + φ).
// Amplitude grows with length, like real aerial roots swaying.
function rootsPath(width = 400, height = 120) {
  const roots = [
    [24, 70, 4, 0.09, 0.2], [58, 110, 6, 0.07, 1.4], [97, 88, 5, 0.1, 2.1],
    [140, 116, 7, 0.06, 0.6], [186, 76, 4, 0.11, 2.9], [228, 104, 6, 0.08, 1.1],
    [271, 92, 5, 0.09, 0.3], [312, 118, 7, 0.065, 2.4], [352, 80, 4, 0.1, 1.7], [384, 100, 5, 0.08, 0.9],
  ]
  const d = roots.map(([x0, len, amp, f, phase]) => {
    const steps = 8
    const pts = []
    for (let i = 0; i <= steps; i++) {
      const y = (i / steps) * Math.min(len, height)
      const x = x0 + amp * (y / height) * Math.sin(f * y + phase)
      pts.push(`${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`)
    }
    return `M${pts[0]}L${pts.slice(1).join(' ')}`
  })
  // Canopy: one gentle quadratic arc across the top.
  return { d: `M0 2Q${width / 2} -6 ${width} 2${d.join('')}`, width, height }
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

const art = rootsPath()
writeFileSync(
  join(outDir, 'art.ts'),
  `// GENERATED by scripts/design.mjs - edit the script, not this file.\nexport const ROOTS = ${JSON.stringify(art)} as const\n`,
)

console.log(`design: ${Object.keys(hex.light).length} tokens x 2 modes, ${CHECKS.length * 2} contrast checks passed, roots path ${art.d.length} B`)
