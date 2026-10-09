import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { platform, arch } from 'node:os'
import { createHash } from 'node:crypto'

const seed = 0x1f5f2026
const trials = 8
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Vite did not provide a local port.')
  const origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`${origin}/crypto-lab-lfsr-forge/`)
  const observation = await page.evaluate(async ({ origin, seed, trials }) => {
    const { geffeBits } = await import(`${origin}/crypto-lab-lfsr-forge/src/geffe/geffe.ts`)
    const { correlationAttack, packedToState, DEFAULT_BUDGET } = await import(`${origin}/crypto-lab-lfsr-forge/src/geffe/correlation.ts`)
    let state = seed >>> 0
    const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0 }
    const outcomes = []
    for (let trial = 0; trial < trials; trial++) {
      const packed = { r1: 1 + next() % 127, r2: 1 + next() % 2047, r3: 1 + next() % 8191 }
      const states = { r1: packedToState(packed.r1, 7), r2: packedToState(packed.r2, 11), r3: packedToState(packed.r3, 13) }
      const capture = geffeBits(states, 300)
      const result = await correlationAttack(capture, DEFAULT_BUDGET)
      const candidate = result.survivors.length === 1 ? result.survivors[0] : null
      const exact = !!candidate && Object.keys(packed).every(key => candidate[key] === packed[key])
      const future = geffeBits(states, 364).slice(300)
      const predictionMatched = !!result.prediction && result.prediction.every((bit, index) => bit === future[index])
      outcomes.push({ trial: trial + 1, packed, survivors: result.survivors.length, exact, predictionMatched, exhausted: result.exhausted, r1TiesRetained: result.leadingR1.length, r3TiesRetained: result.leadingR3.length, metrics: result.metrics })
    }
    return { userAgent: navigator.userAgent, budget: DEFAULT_BUDGET, captureBits: 300, outcomes }
  }, { origin, seed, trials })
  const results = {
    runDate: new Date().toISOString(),
    seed: `0x${seed.toString(16)}`,
    sourceSha256: createHash('sha256').update(Buffer.concat(await Promise.all(['src/lfsr/lfsr.ts', 'src/lfsr/bm.ts', 'src/geffe/geffe.ts', 'src/geffe/correlation.ts'].map(file => readFile(file))))).digest('hex'),
    trialCount: trials,
    environment: { platform: platform(), arch: arch(), browser: `Chromium ${browser.version()}`, userAgent: observation.userAgent },
    budget: observation.budget,
    captureBits: observation.captureBits,
    summary: {
      exactRecoveries: observation.outcomes.filter(row => row.exact).length,
      failedOrAmbiguous: observation.outcomes.filter(row => !row.exact).length,
      frozenPredictionsMatched: observation.outcomes.filter(row => row.predictionMatched).length,
      exhausted: observation.outcomes.filter(row => row.exhausted).length,
    },
    outcomes: observation.outcomes,
  }
  await mkdir('docs', { recursive: true })
  await writeFile('docs/benchmark-results.json', `${JSON.stringify(results, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(results.summary)}\n`)
} finally {
  await browser?.close()
  await server.close()
}
