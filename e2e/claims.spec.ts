import { expect, test } from '@playwright/test'
import { boot } from './gate'
import { createHash } from 'node:crypto'

test.afterEach(async ({ page }) => {
  const expected = process.env.MUTATION_ASSETS
  if (!expected) return
  const assets = JSON.parse(expected) as Record<string, string>
  for (const [path, digest] of Object.entries(assets)) {
    const response = await page.request.get(`./assets/${path}`)
    expect(createHash('sha256').update(await response.body()).digest('hex'), `MUTATION_ASSET_MISMATCH ${path}`).toBe(digest)
  }
})

test('the ambiguity and early BM outcomes are computed and explained', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Shared prefix' }).click()
  await expect(page.locator('#fixture-view')).toContainText('1001')
  await expect(page.locator('#fixture-view')).toContainText('next bits are 1 and 0')
  await page.getByRole('button', { name: 'Early failure' }).click()
  await expect(page.locator('#fixture-view')).toContainText('first fails at offset')
  await page.getByRole('button', { name: 'Early success' }).click()
  await expect(page.locator('#fixture-view')).toContainText('All 64 forecast bits match')
})

test('a sufficient single-register capture is frozen, checked, confirmed, and retired on new evidence', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Collect to 24 bits' }).click()
  await expect(page.locator('#hidden-view')).toContainText('Observed N = 24')
  await page.getByRole('button', { name: 'Freeze hidden forecast' }).click()
  await expect(page.locator('[data-verdict="PREFIX FITTED"]')).toBeVisible()
  await expect(page.locator('[data-claim="single-actual"]')).toContainText('Not revealed')
  const predicted = await page.locator('[data-claim="single-prediction"]').innerText()
  expect(predicted).toMatch(/^[01]{64}$/)
  await page.getByRole('button', { name: 'Reveal original next 64 bits' }).click()
  expect(await page.locator('[data-claim="single-actual"]').innerText()).toBe(predicted)
  expect(await page.locator('[data-claim="single-prediction"]').innerText()).toBe(predicted)
  await expect(page.locator('[data-verdict="NEXT 64 BITS PREDICTED"]')).toBeVisible()
  await page.getByRole('button', { name: 'Compare original parameters' }).click()
  await expect(page.locator('[data-verdict="LFSR PARAMETERS CONFIRMED"]')).toBeVisible()
  await page.getByRole('button', { name: 'Collect to 24 bits' }).click()
  await expect(page.locator('[data-verdict="LFSR PARAMETERS CONFIRMED"]')).toBeVisible()
  await page.getByRole('button', { name: 'Collect one bit' }).click()
  await expect(page.locator('[data-verdict="LFSR PARAMETERS CONFIRMED"]')).toHaveCount(0)
  await expect(page.locator('#single-view')).toContainText('Collect a hidden prefix')
})

test('user-entered sequence has analysis without a ground-truth verdict', async ({ page }) => {
  await boot(page)
  await page.getByLabel('Binary sequence').fill('001101110')
  await page.getByRole('button', { name: 'Analyze entered sequence' }).click()
  await expect(page.locator('#bm-view')).toContainText('User-entered sequence')
  await expect(page.locator('[data-claim="bm-length"]')).toHaveText('5')
  await expect(page.locator('[data-claim="manual-candidate"]')).toHaveText(/^[01]{32}$/)
  await expect(page.locator('[data-verdict="NEXT 64 BITS PREDICTED"]')).toHaveCount(0)
  await page.getByLabel('Binary sequence').fill('00110x')
  await page.getByRole('button', { name: 'Analyze entered sequence' }).click()
  await expect(page.locator('#manual-error')).toContainText('only 0 and 1')
  await page.getByLabel('Binary sequence').fill('')
  await page.getByRole('button', { name: 'Analyze entered sequence' }).click()
  await expect(page.locator('#bm-view')).toContainText('User-entered sequence · N = 0')
  await expect(page.locator('[data-claim="manual-candidate"]')).toHaveText('0'.repeat(32))
})

