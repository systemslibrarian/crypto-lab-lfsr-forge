import type { Bit, Connection } from '../lfsr/lfsr'
import { combine, GEFFE, geffeBits, type GeffeStates } from './geffe'

export interface RankedState { packed: number; matches: number; total: number }
export interface CandidateTriple { r1: number; r2: number; r3: number }
export interface AttackMetrics {
  r1StatesScored: number
  r3StatesScored: number
  pairAttempts: number
  r2StatesTested: number
  fullPrefixChecks: number
  bitComparisons: number
  elapsedMs: number
}
export interface PairEvidence {
  r1: number
  r3: number
  constrainedPositions: number
  selectorIndices: number[]
  equalPositions: number
  contradictionAt: number | null
}
export interface CorrelationResult {
  r1Ranking: RankedState[]
  r3Ranking: RankedState[]
  leadingR1: RankedState[]
  leadingR3: RankedState[]
  pairs: PairEvidence[]
  survivors: CandidateTriple[]
  metrics: AttackMetrics
  exhausted: boolean
  prediction: Bit[] | null
}
export interface AttackBudget { leadingR1: number; leadingR3: number; maxPairs: number; maxR2Tests: number; horizon: number }
export const DEFAULT_BUDGET: AttackBudget = { leadingR1: 4, leadingR3: 4, maxPairs: 16, maxR2Tests: 32752, horizon: 64 }

export function packedToState(value: number, degree: number): Bit[] {
  return Array.from({ length: degree }, (_, index) => ((value >> index) & 1) as Bit)
}

export function stateToPacked(state: readonly Bit[]): number {
  return state.reduce<number>((value, bit, index) => value | (bit << index), 0)
}

function packedOutput(coefficients: Connection, packed: number, count: number): Bit[] {
  const degree = coefficients.length - 1
  const bits: Bit[] = []
  let state = packed
  for (let index = 0; index < count; index++) {
    bits.push((state & 1) as Bit)
    let feedback = 0
    for (let tap = 1; tap <= degree; tap++) if (coefficients[tap]) feedback ^= (state >> (degree - tap)) & 1
    state = (state >> 1) | (feedback << (degree - 1))
  }
  return bits
}

export function deriveSelectorConstraints(observed: readonly Bit[], x1: readonly Bit[], x3: readonly Bit[]): { required: (Bit | null)[]; contradictionAt: number | null; equalPositions: number } {
  if (observed.length !== x1.length || observed.length !== x3.length) throw new Error('Inputs must be aligned.')
  const required: (Bit | null)[] = []
  let contradictionAt: number | null = null
  let equalPositions = 0
  for (let index = 0; index < observed.length; index++) {
    if (x1[index] === x3[index]) {
      equalPositions++
      required.push(null)
      if (observed[index] !== x1[index] && contradictionAt === null) contradictionAt = index
    } else required.push((observed[index] ^ x3[index]) as Bit)
  }
  return { required, contradictionAt, equalPositions }
}

function leadingWithTies(ranking: RankedState[], count: number): RankedState[] {
  const cutoff = ranking[Math.min(count, ranking.length) - 1]?.matches
  return ranking.filter(candidate => candidate.matches >= cutoff)
}

function assertBudget(budget: AttackBudget): void {
  if (![budget.leadingR1, budget.leadingR3, budget.maxPairs, budget.maxR2Tests, budget.horizon].every(value => Number.isInteger(value) && value > 0)) throw new Error('Search budgets must be positive integers.')
}

