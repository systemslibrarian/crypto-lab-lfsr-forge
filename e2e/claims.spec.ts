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
  await page.locator('#panel-attack').getByRole('button', { name: 'Cancel scan' }).click()
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

function booleanReference(truth: number[]) {
  const popcount = (value: number) => value.toString(2).replaceAll('0', '').length
  const weight = truth.reduce((sum, bit) => sum + bit, 0)
  const anf = [...truth]
  for (let variable = 0; variable < 4; variable++) for (let mask = 0; mask < 16; mask++) if (mask & (1 << variable)) anf[mask] ^= anf[mask ^ (1 << variable)]
  const degree = anf.reduce((maximum, coefficient, mask) => coefficient ? Math.max(maximum, popcount(mask)) : maximum, 0)
  const walsh = Array.from({ length: 16 }, (_, mask) => truth.reduce((sum, output, row) => sum + (output ^ (popcount(row & mask) & 1) ? -1 : 1), 0))
  let ci = 0
  for (let order = 1; order <= 4; order++) if (walsh.every((coefficient, mask) => mask === 0 || popcount(mask) > order || coefficient === 0)) ci = order; else break
  let ai = 3
  const monomials = Array.from({ length: 16 }, (_, mask) => mask).filter(mask => popcount(mask) <= 2)
  for (let choice = 1; choice < 2 ** monomials.length; choice++) {
    const chosen = monomials.filter((_, index) => (choice >> index) & 1)
    const candidate = Array.from({ length: 16 }, (_, row) => chosen.reduce((sum, monomial) => sum ^ Number((row & monomial) === monomial), 0))
    const candidateDegree = chosen.reduce((maximum, monomial) => Math.max(maximum, popcount(monomial)), 0)
    for (const complement of [0, 1]) if (candidate.every((bit, row) => !(bit & (truth[row] ^ complement)))) ai = Math.min(ai, candidateDegree)
  }
  return { weight, balanced: weight === 8, degree, walsh, nonlinearity: 8 - Math.max(...walsh.map(Math.abs)) / 2, ci, resiliency: weight === 8 ? ci : null, ai }
}

async function renderedTruth(page: import('@playwright/test').Page): Promise<number[]> {
  return (await page.locator('.bool-output').allTextContents()).map(Number)
}

function tinyRegister(degree: number, taps: number[], packed: number, count: number): number[] {
  let state = Array.from({ length: degree }, (_, index) => (packed >> index) & 1)
  return Array.from({ length: count }, () => {
    const output = state[0]
    const feedback = taps.reduce((sum, tap) => sum ^ state[degree - tap], 0)
    state = [...state.slice(1), feedback]
    return output
  })
}

function booleanFixture(kind: 'single' | 'pair' | 'parity', count: number): number[] {
  const inputs = [[3, [1, 3]], [4, [1, 4]], [5, [2, 5]], [7, [1, 7]]].map(([degree, taps]) => tinyRegister(degree as number, taps as number[], 1, count))
  return Array.from({ length: count }, (_, index) => {
    const [x1, x2, x3, x4] = inputs.map(bits => bits[index])
    if (kind === 'single') return (x1 & x2) ^ (x1 & x3) ^ x4
    if (kind === 'pair') return x1 ^ x2 ^ (x3 & x4)
    return x1 ^ x2 ^ x3 ^ x4
  })
}