test('the negative-claim fixture passes construction checks while exposing recovered secret state', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Reproducible claim fixture' }).click()
  await expect(page.locator('[data-verdict="ONE TRIPLE WITHIN SEARCH BUDGET"]')).toBeVisible()
  await expect(page.locator('[data-claim="attack-n"]')).toHaveText('300')
  await expect(page.locator('#attack-view')).toContainText('R1 states scored 127')
  await expect(page.locator('#attack-view')).toContainText('R3 states scored 8191')
  const work = (await page.locator('#attack-view').innerText()).match(/bit comparisons (\d+)/i)
  expect(Number(work?.[1]), 'measured comparisons include both complete correlation scans').toBeGreaterThanOrEqual((127 + 8191) * 300)
  const frozen = await page.locator('[data-claim="geffe-prediction"]').innerText()
  expect(frozen).toMatch(/^[01]{64}$/)
  await page.getByRole('button', { name: 'Reveal original next 64 bits' }).click()
  expect(await page.locator('[data-claim="geffe-actual"]').innerText()).toBe(frozen)
  expect(await page.locator('[data-claim="geffe-prediction"]').innerText()).toBe(frozen)
  await expect(page.locator('[data-verdict="NEXT 64 BITS PREDICTED"]')).toBeVisible()
  await page.getByRole('button', { name: 'Compare original states' }).click()
  await expect(page.locator('[data-verdict="GEFFE STATES CONFIRMED"]')).toBeVisible()
  await page.getByRole('button', { name: 'Measure later complexity with 466 bits' }).click()
  await expect(page.locator('[data-claim="later-complexity"]')).toHaveText('233')
  await expect(page.locator('[data-verdict="CONSTRUCTION CHECKS PASSED"]')).toContainText('Truth-table rows 8/8')
  await expect(page.locator('[data-verdict="CONSTRUCTION CHECKS PASSED"]')).toContainText('127 / 2047 / 8191')
  await expect(page.locator('[data-claim="negative"]')).toContainText("This Geffe generator's nonlinearity and high linear complexity do not prevent recovery of its secret state.")
  await expect(page.locator('[data-claim="attack-n"]')).toHaveText('300')
  await expect(page.locator('#attack-view')).toContainText('Later inspection total 466 bits')
  await expect(page.locator('#attack-view .verdict.failure')).toHaveCount(0)
})

test('a cancelled scan cannot publish a stale verdict into a new session', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Reproducible claim fixture' }).click()
  await page.getByRole('button', { name: 'Cancel scan' }).click()
  await page.getByRole('button', { name: 'New hidden Geffe session' }).click()
  await expect(page.locator('#attack-view')).toContainText('Attack capture: 300')
  await expect(page.locator('[data-verdict="ONE TRIPLE WITHIN SEARCH BUDGET"]')).toHaveCount(0)
})

test('a retry counts revealed bits as observations and preserves the earlier work', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Reproducible claim fixture' }).click()
  await expect(page.locator('[data-verdict="ONE TRIPLE WITHIN SEARCH BUDGET"]')).toBeVisible()
  const originalWork = (await page.locator('#attack-view').innerText()).match(/bit comparisons (\d+)/i)?.[1]
  await page.getByRole('button', { name: 'Reveal original next 64 bits' }).click()
  await page.getByRole('button', { name: 'Run attack on current capture' }).click()
  await expect(page.locator('[data-verdict="ONE TRIPLE WITHIN SEARCH BUDGET"]')).toBeVisible()
  await expect(page.locator('[data-claim="attack-n"]')).toHaveText('364')
  await expect(page.locator('#attack-view')).toContainText('forecast indices 364')
  await page.getByText('Earlier frozen runs and measured work').click()
  await expect(page.locator('#attack-view table').last()).toContainText('300')
  await expect(page.locator('#attack-view table').last()).toContainText(originalWork!)
})

