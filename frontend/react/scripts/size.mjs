#!/usr/bin/env node
/**
 * First-load budget check on the production build (`npm run build` first).
 * Counts what a cold visit downloads before the app is usable: index.html
 * plus every script, modulepreload and stylesheet it references, gzipped.
 * Lazy route / assistant chunks are listed but not counted.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 100
const STRETCH_KB = 50
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length / 1024

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initial = new Set(['index.html'])
for (const [, ref] of html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)) initial.add(ref)

let total = 0
console.log('First load (gzip):')
for (const file of initial) {
  const kb = gz(file)
  total += kb
  console.log(`  ${kb.toFixed(1).padStart(6)} KB  ${file}`)
}

const lazy = readdirSync(join(dist, 'assets')).filter((f) => !initial.has(`assets/${f}`) && /\.(js|css)$/.test(f))
console.log('\nLoaded on demand (gzip):')
for (const f of lazy) console.log(`  ${gz(`assets/${f}`).toFixed(1).padStart(6)} KB  assets/${f}`)

console.log(`\nTotal first load: ${total.toFixed(1)} KB (budget ${BUDGET_KB} KB, stretch ${STRETCH_KB} KB)`)
if (total > BUDGET_KB) {
  console.error('Over budget.')
  process.exit(1)
}
console.log(total <= STRETCH_KB ? 'Within stretch goal.' : 'Within budget.')