test('Boolean metrics, restrictions, and annihilator are independently recomputed', async ({ page }) => {
  await boot(page)
  for (const key of ['parity', 'bent', 'resilient', 'correlated']) {
    await page.locator('#bool-preset').selectOption(key)
    const truth = await renderedTruth(page), reference = booleanReference(truth)
    await expect(page.locator('[data-bool="weight"]')).toHaveText(`${reference.weight}/16`)
    await expect(page.locator('[data-bool="balanced"]')).toHaveText(reference.balanced ? 'yes' : 'no')
    await expect(page.locator('[data-bool="degree"]')).toHaveText(String(reference.degree))
    await expect(page.locator('[data-bool="nonlinearity"]')).toHaveText(String(reference.nonlinearity))
    await expect(page.locator('[data-bool="ci"]')).toHaveText(String(reference.ci))
    await expect(page.locator('[data-bool="resiliency"]')).toHaveText(reference.resiliency === null ? 'not balanced' : String(reference.resiliency))
    await expect(page.locator('[data-bool="ai"]')).toHaveText(String(reference.ai))
    await expect(page.locator('[data-bool="ai-count"]')).toHaveText('4094')
    await expect(page.locator('[data-bool="ai-product"]')).toHaveText('0'.repeat(16))
    await expect(page.locator('[data-verdict="WALSH / RESTRICTION CHECKS AGREE"]')).toBeVisible()
    for (let mask = 0; mask < 16; mask++) await expect(page.locator(`[data-walsh="${mask}"] td`).nth(1)).toHaveText(String(reference.walsh[mask]))
  }
  await page.locator('#bool-preset').selectOption('resilient')
  await page.locator('#bool-subset').selectOption('3')
  const rows = await page.locator('#bool-restrictions tbody tr').allTextContents()
  expect(rows).toHaveLength(4)
  expect(rows.filter(row => row.endsWith('no'))).toHaveLength(4)
  const before = await renderedTruth(page)
  const firstOutput = page.locator('.bool-output[data-row="0"]')
  await firstOutput.focus()
  await expect(firstOutput).toBeFocused()
  await firstOutput.press('Enter')
  await expect(page.locator('.bool-output[data-row="0"]')).toBeFocused()
  const after = await renderedTruth(page)
  expect(after[0]).toBe(1 ^ before[0])
  const edited = booleanReference(after)
  await expect(page.locator('[data-bool="degree"]')).toHaveText(String(edited.degree))
  await expect(page.locator('[data-bool="nonlinearity"]')).toHaveText(String(edited.nonlinearity))
})

test('Boolean public-only worker executes both correlation counterexamples and parity prediction', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker; (window as any).__boolSent = []
    window.Worker = class extends Original {
      postMessage(message: any, transfer?: any) {
        if (message.kind === 'run' && message.attack) (window as any).__boolSent.push({ keys: Object.keys(message).sort(), attack: message.attack, observed: [...message.observed] })
        super.postMessage(message, transfer)
      }
    }
  })
  await boot(page)
  await page.locator('#bool-single').click()
  await expect(page.locator('[data-verdict="ONE LEADING STATE"]')).toBeVisible()
  let sent = await page.evaluate(() => (window as any).__boolSent)
  expect(sent[0].keys).toEqual(['attack', 'kind', 'observed', 'runId'])
  expect(sent[0].observed).toEqual(booleanFixture('single', 300))
  await expect(page.locator('#bool-attack tbody tr').first()).toContainText('213/300')
  await expect(page.locator('[data-bool="work"]')).toHaveText(String(127 * 300))
  await page.getByRole('button', { name: 'Compare original R4 state' }).click()
  await expect(page.locator('[data-verdict="R4 STATE CONFIRMED"]')).toBeVisible()

  await page.locator('#bool-pair').click()
  await expect(page.locator('[data-verdict="ONE LEADING PAIR"]')).toBeVisible()
  sent = await page.evaluate(() => (window as any).__boolSent)
  expect(sent[1].keys).toEqual(['attack', 'kind', 'observed', 'runId'])
  expect(sent[1].observed).toEqual(booleanFixture('pair', 300))
  await expect(page.locator('#bool-attack tbody tr').first()).toContainText('219/300')
  await expect(page.locator('[data-bool="work"]')).toHaveText(String(7 * 15 * 300))
  await page.getByRole('button', { name: 'Compare original R1/R2 states' }).click()
  await expect(page.locator('[data-verdict="R1/R2 STATES CONFIRMED"]')).toBeVisible()

  await page.locator('#bool-parity').click()
  const full = booleanFixture('parity', 102), fitted = bmReference(full.slice(0, 38))
  await expect(page.locator('[data-bool="parity-L"]')).toHaveText(String(fitted.length))
  await expect(page.locator('[data-bool="parity-prediction"]')).toHaveText(predictReference(full.slice(0, 38), fitted.coefficients, fitted.length))
  await page.getByRole('button', { name: 'Reveal and compare next 64 bits' }).click()
  await expect(page.locator('[data-verdict="NEXT 64 BITS PREDICTED"]')).toBeVisible()
})