// Independent three-array transcription of the published specification, no src imports.
const TRI_KEY = '0053a6f94c9ff24598eb', TRI_IV = '0d74db42a91077de45ac'
function triReference(key: string, iv: string) {
  const unpack = (s: string) => s.match(/../g)!.reverse().flatMap(h => Number.parseInt(h, 16).toString(2).padStart(8, '0').split('').map(Number))
  const a = [...unpack(key), ...Array(13).fill(0)], b = [...unpack(iv), ...Array(4).fill(0)], c = [...Array(108).fill(0), 1, 1, 1]
  return { a, b, c, tick() {
    const t = [a[65] ^ a[92], b[68] ^ b[83], c[65] ^ c[110]], z = t.reduce((x, y) => x ^ y, 0)
    const feedback = [t[0] ^ (a[90] & a[91]) ^ b[77], t[1] ^ (b[81] & b[82]) ^ c[86], t[2] ^ (c[108] & c[109]) ^ a[68]]
    a.unshift(feedback[2]); a.pop(); b.unshift(feedback[0]); b.pop(); c.unshift(feedback[1]); c.pop()
    return { t, z, feedback }
  } }
}
function triBits(key: string, iv: string, n: number, rounds = 1152): number[] {
  const ref = triReference(key, iv)
  for (let i = 0; i < rounds; i++) ref.tick()
  return Array.from({ length: n }, () => ref.tick().z)
}
function bmReference(sequence: number[]) {
  let coefficients = [1], previous = [1], length = 0, distance = 1, last = 1
  const lengths: number[] = []
  for (let i = 0; i < sequence.length; i++) {
    let d = sequence[i]
    for (let j = 1; j <= length; j++) d ^= (coefficients[j] ?? 0) & sequence[i - j]
    if (!d) distance++
    else {
      const saved = [...coefficients]
      for (let j = 0; j < previous.length; j++) coefficients[j + distance] = (coefficients[j + distance] ?? 0) ^ (previous[j] & last)
      if (2 * length <= i) { length = i + 1 - length; previous = saved; last = d; distance = 1 } else distance++
    }
    lengths.push(length)
  }
  return { length, lengths, coefficients }
}
function predictReference(prefix: number[], coefficients: number[], length: number): string {
  const all = [...prefix]
  for (let i = 0; i < 64; i++) { let bit = 0; for (let j = 1; j <= length; j++) bit ^= (coefficients[j] ?? 0) & all[all.length - j]; all.push(bit) }
  return all.slice(prefix.length).join('')
}

