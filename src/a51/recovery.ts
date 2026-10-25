import type { Bit } from '../lfsr/lfsr'
import { A51_REGISTER_ORDER, A51_REGISTERS, clockA51, generateA51, stateBits, type A51ClockMode, type A51Register, type A51State } from './a51'

export type DisclosedBit = Bit | null
export type DisclosedState = Readonly<Record<A51Register, readonly DisclosedBit[]>>

export const A51_GUESS_POSITIONS: Readonly<Record<A51Register, readonly number[]>> = {
  r1: [0, 5, 8, 13],
  r2: [0, 10, 20, 21],
  r3: [0, 7, 10, 22],
}
export const A51_GUESSED_BITS = 12
export const A51_COMPLETIONS = 2 ** A51_GUESSED_BITS
export const A51_OBSERVED_BITS = 32
export const A51_HELDOUT_BITS = 32

export const A51_RECOVERY_FIXTURE = {
  state: { r1: 0x1da4b, r2: 0x2cb2f9, r3: 0x08be5f },
  observed: '01010011010011101010101001011000',
  heldout: '00101111111010000001010100011010',
  trueCode: 1425,
  corruptedOneBased: 29,
  corruptedCode: 1409,
  corruptedPrediction: '00101111101000000011001000110101',
} as const satisfies Readonly<{
  state: A51State
  observed: string
  heldout: string
  trueCode: number
  corruptedOneBased: number
  corruptedCode: number
  corruptedPrediction: string
}>

export type CompletionCandidate = Readonly<{
  code: number
  start: A51State
  prediction: readonly Bit[]
}>

export type CompletionProgress = Readonly<{
  observationsUsed: number
  candidates: number
  totalObservations: number
}>

export type CompletionResult = Readonly<{
  model: A51ClockMode
  observations: readonly Bit[]
  counts: readonly number[]
  bitComparisons: number
  completions: number
  candidates: readonly CompletionCandidate[]
}>

const stringBits = (value: string): Bit[] => Array.from(value, bit => Number(bit) as Bit)

export function disclosureFor(state: A51State): DisclosedState {
  return Object.fromEntries(A51_REGISTER_ORDER.map(register => {
    const hidden = new Set(A51_GUESS_POSITIONS[register])
    return [register, stateBits(state, register).map((bit, position) => hidden.has(position) ? null : bit)]
  })) as Record<A51Register, DisclosedBit[]>
}
export function fixtureObservation(corrupt = false): Bit[] {
  const observed = stringBits(A51_RECOVERY_FIXTURE.observed)
  if (corrupt) observed[A51_RECOVERY_FIXTURE.corruptedOneBased - 1] = (observed[A51_RECOVERY_FIXTURE.corruptedOneBased - 1] ^ 1) as Bit
  return observed
}
export function fixtureHeldout(): Bit[] {
  return stringBits(A51_RECOVERY_FIXTURE.heldout)
}

export function validateDisclosure(disclosed: DisclosedState): void {
  if (!disclosed || typeof disclosed !== 'object') throw new Error('Disclosed state must contain R1, R2, and R3 bit arrays.')
  if (Object.keys(disclosed).sort().join(',') !== [...A51_REGISTER_ORDER].sort().join(',')) throw new Error('Disclosed state accepts only the R1, R2, and R3 bit arrays.')
  for (const register of A51_REGISTER_ORDER) {
    const bits = disclosed[register]
    if (!Array.isArray(bits) || bits.length !== A51_REGISTERS[register].length) throw new Error(`${register.toUpperCase()} disclosure must contain ${A51_REGISTERS[register].length} bit positions.`)
    const guessed = new Set(A51_GUESS_POSITIONS[register])
    bits.forEach((bit, position) => {
      if (guessed.has(position) ? bit !== null : bit !== 0 && bit !== 1) throw new Error(`${register.toUpperCase()} disclosure must hide exactly the declared 12 positions and disclose every other bit.`)
    })
  }
}

export function completeDisclosure(disclosed: DisclosedState, code: number): A51State {
  validateDisclosure(disclosed)
  if (!Number.isInteger(code) || code < 0 || code >= A51_COMPLETIONS) throw new Error(`Completion code must be an integer from 0 through ${A51_COMPLETIONS - 1}.`)
  let guessIndex = 0
  return Object.fromEntries(A51_REGISTER_ORDER.map(register => {
    let value = 0
    for (let position = 0; position < A51_REGISTERS[register].length; position++) {
      const disclosedBit = disclosed[register][position]
      const bit = disclosedBit === null ? (code >>> guessIndex++) & 1 : disclosedBit
      value |= bit << position
    }
    return [register, value]
  })) as Record<A51Register, number>
}

function checkedObserved(observed: readonly number[]): Bit[] {
  if (!Array.isArray(observed) || !Number.isInteger(observed.length) || observed.length < 1 || observed.length > A51_OBSERVED_BITS) throw new Error('The bounded experiment accepts 1 through 32 observed bits.')
  if (observed.some(bit => bit !== 0 && bit !== 1)) throw new Error('Observed output must be binary.')
  return [...observed] as Bit[]
}

export async function recoverCompletions(
  disclosed: DisclosedState,
  observedInput: readonly number[],
  model: A51ClockMode = 'majority',
  progress: (update: CompletionProgress) => void = () => {},
  cancelled: () => boolean = () => false,
): Promise<CompletionResult> {
  validateDisclosure(disclosed)
  const observations = checkedObserved(observedInput)
  if (model !== 'majority' && model !== 'regular') throw new Error('Recovery model must be majority or regular.')
  let candidates = Array.from({ length: A51_COMPLETIONS }, (_, code) => ({ code, start: completeDisclosure(disclosed, code), state: completeDisclosure(disclosed, code) }))
  const counts = [candidates.length]
  let bitComparisons = 0
  for (let index = 0; index < observations.length; index++) {
    const survivors: typeof candidates = []
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      if ((candidateIndex & 255) === 0 && cancelled()) throw new Error('State-completion search cancelled.')
      const candidate = candidates[candidateIndex]
      const step = clockA51(candidate.state, model)
      bitComparisons++
      if (step.output === observations[index]) survivors.push({ ...candidate, state: step.next })
    }
    candidates = survivors
    counts.push(candidates.length)
    progress({ observationsUsed: index + 1, candidates: candidates.length, totalObservations: observations.length })
    if (cancelled()) throw new Error('State-completion search cancelled.')
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  return {
    model,
    observations,
    counts,
    bitComparisons,
    completions: A51_COMPLETIONS,
    candidates: candidates.map(candidate => ({ code: candidate.code, start: candidate.start, prediction: generateA51(candidate.state, A51_HELDOUT_BITS, model).bits })),
  }
}