test('Boolean ambiguous scans stop and table edits retire prior verdicts', async ({ page }) => {
  await boot(page)
  await page.locator('#bool-tie').click()
  await expect(page.locator('[data-verdict="AMBIGUOUS — STOP"]')).toBeVisible()
  await expect(page.locator('#bool-compare')).toHaveCount(0)
  await page.locator('#bool-single').click()
  await expect(page.locator('[data-verdict="ONE LEADING STATE"]')).toBeVisible()
  await page.locator('.bool-output[data-row="0"]').click()
  await expect(page.locator('[data-verdict="ONE LEADING STATE"]')).toHaveCount(0)
  await expect(page.locator('#bool-attack')).toContainText('prior attack result was retired')
})


// Independent integer-register transcription of the historical BGW program.
// These browser oracles intentionally import no A5/1 application fixtures.
type A51ReferenceState = { r1: number; r2: number; r3: number }
const A51_REFERENCE_REGISTERS = {
  r1: { length: 19, mask: 0x07ffff, taps: [13, 16, 17, 18], clock: 8, output: 18 },
  r2: { length: 22, mask: 0x3fffff, taps: [20, 21], clock: 10, output: 21 },
  r3: { length: 23, mask: 0x7fffff, taps: [7, 20, 21, 22], clock: 10, output: 22 },
} as const
const A51_REFERENCE_ORDER = ['r1', 'r2', 'r3'] as const
const A51_REFERENCE_UNKNOWN = { r1: [0, 5, 8, 13], r2: [0, 10, 20, 21], r3: [0, 7, 10, 22] } as const

function a51ReferenceClockOne(value: number, register: keyof A51ReferenceState): number {
  const profile = A51_REFERENCE_REGISTERS[register]
  const feedback = profile.taps.reduce((bit, position) => bit ^ ((value >>> position) & 1), 0)
  return ((value << 1) & profile.mask) | feedback
}

function a51ReferenceStep(state: A51ReferenceState, regular = false) {
  const controls = A51_REFERENCE_ORDER.map(register => (state[register] >>> A51_REFERENCE_REGISTERS[register].clock) & 1)
  const majority = controls.reduce((sum, bit) => sum + bit, 0) >= 2 ? 1 : 0
  const advanced = controls.map(bit => regular || bit === majority)
  const next = Object.fromEntries(A51_REFERENCE_ORDER.map((register, index) => [register, advanced[index] ? a51ReferenceClockOne(state[register], register) : state[register]])) as A51ReferenceState
  const output = A51_REFERENCE_ORDER.reduce((bit, register) => bit ^ ((next[register] >>> A51_REFERENCE_REGISTERS[register].output) & 1), 0)
  return { controls, majority, advanced, next, output }
}

function a51ReferenceSetup(keyHex = '1223456789abcdef', count = 0x134) {
  const key = keyHex.match(/../g)!.map(byte => Number.parseInt(byte, 16))
  let state: A51ReferenceState = { r1: 0, r2: 0, r3: 0 }
  const regularClock = () => { state = Object.fromEntries(A51_REFERENCE_ORDER.map(register => [register, a51ReferenceClockOne(state[register], register)])) as A51ReferenceState }
  const inject = (bit: number) => { state = { r1: state.r1 ^ bit, r2: state.r2 ^ bit, r3: state.r3 ^ bit } }
  for (let index = 0; index < 64; index++) { regularClock(); inject((key[index >>> 3] >>> (index & 7)) & 1) }
  const afterKey = { ...state }
  for (let index = 0; index < 22; index++) { regularClock(); inject((count >>> index) & 1) }
  const afterCount = { ...state }
  for (let index = 0; index < 100; index++) state = a51ReferenceStep(state).next
  return { afterKey, afterCount, keystreamStart: state }
}

function a51ReferenceGenerate(initial: A51ReferenceState, count: number, regular = false) {
  let state = { ...initial }
  const bits = Array.from({ length: count }, () => { const step = a51ReferenceStep(state, regular); state = step.next; return step.output })
  return { bits, state }
}

function a51ReferenceHex(bits: number[]): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  bits.forEach((bit, index) => { bytes[index >>> 3] |= bit << (7 - (index & 7)) })
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function a51ReferenceDisclosed(state: A51ReferenceState): Record<keyof A51ReferenceState, Array<number | null>> {
  return Object.fromEntries(A51_REFERENCE_ORDER.map(register => {
    const unknown = new Set<number>(A51_REFERENCE_UNKNOWN[register])
    return [register, Array.from({ length: A51_REFERENCE_REGISTERS[register].length }, (_, position) => unknown.has(position) ? null : (state[register] >>> position) & 1)]
  })) as Record<keyof A51ReferenceState, Array<number | null>>
}