test('Trivium KAT and stepper execute the independently derived state transition', async ({ page }) => {
  await boot(page)
  await expect(page.locator('#tri-kat')).toContainText('15/15')
  await expect(page.locator('#tri-kat [data-verdict="eSTREAM CHECKS PASSED"]')).toHaveClass(/good/)
  const ref = triReference(TRI_KEY, TRI_IV)
  await page.locator('#tri-step').click()
  const first = ref.tick()
  for (let j = 0; j < 3; j++) await expect(page.locator(`[data-tri="t${j + 1}"]`)).toHaveText(String(first.t[j]))
  await expect(page.locator('[data-tri="z"]')).toHaveText(String(first.z))
  await expect(page.locator('[data-tri="feedback"]')).toHaveText(first.feedback.join(' / '))
  for (const [name, array] of [['A', ref.a], ['B', ref.b], ['C', ref.c]] as const) await expect(page.locator(`[data-tri="register-${name}"]`)).toHaveText(array.join(''))
  expect(await page.locator('.tri-and').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')!.match(/s(\d+)/)![1]))).toEqual(['91', '92', '175', '176', '286', '287'])
  await page.locator('#tri-init').click()
  const warmed = triReference(TRI_KEY, TRI_IV); for (let i = 0; i < 1152; i++) warmed.tick()
  for (let i = 0; i < 12; i++) {
    const step = warmed.tick(); await page.locator('#tri-step').click()
    await expect(page.locator('[data-tri="z"]')).toHaveText(String(step.z))
    await expect(page.locator('[data-tri="feedback"]')).toHaveText(step.feedback.join(' / '))
  }
  await expect(page.locator('[data-tri="register-A"]')).toHaveText(warmed.a.join(''))
  await expect(page.locator('[data-tri="ticks"]')).toHaveText('12')
})

test('Trivium BM profiles and frozen forecasts are independently recomputed', async ({ page }) => {
  await boot(page)
  await page.locator('#tri-lfsr').click()
  await expect(page.locator('#tri-fit')).toContainText('Fresh disclosed LFSR')
  await page.getByRole('button', { name: 'Collect to 24 bits' }).click()
  await page.locator('#tri-lfsr').click()
  await expect(page.locator('#tri-fit')).toContainText("Panel 03's LFSR")
  const prefix = (await page.locator('[data-tri="lfsr-prefix"]').textContent())!.split('').map(Number), lfsr = bmReference(prefix)
  expect(lfsr.length).toBe(Number(await page.locator('[data-tri="lfsr-degree"]').textContent()))
  await expect(page.locator('[data-tri="lfsr-L"]')).toHaveText(String(lfsr.length))
  for (const n of [128, 256, 512, 1024]) {
    await page.locator('#tri-n').selectOption(String(n)); await page.locator('#tri-bm').click()
    const output = triBits(TRI_KEY, TRI_IV, n + 64), expected = bmReference(output.slice(0, n))
    await expect(page.locator('[data-tri="trivium-prefix"]')).toHaveText(output.slice(0, n).join(''))
    await expect(page.locator('[data-tri="trivium-L"]')).toHaveText(String(expected.length))
    const points = (await page.locator('[data-tri="trivium-profile"]').getAttribute('points'))!.split(' ').map(p => p.split(',').map(Number))
    expect(points.length).toBe(n)
    points.forEach(([x, y], i) => { expect(x).toBeCloseTo(35 + 545 * (i + 1) / n, 8); expect(y).toBeCloseTo(215 - 195 * expected.lengths[i] / n, 8) })
  }
  await page.locator('#tri-lfsr').click(); await page.locator('#tri-freeze').click()
  const frozen = await page.locator('[data-tri="trivium-prediction"]').innerText(), full = triBits(TRI_KEY, TRI_IV, 1088), fitted = bmReference(full.slice(0, 1024))
  expect(frozen).toBe(predictReference(full.slice(0, 1024), fitted.coefficients, fitted.length))
  await page.locator('#tri-reveal').click()
  await expect(page.locator('[data-tri="trivium-prediction"]')).toHaveText(frozen)
  await expect(page.locator('[data-tri="trivium-actual"]')).toHaveText(full.slice(1024).join(''))
  expect(full.slice(1024).join('')).not.toBe(frozen)
  await expect(page.locator('[data-tri="trivium-fit"] .verdict')).toHaveAttribute('data-verdict', 'HELD — FORECAST FAILED')
  await expect(page.locator('[data-tri="trivium-fit"] .verdict')).toHaveClass(/good/)
  expect(await page.locator('[data-tri="lfsr-prediction"]').innerText()).toBe(await page.locator('[data-tri="lfsr-actual"]').innerText())
  await expect(page.locator('[data-tri="lfsr-fit"] .verdict')).toHaveAttribute('data-verdict', 'FORECAST VERIFIED')
})

test('Trivium public-only worker recovers the zero-round key beside the negative claim', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker; (window as any).__triSent = []
    window.Worker = class extends Original {
      postMessage(message: any, transfer?: any) {
        if (message.kind === 'run' && message.iv) (window as any).__triSent.push({ keys: Object.keys(message).sort(), iv: Array.from(message.iv), observed: Array.from(message.observed) })
        super.postMessage(message, transfer)
      }
    }
  })
  await boot(page)
  await page.locator('input[name="tri-rounds"][value="0"]').check(); await page.locator('#tri-observe').click()
  const expected = triBits(TRI_KEY, TRI_IV, 1024, 0), length = bmReference(expected).length
  await expect(page.locator('[data-tri="zero-prefix"]')).toHaveText(expected.join(''))
  await expect(page.locator('[data-tri="zero-L"]')).toHaveText(String(length)); expect(length).toBeGreaterThan(12)
  await expect(page.locator('[data-tri="rank"]')).toHaveText('66'); await expect(page.locator('[data-tri="free"]')).toHaveText('14')
  await page.locator('#tri-recover').click()
  const sent = await page.evaluate(() => (window as any).__triSent)
  expect(sent.length).toBe(1); expect(sent[0].keys).toEqual(['iv', 'kind', 'observed', 'runId'])
  expect(sent[0].observed).toEqual(expected)
  expect(sent[0].iv).toEqual(TRI_IV.match(/../g)!.map(s => Number.parseInt(s, 16)))
  await expect(page.locator('[data-tri="candidate-count"]')).toHaveText('1')
  await expect(page.locator('[data-tri="hidden-key"]')).toHaveCount(0)
  await expect(page.locator('[data-tri="tested"]')).toHaveText('16384')
  await expect(page.locator('[data-tri="recovered-key"]')).toHaveText(TRI_KEY)
  await page.locator('#tri-compare').click()
  await expect(page.locator('[data-tri="hidden-key"]')).toHaveText(TRI_KEY)
  await expect(page.locator('[data-verdict="NO SHORT RECURRENCE"]')).toHaveClass(/good/)
  await expect(page.locator('[data-verdict="NO SHORT RECURRENCE — AND KEY RECOVERED"]')).toHaveClass(/alarm/)
  await expect(page.locator('#tri-kat')).toContainText('15/15')
  await expect(page.locator('[data-claim="trivium-negative"]')).toHaveText('A keystream that defeats Berlekamp–Massey is not thereby secure: with its 1,152 warm-up rounds removed, this Trivium still shows no short recurrence while its key is read off the first output bits.')
  await expect(page.locator('#tri-recovery')).toContainText('0 initialization rounds')
  await page.locator('#tri-key').dispatchEvent('input')
  await expect(page.locator('[data-claim="trivium-negative"]')).toBeVisible()
})

