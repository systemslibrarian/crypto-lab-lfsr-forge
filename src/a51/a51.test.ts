import { describe, expect, it } from 'vitest'
import {
  A51_REGISTERS,
  BGW_SOURCE,
  BGW_VECTOR,
  bytesHex,
  clockA51,
  clockDecision,
  generateA51,
  packMsbFirst,
  parseA51Key,
  runBgwVector,
  setupA51,
  type A51State,
} from './a51'
import {
  A51_COMPLETIONS,
  A51_GUESS_POSITIONS,
  A51_RECOVERY_FIXTURE,
  completeDisclosure,
  disclosureFor,
  fixtureHeldout,
  fixtureObservation,
  recoverCompletions,
} from './recovery'

type ReferenceState = { r1: number; r2: number; r3: number }
const REFERENCE = {
  r1: { mask: 0x07ffff, taps: 0x072000, clock: 8, output: 18 },
  r2: { mask: 0x3fffff, taps: 0x300000, clock: 10, output: 21 },
  r3: { mask: 0x7fffff, taps: 0x700080, clock: 10, output: 22 },
} as const
const registers = ['r1', 'r2', 'r3'] as const

function directParity(value: number): number {
  return value.toString(2).split('').reduce((sum, bit) => sum ^ Number(bit), 0)
}

function directClockOne(value: number, register: keyof ReferenceState): number {
  const profile = REFERENCE[register]
  return ((value << 1) & profile.mask) | directParity(value & profile.taps)
}

function directStep(state: ReferenceState, regular = false): { state: ReferenceState; output: number; controls: number[]; advanced: boolean[] } {
  const controls = registers.map(register => (state[register] >>> REFERENCE[register].clock) & 1)
  const vote = controls[0] + controls[1] + controls[2] >= 2 ? 1 : 0
  const advanced = controls.map(bit => regular || bit === vote)
  const next = Object.fromEntries(registers.map((register, index) => [register, advanced[index] ? directClockOne(state[register], register) : state[register]])) as ReferenceState
  const output = registers.reduce((sum, register) => sum ^ ((next[register] >>> REFERENCE[register].output) & 1), 0)
  return { state: next, output, controls, advanced }
}

function directSetup(key: number[], count: number): { afterKey: ReferenceState; afterCount: ReferenceState; keystreamStart: ReferenceState } {
  let state: ReferenceState = { r1: 0, r2: 0, r3: 0 }
  const regular = () => { state = Object.fromEntries(registers.map(register => [register, directClockOne(state[register], register)])) as ReferenceState }
  const inject = (bit: number) => { state = { r1: state.r1 ^ bit, r2: state.r2 ^ bit, r3: state.r3 ^ bit } }
  for (let index = 0; index < 64; index++) { regular(); inject((key[index >>> 3] >>> (index & 7)) & 1) }
  const afterKey = { ...state }
  for (let index = 0; index < 22; index++) { regular(); inject((count >>> index) & 1) }
  const afterCount = { ...state }
  for (let index = 0; index < 100; index++) state = directStep(state).state
  return { afterKey, afterCount, keystreamStart: state }
}

function directGenerate(initial: ReferenceState, count: number, regular = false): number[] {
  let state = { ...initial }
  return Array.from({ length: count }, () => { const step = directStep(state, regular); state = step.state; return step.output })
}