function a51ReferenceComplete(disclosed: ReturnType<typeof a51ReferenceDisclosed>, code: number): A51ReferenceState {
  let guess = 0
  return Object.fromEntries(A51_REFERENCE_ORDER.map(register => {
    let value = 0
    disclosed[register].forEach((known, position) => { value |= (known === null ? (code >>> guess++) & 1 : known) << position })
    return [register, value]
  })) as A51ReferenceState
}

function a51ReferenceRecover(disclosed: ReturnType<typeof a51ReferenceDisclosed>, observed: number[], regular = false) {
  let candidates = Array.from({ length: 4096 }, (_, code) => ({ code, start: a51ReferenceComplete(disclosed, code), state: a51ReferenceComplete(disclosed, code) }))
  const counts = [candidates.length]
  let comparisons = 0
  for (const observedBit of observed) {
    const survivors: typeof candidates = []
    for (const candidate of candidates) {
      const step = a51ReferenceStep(candidate.state, regular); comparisons++
      if (step.output === observedBit) survivors.push({ ...candidate, state: step.next })
    }
    candidates = survivors; counts.push(candidates.length)
  }
  return { counts, comparisons, candidates: candidates.map(candidate => ({ ...candidate, prediction: a51ReferenceGenerate(candidate.state, 32, regular).bits })) }
}

function a51ReferenceStateHex(state: A51ReferenceState): string {
  return `${state.r1.toString(16).padStart(5, '0')} / ${state.r2.toString(16).padStart(6, '0')} / ${state.r3.toString(16).padStart(6, '0')}`
}

test('historical A5/1 checkpoints and predict-before-clock interaction match an independent transcription', async ({ page }) => {
  const setup = a51ReferenceSetup(), stream = a51ReferenceGenerate(setup.keystreamStart, 228).bits
  expect(setup).toEqual({ afterKey: { r1: 0x4030d, r2: 0x1fa05c, r3: 0x3668e1 }, afterCount: { r1: 0x064a2, r2: 0x2bc0e5, r3: 0x72df8d }, keystreamStart: { r1: 0x1da4b, r2: 0x2cb2f9, r3: 0x08be5f } })
  expect(a51ReferenceHex(stream.slice(0, 114))).toBe('534eaa582fe8151ab6e1855a728c00')
  expect(a51ReferenceHex(stream.slice(114))).toBe('24fd35a35d5fb6526d32f906df1ac0')

  await boot(page)
  await expect(page.locator('[data-verdict="HISTORICAL BGW VECTOR PASSED"]')).toContainText('5/5')
  await page.locator('#a51-checkpoints > summary').click()
  await expect(page.locator('[data-a51="after-key"]')).toHaveText(a51ReferenceStateHex(setup.afterKey))
  await expect(page.locator('[data-a51="after-count"]')).toHaveText(a51ReferenceStateHex(setup.afterCount))
  await expect(page.locator('[data-a51="after-warmup"]')).toHaveText(a51ReferenceStateHex(setup.keystreamStart))
  await expect(page.locator('[data-a51="a-to-b"]')).toHaveText(a51ReferenceHex(stream.slice(0, 114)))
  await expect(page.locator('[data-a51="b-to-a"]')).toHaveText(a51ReferenceHex(stream.slice(114)))
  await expect(page.locator('#a51-failures-card a[href*="TWILIGHTVEGETABLE/blob/02f25ae"]')).toHaveCount(1)
  await expect(page.locator('#a51-failures-card a[href="https://doi.org/10.1007/3-540-44706-7_1"]')).toHaveCount(1)
  await expect(page.locator('#a51-failures-card a[href*="ts_143020v110500p.pdf"]')).toHaveCount(1)
  expect(await page.locator('#a51-state-rows tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent)))).toEqual([
    ['R1', '19', '13, 16, 17, 18', '8', '18', '0x1da4b'],
    ['R2', '22', '20, 21', '10', '21', '0x2cb2f9'],
    ['R3', '23', '7, 20, 21, 22', '10', '22', '0x08be5f'],
  ])

  const first = a51ReferenceStep(setup.keystreamStart), regular = a51ReferenceStep(setup.keystreamStart, true)
  expect(first).toMatchObject({ controls: [0, 0, 1], majority: 0, advanced: [true, true, false], output: 0, next: { r1: 0x3b497, r2: 0x1965f3, r3: 0x08be5f } })
  await expect(page.locator('[data-a51="clock-bits"]')).toHaveText(first.controls.join(' / '))
  await expect(page.locator('[data-a51="majority"]')).toHaveText(String(first.majority))
  await expect(page.locator('[data-a51="advances"]')).toHaveCount(0)
  await expect(page.locator('#a51-step')).toBeDisabled()
  await page.locator('#a51-predict-r1').check(); await page.locator('#a51-predict-r2').check(); await page.locator('#a51-check-prediction').click()
  await expect(page.locator('[data-verdict="MAJORITY PREDICTION MATCHED"]')).toBeVisible()
  await expect(page.locator('#a51-step')).toBeEnabled()
  await page.locator('#a51-predict-r3').check()
  await expect(page.locator('[data-verdict="MAJORITY PREDICTION MATCHED"]')).toHaveCount(0)
  await expect(page.locator('#a51-step')).toBeDisabled()
  await page.locator('#a51-predict-r3').uncheck(); await page.locator('#a51-check-prediction').click(); await page.locator('#a51-regular').click()
  await expect(page.locator('[data-a51="majority-next"]')).toHaveText(a51ReferenceStateHex(first.next))
  await expect(page.locator('[data-a51="regular-next"]')).toHaveText(a51ReferenceStateHex(regular.next))
  await expect(page.locator('[data-verdict="COUNTERFACTUAL ONLY"]')).toBeVisible()
  await page.locator('#a51-step').click()
  await expect(page.locator('[data-a51="advances"]')).toHaveText('R1 + R2')
  await expect(page.locator('[data-a51="step-output"]')).toHaveText(String(first.output))
  await expect(page.locator('[data-a51="step-state"]')).toHaveText(a51ReferenceStateHex(first.next))
})

