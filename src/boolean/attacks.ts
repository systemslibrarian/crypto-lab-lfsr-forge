import { berlekampMasseyTrace, forecast } from '../lfsr/bm'
import { connection, generate, type Bit } from '../lfsr/lfsr'
import { BOOLEAN_PRESETS, validateTruthTable } from './analysis'

export type RegisterProfile = { name: string; degree: number; taps: number[] }
export type RankedState = { packed: number; matches: number; total: number }
export type RankedPair = { left: number; right: number; matches: number; total: number }
export type ScanResult<T> = { ranking: T[]; leaders: T[]; bitComparisons: number }
export type ParityModel = { observed: Bit[]; length: number; coefficients: Bit[]; prediction: Bit[] }

export const BOOLEAN_REGISTERS: readonly RegisterProfile[] = [
  { name: 'R1', degree: 3, taps: [1, 3] },
  { name: 'R2', degree: 4, taps: [1, 4] },
  { name: 'R3', degree: 5, taps: [2, 5] },
  { name: 'R4', degree: 7, taps: [1, 7] },
]

const assertObserved = (observed: readonly number[]): Bit[] => {
  if (!observed.length || observed.length > 300) throw new Error('A bounded scan requires 1 through 300 observed bits.')
  if (observed.some(bit => bit !== 0 && bit !== 1)) throw new Error('Observed output must be binary.')
  return [...observed] as Bit[]
}

export function packedToRegister(packed: number, degree: number): Bit[] {
  if (!Number.isInteger(packed) || packed <= 0 || packed >= 2 ** degree) throw new Error(`Packed state must be from 1 through ${2 ** degree - 1}.`)
  return Array.from({ length: degree }, (_, index) => ((packed >>> index) & 1) as Bit)
}

function registerBits(profile: RegisterProfile, packed: number, count: number): Bit[] {
  return generate(connection(profile.degree, profile.taps), packedToRegister(packed, profile.degree), count).bits
}

export function combineTable(truthValues: readonly number[], inputs: readonly (readonly number[])[]): Bit[] {
  const truth = validateTruthTable(truthValues)
  if (inputs.length !== 4 || inputs.some(bits => bits.length !== inputs[0].length)) throw new Error('The combiner requires four equally long input sequences.')
  if (inputs.some(bits => bits.some(bit => bit !== 0 && bit !== 1))) throw new Error('Combiner inputs must be binary.')
  return Array.from({ length: inputs[0].length }, (_, index) => {
    const row = inputs.reduce((mask, bits, variable) => mask | (bits[index] << variable), 0)
    return truth[row]
  })
}

export function deterministicCombinerOutput(truthValues: readonly number[], count: number): Bit[] {
  if (!Number.isInteger(count) || count < 0) throw new Error('Output length must be a nonnegative integer.')
  const inputs = BOOLEAN_REGISTERS.map(profile => registerBits(profile, 1, count))
  return combineTable(truthValues, inputs)
}

export function scanSingleRegister(observedValues: readonly number[]): ScanResult<RankedState> {
  const observed = assertObserved(observedValues)
  const profile = BOOLEAN_REGISTERS[3]
  const ranking: RankedState[] = []
  for (let packed = 1; packed < 2 ** profile.degree; packed++) {
    const candidate = registerBits(profile, packed, observed.length)
    const matches = candidate.reduce<number>((sum, bit, index) => sum + Number(bit === observed[index]), 0)
    ranking.push({ packed, matches, total: observed.length })
  }
  ranking.sort((left, right) => right.matches - left.matches || left.packed - right.packed)
  const leaders = ranking.filter(candidate => candidate.matches === ranking[0].matches)
  return { ranking, leaders, bitComparisons: ranking.length * observed.length }
}

export function scanRegisterPair(observedValues: readonly number[]): ScanResult<RankedPair> {
  const observed = assertObserved(observedValues)
  const leftProfile = BOOLEAN_REGISTERS[0]
  const rightProfile = BOOLEAN_REGISTERS[1]
  const ranking: RankedPair[] = []
  const leftSequences = Array.from({ length: 2 ** leftProfile.degree - 1 }, (_, index) => registerBits(leftProfile, index + 1, observed.length))
  const rightSequences = Array.from({ length: 2 ** rightProfile.degree - 1 }, (_, index) => registerBits(rightProfile, index + 1, observed.length))
  for (let left = 1; left < 2 ** leftProfile.degree; left++) for (let right = 1; right < 2 ** rightProfile.degree; right++) {
    const matches = observed.reduce<number>((sum, bit, index) => sum + Number((leftSequences[left - 1][index] ^ rightSequences[right - 1][index]) === bit), 0)
    ranking.push({ left, right, matches, total: observed.length })
  }
  ranking.sort((a, b) => b.matches - a.matches || a.left - b.left || a.right - b.right)
  const leaders = ranking.filter(candidate => candidate.matches === ranking[0].matches)
  return { ranking, leaders, bitComparisons: ranking.length * observed.length }
}

export function fitParityModel(observedValues: readonly number[]): ParityModel {
  const observed = assertObserved(observedValues)
  const fit = berlekampMasseyTrace(observed)
  return { observed, length: fit.length, coefficients: [...fit.coefficients], prediction: forecast(observed, fit.coefficients, fit.length, 64) }
}

export function deterministicAttackFixture(kind: 'single' | 'pair' | 'parity', count: number): Bit[] {
  const key = kind === 'single' ? 'correlated' : kind === 'pair' ? 'resilient' : 'parity'
  return deterministicCombinerOutput(BOOLEAN_PRESETS[key].truth, count)
}
