import { describe, expect, it } from 'vitest'
import { berlekampMasseyTrace } from '../lfsr/bm'
import { period, type Bit } from '../lfsr/lfsr'
import { correlationAttack, DEFAULT_BUDGET, deriveSelectorConstraints, packedToState, stateToPacked } from './correlation'
import { combine, GEFFE, geffeBits } from './geffe'

describe('Geffe construction and correlation', () => {
  it('implements every selector truth-table row and all three specified periods', () => {
    for (const x1 of [0, 1] as Bit[]) for (const x2 of [0, 1] as Bit[]) for (const x3 of [0, 1] as Bit[]) expect(combine(x1, x2, x3)).toBe(x2 ? x1 : x3)
    for (const [key, length] of [['r1', 7], ['r2', 11], ['r3', 13]] as const) expect(period(GEFFE[key], packedToState(1, length))).toBe(2 ** length - 1)
  })
  it('measures full linear complexity 233 for independent state triples', () => {
    for (const [a, b, c] of [[1, 1, 1], [37, 901, 4097], [126, 2046, 8190]]) {
      const bits = geffeBits({ r1: packedToState(a, 7), r2: packedToState(b, 11), r3: packedToState(c, 13) }, 466)
      expect(berlekampMasseyTrace(bits).length).toBe(233)
    }
  })
  it('derives R2 as z XOR x3 and rejects equal-input contradictions', () => {
    expect(deriveSelectorConstraints([0, 1, 0], [1, 0, 1], [0, 1, 1])).toEqual({ required: [0, 0, null], contradictionAt: 2, equalPositions: 1 })
    expect(stateToPacked(packedToState(1817, 11))).toBe(1817)
  })
  it('recovers a deterministic three-state fixture with measured work and a frozen forecast', async () => {
    const states = { r1: packedToState(1, 7), r2: packedToState(1, 11), r3: packedToState(1, 13) }
    const capture = geffeBits(states, 300)
    const result = await correlationAttack(capture, DEFAULT_BUDGET)
    expect(result.metrics.r1StatesScored).toBe(127)
    expect(result.metrics.r3StatesScored).toBe(8191)
    expect(result.metrics.pairAttempts).toBeGreaterThan(0)
    expect(result.metrics.r2StatesTested).toBeGreaterThan(0)
    expect(result.survivors).toEqual([{ r1: 1, r2: 1, r3: 1 }])
    expect(result.prediction).toEqual(geffeBits(states, 364).slice(300))
  }, 20000)
  it('retains ranking ties and reports budget exhaustion without a made-up recovery', async () => {
    const short = await correlationAttack([1], { ...DEFAULT_BUDGET, maxPairs: 1, maxR2Tests: 1 })
    expect(short.leadingR1.length).toBeGreaterThan(DEFAULT_BUDGET.leadingR1)
    expect(short.leadingR3.length).toBeGreaterThan(DEFAULT_BUDGET.leadingR3)
    expect(short.exhausted).toBe(true)
    const states = { r1: packedToState(112, 7), r2: packedToState(854, 11), r3: packedToState(3626, 13) }
    const limited = await correlationAttack(geffeBits(states, 300), { ...DEFAULT_BUDGET, maxR2Tests: 1 })
    expect(limited.exhausted).toBe(true)
    expect(limited.survivors).toEqual([])
    expect(limited.prediction).toBeNull()
  }, 20000)
  it('honors cancellation before a scan can return a candidate', async () => {
    await expect(correlationAttack([1, 0, 1], DEFAULT_BUDGET, undefined, () => true)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