test('bounded A5/1 worker receives only masked evidence and independently recovers then verifies one state', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker; (window as any).__a51Sent = []
    window.Worker = class extends Original {
      postMessage(message: any, transfer?: any) {
        if (message.kind === 'run' && message.disclosed) (window as any).__a51Sent.push(JSON.parse(JSON.stringify(message)))
        super.postMessage(message, transfer)
      }
    }
  })
  const setup = a51ReferenceSetup(), stream = a51ReferenceGenerate(setup.keystreamStart, 64).bits
  const observed = stream.slice(0, 32), heldout = stream.slice(32), disclosed = a51ReferenceDisclosed(setup.keystreamStart)
  const reference = a51ReferenceRecover(disclosed, observed)
  expect(reference.counts).toEqual([4096, 2048, 1664, 768, 512, 224, 64, 64, 64, 64, 32, 16, 16, 16, 16, 16, 11, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1])
  expect(reference.comparisons).toBe(9719); expect(reference.candidates).toHaveLength(1)
  expect(reference.candidates[0]).toMatchObject({ code: 1425, start: setup.keystreamStart, prediction: heldout })

  await boot(page); await page.locator('#a51-run').click()
  await expect(page.locator('[data-a51="candidate-code"]')).toHaveText('1425')
  const sent = await page.evaluate(() => (window as any).__a51Sent)
  expect(sent).toHaveLength(1)
  expect(Object.keys(sent[0]).sort()).toEqual(['disclosed', 'kind', 'model', 'observed', 'runId'])
  expect(sent[0].observed).toEqual(observed); expect(sent[0].model).toBe('majority')
  expect(sent[0].disclosed).toEqual(disclosed)
  expect(A51_REFERENCE_ORDER.flatMap(register => sent[0].disclosed[register]).filter(bit => bit === null)).toHaveLength(12)
  expect(A51_REFERENCE_ORDER.flatMap(register => sent[0].disclosed[register]).filter(bit => bit !== null)).toHaveLength(52)
  await expect(page.locator('[data-a51="completions"]')).toHaveText('4096')
  await expect(page.locator('[data-a51="comparisons"]')).toHaveText(String(reference.comparisons))
  await expect(page.locator('[data-a51="first-unique"]')).toHaveText('29')
  await expect(page.locator('[data-a51="candidate-bits"]')).toHaveText('100010011010')
  await expect(page.locator('[data-a51="candidate-state"]')).toHaveText(a51ReferenceStateHex(setup.keystreamStart))
  expect((await page.locator('#a51-recovery .a51-counts tbody td').allTextContents()).map(Number)).toEqual(reference.counts)

  await page.locator('#a51-heldout').click()
  await expect(page.locator('[data-a51="heldout-actual"]')).toHaveText(heldout.join(''))
  await expect(page.locator('[data-a51="heldout-prediction"]')).toHaveText(heldout.join(''))
  await expect(page.locator('[data-verdict="HELD-OUT CONTINUATION MATCHED"]')).toBeVisible()
  await page.locator('#a51-compare').click()
  await expect(page.locator('[data-verdict="POST-100 STATE CONFIRMED"]')).toBeVisible()
  await expect(page.locator('[data-claim="a51-scope"]')).toContainText('aligned 32-bit known keystream')
  await expect(page.locator('[data-claim="a51-scope"]')).toContainText('52 exact post-warm-up state bits')
  await expect(page.locator('[data-claim="a51-scope"]')).toContainText('not a published A5/1 attack')
  await expect(page.locator('[data-claim="a51-scope"]')).toContainText('does not recover the 64-bit session key')
  await expect(page.locator('[data-claim="a51-scope"]')).toContainText('does not model modern cellular encryption')
})