describe('historical reverse-engineered A5/1 definition', () => {
  it('matches the independently transcribed BGW setup checkpoints and both consecutive 114-bit bursts', () => {
    const key = [...parseA51Key(BGW_VECTOR.keyHex)]
    const reference = directSetup(key, BGW_VECTOR.count)
    expect(reference).toEqual({ afterKey: BGW_VECTOR.afterKey, afterCount: BGW_VECTOR.afterCount, keystreamStart: BGW_VECTOR.keystreamStart })
    expect(setupA51(Uint8Array.from(key), BGW_VECTOR.count)).toEqual(reference)

    const expected = directGenerate(reference.keystreamStart, 228)
    const result = runBgwVector()
    expect(result.aToB).toEqual(expected.slice(0, 114))
    expect(result.bToA).toEqual(expected.slice(114))
    expect(result.aToBHex).toBe(BGW_VECTOR.aToBHex)
    expect(result.bToAHex).toBe(BGW_VECTOR.bToAHex)
    expect(bytesHex(packMsbFirst(expected.slice(0, 114)))).toBe('534eaa582fe8151ab6e1855a728c00')
    expect(bytesHex(packMsbFirst(expected.slice(114)))).toBe('24fd35a35d5fb6526d32f906df1ac0')
    expect(BGW_SOURCE).toMatchObject({ commit: '02f25aeade71a9addc06e8f9678742e04d25fd59', sha256: '72488fd7e9512e40a246c2b137ef49b4fc60b35a69218bc6bc47f88da3ab1eb1' })
  })

  it('uses the published register distinctions and every pre-clock majority decision', () => {
    expect(A51_REGISTERS).toEqual({
      r1: { length: 19, mask: 0x07ffff, taps: [13, 16, 17, 18], tapMask: 0x072000, clockBit: 8, outputBit: 18 },
      r2: { length: 22, mask: 0x3fffff, taps: [20, 21], tapMask: 0x300000, clockBit: 10, outputBit: 21 },
      r3: { length: 23, mask: 0x7fffff, taps: [7, 20, 21, 22], tapMask: 0x700080, clockBit: 10, outputBit: 22 },
    })
    for (let pattern = 0; pattern < 8; pattern++) {
      const state = { r1: (pattern & 1) << 8, r2: ((pattern >>> 1) & 1) << 10, r3: ((pattern >>> 2) & 1) << 10 }
      const reference = directStep(state)
      const decision = clockDecision(state)
      expect(decision.clockBits).toEqual(reference.controls)
      expect(decision.advanced).toEqual(reference.advanced)
      expect(clockA51(state).next).toEqual(reference.state)
      expect(clockA51(state).output).toBe(reference.output)
      expect(clockA51(state, 'regular').advanced).toEqual([true, true, true])
      expect(clockA51(state, 'regular').next).toEqual(directStep(state, true).state)
    }
  })

  it('clocks before output and exposes the exact first historical majority step', () => {
    const step = clockA51(BGW_VECTOR.keystreamStart)
    expect(step).toMatchObject({ clockBits: [0, 0, 1], majority: 0, advanced: [true, true, false], output: 0, next: { r1: 0x3b497, r2: 0x1965f3, r3: 0x08be5f } })
    expect(generateA51(BGW_VECTOR.keystreamStart, 64).bits.join('')).toBe(A51_RECOVERY_FIXTURE.observed + A51_RECOVERY_FIXTURE.heldout)
    const outputBeforeClock = ((BGW_VECTOR.keystreamStart.r1 >>> 18) ^ (BGW_VECTOR.keystreamStart.r2 >>> 21) ^ (BGW_VECTOR.keystreamStart.r3 >>> 22)) & 1
    expect(outputBeforeClock).toBe(1)
    expect(step.output).toBe(0)
  })

  it('rejects malformed keys, COUNT values, states, modes, output counts, and packing input', () => {
    expect(() => parseA51Key('00')).toThrow(/16 hex/)
    expect(() => parseA51Key('z'.repeat(16))).toThrow(/16 hex/)
    expect(() => setupA51(new Uint8Array(7), 0)).toThrow(/8 bytes/)
    for (const count of [-1, 2 ** 22, 1.5]) expect(() => setupA51(new Uint8Array(8), count)).toThrow(/COUNT/)
    expect(() => clockA51({ r1: 2 ** 19, r2: 0, r3: 0 })).toThrow(/R1/)
    expect(() => clockA51({ r1: 0, r2: 0, r3: 0 }, 'wrong' as 'majority')).toThrow(/mode/)
    expect(() => generateA51({ r1: 0, r2: 0, r3: 0 }, 4097)).toThrow(/4,096/)
    expect(() => packMsbFirst([0, 2])).toThrow(/binary/)
  })
})
describe('bounded post-warm-up state-completion experiment', () => {
  const disclosed = disclosureFor(A51_RECOVERY_FIXTURE.state)

  it('discloses 52 state bits, hides all three clock bits among the declared 12, and enumerates each completion once', () => {
    expect(A51_GUESS_POSITIONS).toEqual({ r1: [0, 5, 8, 13], r2: [0, 10, 20, 21], r3: [0, 7, 10, 22] })
    expect(registers.flatMap(register => disclosed[register]).filter(bit => bit === null)).toHaveLength(12)
    expect(registers.flatMap(register => disclosed[register]).filter(bit => bit !== null)).toHaveLength(52)
    expect(disclosed.r1[8]).toBeNull(); expect(disclosed.r2[10]).toBeNull(); expect(disclosed.r3[10]).toBeNull()
    const states = Array.from({ length: A51_COMPLETIONS }, (_, code) => completeDisclosure(disclosed, code))
    expect(new Set(states.map(state => `${state.r1}/${state.r2}/${state.r3}`)).size).toBe(A51_COMPLETIONS)
    expect(states[A51_RECOVERY_FIXTURE.trueCode]).toEqual(A51_RECOVERY_FIXTURE.state)
    expect(A51_RECOVERY_FIXTURE.trueCode.toString(2).padStart(12, '0').split('').reverse().join('')).toBe('100010011010')
  })

  it('filters 4,096 completions to the true state with the actual irregular stepping and verifies a disjoint continuation', async () => {
    const result = await recoverCompletions(disclosed, fixtureObservation())
    expect(result.counts).toEqual([4096, 2048, 1664, 768, 512, 224, 64, 64, 64, 64, 32, 16, 16, 16, 16, 16, 11, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1])
    expect(result.bitComparisons).toBe(9719)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({ code: 1425, start: A51_RECOVERY_FIXTURE.state })
    expect(result.candidates[0].prediction).toEqual(fixtureHeldout())
    expect(result.counts.findIndex(count => count === 1)).toBe(29)
  })

  it('stops on a 16-bit ambiguity and rejects the counterfactual regular-clock model', async () => {
    const ambiguous = await recoverCompletions(disclosed, fixtureObservation().slice(0, 16))
    expect(ambiguous.candidates).toHaveLength(11)
    expect(ambiguous.counts.at(-1)).toBe(11)
    const regular = await recoverCompletions(disclosed, fixtureObservation(), 'regular')
    expect(regular.counts.slice(0, 3)).toEqual([4096, 2048, 0])
    expect(regular.counts.slice(3)).toEqual(Array(30).fill(0))
    expect(regular.bitComparisons).toBe(6144)
    expect(regular.candidates).toEqual([])
  })

  it('lets a flipped one-based observation 29 select a wrong completion that the held-out bits reject', async () => {
    const result = await recoverCompletions(disclosed, fixtureObservation(true))
    expect(result.bitComparisons).toBe(9719)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].code).toBe(1409)
    expect(result.candidates[0].start).not.toEqual(A51_RECOVERY_FIXTURE.state)
    expect(result.candidates[0].prediction.join('')).toBe(A51_RECOVERY_FIXTURE.corruptedPrediction)
    const heldout = fixtureHeldout(), mismatches = result.candidates[0].prediction.flatMap((bit, index) => bit === heldout[index] ? [] : [index + 1])
    expect(mismatches).toEqual([10, 13, 19, 22, 23, 24, 27, 29, 30, 31, 32])
  })

  it('validates the public boundary and honors cancellation before publishing candidates', async () => {
    await expect(recoverCompletions(disclosed, [])).rejects.toThrow(/1 through 32/)
    await expect(recoverCompletions(disclosed, [0, 2])).rejects.toThrow(/binary/)
    await expect(recoverCompletions({ ...disclosed, r1: [...disclosed.r1].fill(0) }, [0])).rejects.toThrow(/hide exactly/)
    await expect(recoverCompletions({ ...disclosed, hiddenState: A51_RECOVERY_FIXTURE.state } as unknown as typeof disclosed, [0])).rejects.toThrow(/only the R1, R2, and R3/)
    await expect(recoverCompletions(disclosed, [0], 'wrong' as 'majority')).rejects.toThrow(/model/)
    await expect(recoverCompletions(disclosed, fixtureObservation(), 'majority', () => {}, () => true)).rejects.toThrow(/cancelled/)
  })
})
