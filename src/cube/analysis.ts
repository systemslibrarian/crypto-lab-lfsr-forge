import type { Bit } from '../lfsr/lfsr'
import { ORACLE_TERMS, cubeSum, cubeVertices, keyFromRow, keyLabel, popcount, survivingTerms, toyOracle, type ToyKey } from './oracle'

export type CubeId = 'C12' | 'C13' | 'C24' | 'C34'

export type CubeDefinition = Readonly<{
  id: CubeId
  publicMask: number
  variables: string
}>

export type PublicOracle = (publicRow: number) => Bit

export const CUBES: readonly CubeDefinition[] = [
  { id: 'C12', publicMask: 0b0011, variables: '{v₁, v₂}' },
  { id: 'C13', publicMask: 0b0101, variables: '{v₁, v₃}' },
  { id: 'C24', publicMask: 0b1010, variables: '{v₂, v₄}' },
  { id: 'C34', publicMask: 0b1100, variables: '{v₃, v₄}' },
]

export const AFFINE_CUBES: readonly CubeId[] = ['C12', 'C13', 'C24']
export const HELDOUT_ROWS: readonly number[] = [0b0110, 0b1011, 0b1101, 0b0111]

export type PreprocessingObservation = Readonly<{
  key: ToyKey
  outputs: readonly Bit[]
  sum: Bit
}>

export type Superpoly = Readonly<{
  cube: CubeDefinition
  coefficients: readonly Bit[]
  degree: number
  expression: string
  affine: boolean
  maxterm: boolean
  observations: readonly PreprocessingObservation[]
  survivingTermLabels: readonly string[]
  cancelledTermLabels: readonly string[]
  zeroedTermLabels: readonly string[]
}>

export type PreprocessingResult = Readonly<{
  superpolys: readonly Superpoly[]
  rawEvaluations: number
  distinctSecretPublicRows: number
}>

export type AffineEquation = Readonly<{
  cube: CubeId
  coefficients: readonly [Bit, Bit, Bit]
  constant: Bit
  observed: Bit
  rhs: Bit
  expression: string
}>

export type OnlineObservation = Readonly<{
  cube: CubeDefinition
  vertices: readonly number[]
  outputs: readonly Bit[]
  actualSum: Bit
  recordedSum: Bit
  equation: AffineEquation
  candidatesAfter: readonly ToyKey[]
}>

export type OnlineResult = Readonly<{
  observations: readonly OnlineObservation[]
  equations: readonly AffineEquation[]
  rank: number
  candidates: readonly ToyKey[]
  rawCubeEvaluations: number
  distinctPublicRows: number
}>

export type HeldoutResult = Readonly<{
  rows: readonly number[]
  observed: readonly Bit[]
  predicted: readonly Bit[]
  matches: readonly boolean[]
  allMatch: boolean
  rawEvaluations: number
}>

export function anfCoefficients(values: readonly number[]): Bit[] {
  if (values.length !== 8 || values.some(bit => bit !== 0 && bit !== 1)) throw new Error('A three-bit truth table must contain exactly eight binary values.')
  const coefficients = [...values] as Bit[]
  for (let variable = 0; variable < 3; variable++) {
    for (let mask = 0; mask < 8; mask++) if (mask & (1 << variable)) coefficients[mask] = (coefficients[mask] ^ coefficients[mask ^ (1 << variable)]) as Bit
  }
  return coefficients
}

export function formatSuperpoly(coefficients: readonly number[]): string {
  if (coefficients.length !== 8 || coefficients.some(bit => bit !== 0 && bit !== 1)) throw new Error('Superpoly coefficients must contain exactly eight binary values.')
  const terms = coefficients.flatMap((coefficient, mask) => {
    if (!coefficient) return []
    if (mask === 0) return ['1']
    return [Array.from({ length: 3 }, (_, index) => mask & (1 << index) ? `k${'\u2081\u2082\u2083'[index]}` : '').join('')]
  })
  return terms.join(' ⊕ ') || '0'
}

export function runPreprocessing(): PreprocessingResult {
  const distinct = new Set<string>()
  let rawEvaluations = 0
  const superpolys = CUBES.map(cube => {
    const vertices = cubeVertices(cube.publicMask)
    const observations = Array.from({ length: 8 }, (_, secretRow): PreprocessingObservation => {
      const key = keyFromRow(secretRow)
      const outputs = vertices.map(publicRow => {
        rawEvaluations++
        distinct.add(`${secretRow}:${publicRow}`)
        return toyOracle(key, publicRow)
      })
      return { key, outputs, sum: outputs.reduce<number>((sum, bit) => sum ^ bit, 0) as Bit }
    })
    const coefficients = anfCoefficients(observations.map(entry => entry.sum))
    const degree = coefficients.reduce<number>((maximum, coefficient, mask) => coefficient ? Math.max(maximum, popcount(mask)) : maximum, 0)
    return {
      cube,
      coefficients,
      degree,
      expression: formatSuperpoly(coefficients),
      affine: degree <= 1,
      maxterm: degree === 1,
      observations,
      survivingTermLabels: survivingTerms(cube.publicMask).map(term => term.label),
      cancelledTermLabels: ORACLE_TERMS.filter(term => term.publicMask !== cube.publicMask && (term.publicMask & ~cube.publicMask) === 0).map(term => term.label),
      zeroedTermLabels: ORACLE_TERMS.filter(term => (term.publicMask & ~cube.publicMask) !== 0).map(term => term.label),
    }
  })
  return { superpolys, rawEvaluations, distinctSecretPublicRows: distinct.size }
}