test('bounded A5/1 ambiguity, regular-model mismatch, and corrupted observation fail explicitly', async ({ page }) => {
  const setup = a51ReferenceSetup(), stream = a51ReferenceGenerate(setup.keystreamStart, 64).bits
  const observed = stream.slice(0, 32), heldout = stream.slice(32), disclosed = a51ReferenceDisclosed(setup.keystreamStart)
  const ambiguous = a51ReferenceRecover(disclosed, observed.slice(0, 16))
  const regular = a51ReferenceRecover(disclosed, observed, true)
  const corrupted = [...observed]; corrupted[28] ^= 1
  const corruptResult = a51ReferenceRecover(disclosed, corrupted)
  expect(ambiguous.candidates).toHaveLength(11)
  expect(regular.counts.slice(0, 3)).toEqual([4096, 2048, 0]); expect(regular.comparisons).toBe(6144)
  expect(corruptResult.comparisons).toBe(9719); expect(corruptResult.candidates).toHaveLength(1); expect(corruptResult.candidates[0].code).toBe(1409)
  const mismatches = corruptResult.candidates[0].prediction.flatMap((bit, index) => bit === heldout[index] ? [] : [index + 1])
  expect(corruptResult.candidates[0].prediction.join('')).toBe('00101111101000000011001000110101')
  expect(mismatches).toEqual([10, 13, 19, 22, 23, 24, 27, 29, 30, 31, 32])

  await boot(page); await page.locator('#a51-ambiguous').click()
  await expect(page.locator('[data-a51="ambiguous-count"]')).toHaveText(String(ambiguous.candidates.length))
  await expect(page.locator('#a51-failure [data-verdict="AMBIGUOUS — STOP"]')).toBeVisible()
  await page.locator('#a51-wrong-model').click()
  await expect(page.locator('[data-a51="regular-counts"]')).toHaveText('4096 → 2048 → 0')
  await expect(page.locator('[data-a51="regular-comparisons"]')).toHaveText(String(regular.comparisons))
  await expect(page.locator('[data-verdict="REGULAR MODEL REJECTED"]')).toContainText('not a security comparison')
  await page.locator('#a51-corrupt').click()
  await expect(page.locator('[data-a51="corrupt-index"]')).toHaveText('29')
  await expect(page.locator('[data-a51="corrupt-code"]')).toHaveText(String(corruptResult.candidates[0].code))
  await expect(page.locator('[data-a51="corrupt-prediction"]')).toHaveText(corruptResult.candidates[0].prediction.join(''))
  await expect(page.locator('[data-a51="corrupt-mismatches"]')).toHaveText(mismatches.join(', '))
  await expect(page.locator('[data-verdict="HELD-OUT CONTINUATION REJECTED 1409"]')).toContainText('11 fresh continuation bits disagree')
  await expect(page.locator('[data-verdict="POST-100 STATE CONFIRMED"]')).toHaveCount(0)
})