test('Trivium full warm-up rejects all zero-round candidates and retires changes', async ({ page }) => {
  await boot(page)
  await expect(page.locator('input[name="tri-rounds"][value="1152"]')).toBeChecked()
  await page.locator('#tri-observe').click(); await page.locator('#tri-recover').click()
  await expect(page.locator('[data-tri="candidate-count"]')).toHaveText('0')
  await expect(page.locator('[data-tri="tested"]')).toHaveText('16384')
  await expect(page.locator('[data-verdict="NO CONSISTENT ZERO-ROUND KEY"]')).toBeVisible()
  await expect(page.locator('#tri-compare')).toBeDisabled()
  for (const changed of ['key', 'iv', 'rounds']) {
    await page.locator('#tri-observe').click()
    if (changed === 'key') await page.locator('#tri-key').fill('1234567890abcdef1234')
    if (changed === 'iv') await page.locator('#tri-iv').fill('1234567890abcdef5678')
    if (changed === 'rounds') await page.locator('input[name="tri-rounds"][value="0"]').check()
    await expect(page.locator('#tri-recovery .verdict')).toHaveCount(0)
    await expect(page.locator('#tri-recovery')).toContainText('retired')
    await expect(page.locator('#tri-recover')).toBeDisabled()
  }
  await page.locator('#tri-observe').click(); await page.locator('#tri-recover').click(); await page.locator('#tri-cancel').click()
  await expect(page.locator('#tri-recovery')).toContainText('cancelled')
  await expect(page.locator('[data-tri="recovered-key"]')).toHaveCount(0)
  await page.locator('#tri-key').fill('bad'); await page.locator('#tri-step').click()
  await expect(page.locator('#tri-state')).toContainText('exactly 20 hex digits')
  await expect(page.locator('.tri-bits')).toHaveCount(0)
})

test('Trivium ambiguous worker results stop without selecting a candidate', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onmessage: any
      postMessage(message: any) {
        if (message.kind !== 'run' || !message.iv) return
        setTimeout(() => this.onmessage?.({ data: { kind: 'result', runId: message.runId, result: { rank: 66, freeBits: 14, tested: 16384, candidates: [new Uint8Array(10), new Uint8Array(10).fill(1)], equations: [], elapsedMs: 0 } } }), 1)
      }
      terminate() {}
    } as any
  })
  await boot(page); await page.locator('#tri-observe').click(); await page.locator('#tri-recover').click()
  await expect(page.locator('[data-tri="candidate-count"]')).toHaveText('2')
  await expect(page.locator('[data-verdict="AMBIGUOUS — STOP"]')).toBeVisible()
  await expect(page.locator('[data-tri="recovered-key"]')).toHaveCount(0)
  await expect(page.locator('#tri-compare')).toBeDisabled()
})
