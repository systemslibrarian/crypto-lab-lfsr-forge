import { describe, expect, it } from 'vitest'
import { deterministicAttackFixture, fitParityModel, scanRegisterPair, scanSingleRegister } from './attacks'

describe('bounded Boolean-combiner counterexamples', () => {
  it('ranks the true R4 state first through a measured order-one correlation', () => {
    const observed = deterministicAttackFixture('single', 300)
    const before = [...observed]
    const result = scanSingleRegister(observed)
    expect(result.bitComparisons).toBe(127 * 300)
    expect(result.ranking[0]).toEqual({ packed: 1, matches: 213, total: 300 })
    expect(result.ranking[1].matches).toBe(168)
    expect(result.leaders).toEqual([result.ranking[0]])
    expect(observed).toEqual(before)
  })

  it('uses an order-two parity relation after every order-one correlation vanishes', () => {
    const observed = deterministicAttackFixture('pair', 300)
    const result = scanRegisterPair(observed)
    expect(result.bitComparisons).toBe(7 * 15 * 300)
    expect(result.ranking[0]).toEqual({ left: 1, right: 1, matches: 219, total: 300 })
    expect(result.ranking[1].matches).toBe(170)
    expect(result.leaders).toEqual([result.ranking[0]])
  })

  it('fits parity as an equivalent recurrence and predicts a separately generated continuation', () => {
    const full = deterministicAttackFixture('parity', 102)
    const model = fitParityModel(full.slice(0, 38))
    expect(model.length).toBe(19)
    expect(model.prediction).toEqual(full.slice(38))
  })

  it('retains ties and rejects malformed or out-of-bound scans', () => {
    const tied = scanSingleRegister(deterministicAttackFixture('single', 1))
    expect(tied.leaders.length).toBeGreaterThan(1)
    expect(() => scanSingleRegister([])).toThrow(/1 through 300/)
    expect(() => scanRegisterPair(Array(301).fill(0))).toThrow(/1 through 300/)
    expect(() => fitParityModel([0, 2])).toThrow(/binary/)
  })
})