function superpolyFor(preprocessing: PreprocessingResult, cube: CubeId): Superpoly {
  const result = preprocessing.superpolys.find(entry => entry.cube.id === cube)
  if (!result) throw new Error(`Missing preprocessing result for ${cube}.`)
  return result
}

export function affineEquation(superpoly: Superpoly, observed: Bit): AffineEquation {
  if (!superpoly.affine || superpoly.coefficients.some((coefficient, mask) => coefficient && popcount(mask) > 1)) throw new Error(`${superpoly.cube.id} has a nonlinear superpoly and cannot enter affine recovery.`)
  if (!superpoly.maxterm) throw new Error(`${superpoly.cube.id} does not have a nonconstant degree-one superpoly and cannot enter affine recovery.`)
  const coefficients = [superpoly.coefficients[1], superpoly.coefficients[2], superpoly.coefficients[4]] as [Bit, Bit, Bit]
  const constant = superpoly.coefficients[0]
  const rhs = (observed ^ constant) as Bit
  const left = coefficients.flatMap((coefficient, index) => coefficient ? [`k${'\u2081\u2082\u2083'[index]}`] : []).join(' ⊕ ') || '0'
  return { cube: superpoly.cube.id, coefficients, constant, observed, rhs, expression: `${left} = ${rhs}` }
}

function satisfies(key: ToyKey, equation: AffineEquation): boolean {
  return equation.coefficients.reduce<number>((sum, coefficient, index) => sum ^ (coefficient & key[index]), 0) === equation.rhs
}

export function matrixRank(equations: readonly AffineEquation[]): number {
  const rows = equations.map(equation => equation.coefficients[0] | (equation.coefficients[1] << 1) | (equation.coefficients[2] << 2))
  let rank = 0
  for (let column = 0; column < 3; column++) {
    const pivot = rows.findIndex((row, index) => index >= rank && (row & (1 << column)) !== 0)
    if (pivot < 0) continue
    ;[rows[rank], rows[pivot]] = [rows[pivot], rows[rank]]
    for (let row = 0; row < rows.length; row++) if (row !== rank && (rows[row] & (1 << column))) rows[row] ^= rows[rank]
    rank++
  }
  return rank
}

export function solveAffine(equations: readonly AffineEquation[]): ToyKey[] {
  return Array.from({ length: 8 }, (_, row) => keyFromRow(row))
    .filter(key => equations.every(equation => satisfies(key, equation)))
    .sort((left, right) => keyLabel(left).localeCompare(keyLabel(right)))
}

export function runOnline(
  query: PublicOracle,
  preprocessing: PreprocessingResult,
  cubeIds: readonly CubeId[] = AFFINE_CUBES,
  flipCube?: CubeId,
): OnlineResult {
  const distinctRows = new Set<number>()
  const equations: AffineEquation[] = []
  const observations = cubeIds.map(cubeId => {
    const superpoly = superpolyFor(preprocessing, cubeId)
    const vertices = cubeVertices(superpoly.cube.publicMask)
    vertices.forEach(row => distinctRows.add(row))
    const outputs = vertices.map(row => {
      const output = query(row)
      if (output !== 0 && output !== 1) throw new Error('Public oracle must return a binary bit.')
      return output
    })
    const actualSum = outputs.reduce<number>((sum, bit) => sum ^ bit, 0) as Bit
    const recordedSum = (actualSum ^ Number(flipCube === cubeId)) as Bit
    const equation = affineEquation(superpoly, recordedSum)
    equations.push(equation)
    return { cube: superpoly.cube, vertices, outputs, actualSum, recordedSum, equation, candidatesAfter: solveAffine(equations) }
  })
  return {
    observations,
    equations,
    rank: matrixRank(equations),
    candidates: solveAffine(equations),
    rawCubeEvaluations: observations.reduce((sum, observation) => sum + observation.vertices.length, 0),
    distinctPublicRows: distinctRows.size,
  }
}

export function verifyHeldouts(query: PublicOracle, candidate: ToyKey): HeldoutResult {
  keyLabel(candidate)
  const observed = HELDOUT_ROWS.map(row => {
    const output = query(row)
    if (output !== 0 && output !== 1) throw new Error('Public oracle must return a binary bit.')
    return output
  })
  const predicted = HELDOUT_ROWS.map(row => toyOracle(candidate, row))
  const matches = observed.map((bit, index) => bit === predicted[index])
  return { rows: HELDOUT_ROWS, observed, predicted, matches, allMatch: matches.every(Boolean), rawEvaluations: HELDOUT_ROWS.length }
}

export function onlineWork(online: OnlineResult, heldout?: HeldoutResult): Readonly<{ rawEvaluations: number; distinctPublicRows: number }> {
  const rows = new Set(online.observations.flatMap(observation => observation.vertices))
  heldout?.rows.forEach(row => rows.add(row))
  return { rawEvaluations: online.rawCubeEvaluations + (heldout?.rawEvaluations ?? 0), distinctPublicRows: rows.size }
}

export function candidateLabels(candidates: readonly ToyKey[]): string {
  return candidates.map(keyLabel).join(', ')
}

export function directCubeSum(key: ToyKey, cube: CubeId): Bit {
  const definition = CUBES.find(entry => entry.id === cube)
  if (!definition) throw new Error(`Unknown cube ${cube}.`)
  return cubeSum(key, definition.publicMask)
}