// The attack only receives public polynomials, a copied output prefix, and budgets.
export async function correlationAttack(
  observed: readonly Bit[],
  budget: AttackBudget = DEFAULT_BUDGET,
  progress?: (phase: string, done: number, total: number) => void,
  cancelled?: () => boolean,
): Promise<CorrelationResult> {
  assertBudget(budget)
  if (!observed.length || !observed.every(bit => bit === 0 || bit === 1)) throw new Error('Supply a nonempty binary capture.')
  const started = performance.now()
  const metrics: AttackMetrics = { r1StatesScored: 0, r3StatesScored: 0, pairAttempts: 0, r2StatesTested: 0, fullPrefixChecks: 0, bitComparisons: 0, elapsedMs: 0 }
  const yieldWork = () => new Promise<void>(resolve => setTimeout(resolve, 0))
  const scan = async (coefficients: Connection, phase: 'R1' | 'R3'): Promise<RankedState[]> => {
    const ranking: RankedState[] = []
    const total = 2 ** (coefficients.length - 1) - 1
    for (let packed = 1; packed <= total; packed++) {
      if (cancelled?.()) throw new DOMException('Search cancelled', 'AbortError')
      const bits = packedOutput(coefficients, packed, observed.length)
      let matches = 0
      for (let index = 0; index < observed.length; index++) matches += Number(bits[index] === observed[index])
      metrics.bitComparisons += observed.length
      if (phase === 'R1') metrics.r1StatesScored++
      else metrics.r3StatesScored++
      ranking.push({ packed, matches, total: observed.length })
      if (packed % 128 === 0) { progress?.(phase, packed, total); await yieldWork() }
    }
    progress?.(phase, total, total)
    return ranking.sort((a, b) => b.matches - a.matches || a.packed - b.packed)
  }
  const r1Ranking = await scan(GEFFE.r1, 'R1')
  const r3Ranking = await scan(GEFFE.r3, 'R3')
  const leadingR1 = leadingWithTies(r1Ranking, budget.leadingR1)
  const leadingR3 = leadingWithTies(r3Ranking, budget.leadingR3)
  const pairCandidates = leadingR1.flatMap(a => leadingR3.map(c => ({ a, c, score: a.matches + c.matches })))
    .sort((left, right) => right.score - left.score || left.a.packed - right.a.packed || left.c.packed - right.c.packed)
  const pairs: PairEvidence[] = []
  const survivors: CandidateTriple[] = []
  let exhausted = pairCandidates.length > budget.maxPairs
  for (const pair of pairCandidates.slice(0, budget.maxPairs)) {
    if (cancelled?.()) throw new DOMException('Search cancelled', 'AbortError')
    metrics.pairAttempts++
    const x1 = packedOutput(GEFFE.r1, pair.a.packed, observed.length)
    const x3 = packedOutput(GEFFE.r3, pair.c.packed, observed.length)
    const constraints = deriveSelectorConstraints(observed, x1, x3)
    metrics.bitComparisons += observed.length
    pairs.push({ r1: pair.a.packed, r3: pair.c.packed, constrainedPositions: observed.length - constraints.equalPositions, selectorIndices: constraints.required.flatMap((bit, index) => bit === null ? [] : [index]), equalPositions: constraints.equalPositions, contradictionAt: constraints.contradictionAt })
    if (constraints.contradictionAt !== null) continue
    for (let r2 = 1; r2 < 2 ** 11; r2++) {
      if (metrics.r2StatesTested >= budget.maxR2Tests) { exhausted = true; break }
      if (cancelled?.()) throw new DOMException('Search cancelled', 'AbortError')
      metrics.r2StatesTested++
      const x2 = packedOutput(GEFFE.r2, r2, observed.length)
      if (r2 % 128 === 0) { progress?.('R2', metrics.r2StatesTested, budget.maxR2Tests); await yieldWork() }
      let valid = true
      for (let index = 0; index < observed.length; index++) {
        if (constraints.required[index] === null) continue
        metrics.bitComparisons++
        if (x2[index] !== constraints.required[index]) { valid = false; break }
      }
      if (!valid) continue
      metrics.fullPrefixChecks++
      for (let index = 0; index < observed.length; index++) {
        metrics.bitComparisons++
        if (combine(x1[index], x2[index], x3[index]) !== observed[index]) { valid = false; break }
      }
      if (valid) survivors.push({ r1: pair.a.packed, r2, r3: pair.c.packed })
    }
    if (exhausted && metrics.r2StatesTested >= budget.maxR2Tests) break
  }
  metrics.elapsedMs = performance.now() - started
  let prediction: Bit[] | null = null
  if (survivors.length === 1) {
    const candidate = survivors[0]
    const states: GeffeStates = { r1: packedToState(candidate.r1, 7), r2: packedToState(candidate.r2, 11), r3: packedToState(candidate.r3, 13) }
    // Reconstruct the candidate's entire continuation from clock zero.
    prediction = geffeBits(states, observed.length + budget.horizon).slice(observed.length)
  }
  return { r1Ranking, r3Ranking, leadingR1, leadingR3, pairs, survivors, metrics, exhausted, prediction }
}

// [extension] A future fast correlation attack can consume the same copied-prefix contract.