test('A5/1 cancellation, changed evidence, malformed replies, and pagehide retire worker results', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => {
    ;(window as any).__a51Terminated = 0; (window as any).__a51Malformed = false; (window as any).__a51RunCount = 0; (window as any).__a51Delays = []; (window as any).__a51MalformedQueue = []; (window as any).__a51ManualDelivery = false; (window as any).__a51Workers = []
    window.Worker = class {
      onmessage: ((event: any) => void) | null = null
      onerror: ((event: any) => void) | null = null
      pending: any = null
      constructor() { (window as any).__a51Workers.push(this) }
      postMessage(message: any) {
        if (message.kind !== 'run' || !message.disclosed) return
        const runNumber = ++(window as any).__a51RunCount
        const queuedMalformed = (window as any).__a51MalformedQueue.shift()
        const malformed = queuedMalformed ?? (window as any).__a51Malformed
        const regular = message.model === 'regular'
        const counts = Array.from({ length: message.observed.length + 1 }, (_, index) => regular ? (index === 0 ? 4096 : index === 1 ? 2048 : 0) : (index === 0 ? 4096 : 1))
        const candidate = { code: malformed ? 5000 : runNumber, start: { r1: malformed ? 0x80000 : 1, r2: 1, r3: 1 }, prediction: Array(32).fill(0) }
        const result = { model: message.model, observations: [...message.observed], counts, bitComparisons: regular ? 6144 : 4096, completions: 4096, candidates: regular ? [] : [candidate] }
        this.pending = { data: { kind: 'result', runId: message.runId, result } }
        if ((window as any).__a51ManualDelivery) return
        const queuedDelay = (window as any).__a51Delays.shift()
        setTimeout(() => this.deliver(), queuedDelay ?? (regular || malformed ? 10 : 70))
      }
      deliver() { const pending = this.pending; this.pending = null; if (pending) this.onmessage?.(pending) }
      terminate() { (window as any).__a51Terminated++ }
    } as any
  })

  await boot(page)
  await page.locator('#a51-run').click(); await page.locator('#a51-cancel').click()
  await page.waitForTimeout(100)
  await expect(page.locator('#a51-recovery')).toContainText('cancelled')
  await expect(page.locator('[data-a51="candidate-code"]')).toHaveCount(0)

  await page.locator('#a51-run').click(); await page.locator('#a51-wrong-model').click()
  await expect(page.locator('[data-verdict="REGULAR MODEL REJECTED"]')).toBeVisible()
  await page.waitForTimeout(100)
  await expect(page.locator('[data-a51="candidate-code"]')).toHaveCount(0)
  await expect(page.locator('[data-verdict="REGULAR MODEL REJECTED"]')).toBeVisible()
  await expect(page.locator('[data-a51="regular-counts"]')).toHaveText('4096 → 2048 → 0')
  await expect(page.locator('[data-a51="regular-comparisons"]')).toHaveText('6144')

  await page.evaluate(() => { (window as any).__a51Malformed = true })
  await page.locator('#a51-run').click()
  await expect(page.locator('#a51-recovery')).toContainText('invalid message')
  await expect(page.locator('[data-a51="candidate-code"]')).toHaveCount(0)

  await page.evaluate(() => { (window as any).__a51Malformed = false })
  await page.evaluate(() => { (window as any).__a51ManualDelivery = true; (window as any).__a51MalformedQueue = [true, false] })
  await page.locator('#a51-run').click(); await page.locator('#a51-run').click()
  const newestRun = await page.evaluate(() => (window as any).__a51RunCount)
  await page.evaluate(() => {
    const workers = (window as any).__a51Workers
    const [staleWorker, newestWorker] = workers.slice(-2)
    staleWorker.deliver()
    newestWorker.deliver()
  })
  await expect(page.locator('[data-a51="candidate-code"]')).toHaveText(String(newestRun))
  await expect(page.locator('[data-a51="candidate-code"]')).toHaveText(String(newestRun))

  await page.evaluate(() => { (window as any).__a51ManualDelivery = false })
  await page.locator('#a51-run').click(); await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => (window as any).__a51Terminated)).toBeGreaterThanOrEqual(7)
  expect(pageErrors).toEqual([])
})
