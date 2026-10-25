import { describe, expect, it } from 'vitest'
import {
  AFFINE_CUBES,
  CUBES,
  HELDOUT_ROWS,
  affineEquation,
  anfCoefficients,
  candidateLabels,
  directCubeSum,
  onlineWork,
  runOnline,
  runPreprocessing,
  verifyHeldouts,
} from './analysis'
import { cubeSum, cubeVertices, keyFromRow, keyLabel, oracleDegree, publicLabel, toyOracle, type ToyKey } from './oracle'

const directOracle = (key: ToyKey, publicRow: number) => {
  const [k1, k2, k3] = key
  const [v1, v2, v3, v4] = Array.from({ length: 4 }, (_, index) => (publicRow >>> index) & 1)
  return (
    (v1 & v2 & (k1 ^ k2 ^ 1))
    ^ (v1 & v3 & (k2 ^ k3))
    ^ (v2 & v4 & (k1 ^ k2 ^ k3 ^ 1))
    ^ (v3 & v4 & ((k1 & k2) ^ k3))
    ^ (v1 & k3)
    ^ (v2 & k1)
    ^ (v4 & k2)
    ^ (k1 & k3)
  ) as 0 | 1
}

describe('bounded cube-sum oracle', () => {
  it('matches an independent direct formula on all 128 key/public inputs and has total degree four', () => {
    for (let secretRow = 0; secretRow < 8; secretRow++) {
      const key = keyFromRow(secretRow)
      for (let publicRow = 0; publicRow < 16; publicRow++) expect(toyOracle(key, publicRow)).toBe(directOracle(key, publicRow))
    }
    const coefficients: number[] = Array.from({ length: 128 }, (_, row) => directOracle(keyFromRow(row & 7), row >>> 3))
    for (let variable = 0; variable < 7; variable++) for (let mask = 0; mask < 128; mask++) if (mask & (1 << variable)) coefficients[mask] ^= coefficients[mask ^ (1 << variable)]
    const directDegree = coefficients.reduce((maximum, coefficient, mask) => coefficient ? Math.max(maximum, mask.toString(2).replaceAll('0', '').length) : maximum, 0)
    expect(directDegree).toBe(4)
    expect(oracleDegree()).toBe(4)
    expect(() => toyOracle([1, 0, 2] as unknown as ToyKey, 0)).toThrow(/three binary bits/)
    expect(() => toyOracle([1, 0, 1], 16)).toThrow(/0 through 15/)
  })

  it('enumerates every face vertex with other public inputs zero and computes all four cube sums', () => {
    expect(CUBES.map(cube => cubeVertices(cube.publicMask))).toEqual([[0, 1, 2, 3], [0, 1, 4, 5], [0, 2, 8, 10], [0, 4, 8, 12]])
    expect(CUBES.map(cube => cubeVertices(cube.publicMask).map(publicLabel))).toEqual([
      ['0000', '1000', '0100', '1100'],
      ['0000', '1000', '0010', '1010'],
      ['0000', '0100', '0001', '0101'],
      ['0000', '0010', '0001', '0011'],
    ])
    for (let row = 0; row < 8; row++) {
      const key = keyFromRow(row), [k1, k2, k3] = key
      expect(CUBES.map(cube => cubeSum(key, cube.publicMask))).toEqual([
        1 ^ k1 ^ k2,
        k2 ^ k3,
        1 ^ k1 ^ k2 ^ k3,
        (k1 & k2) ^ k3,
      ])
      expect(CUBES.map(cube => directCubeSum(key, cube.id))).toEqual(CUBES.map(cube => cubeSum(key, cube.publicMask)))
    }
    expect(() => cubeVertices(0)).toThrow(/at least one/)
  })

  it('recovers exact superpoly ANFs by exhaustive preprocessing and classifies C34 as nonlinear', () => {
    const result = runPreprocessing()
    expect(result).toMatchObject({ rawEvaluations: 128, distinctSecretPublicRows: 72 })
    expect(result.superpolys.map(entry => ({ id: entry.cube.id, expression: entry.expression, degree: entry.degree, affine: entry.affine, maxterm: entry.maxterm }))).toEqual([
      { id: 'C12', expression: '1 ⊕ k₁ ⊕ k₂', degree: 1, affine: true, maxterm: true },
      { id: 'C13', expression: 'k₂ ⊕ k₃', degree: 1, affine: true, maxterm: true },
      { id: 'C24', expression: '1 ⊕ k₁ ⊕ k₂ ⊕ k₃', degree: 1, affine: true, maxterm: true },
      { id: 'C34', expression: 'k₁k₂ ⊕ k₃', degree: 2, affine: false, maxterm: false },
    ])
    for (const superpoly of result.superpolys) {
      expect(superpoly.observations).toHaveLength(8)
      expect(superpoly.observations.every(observation => observation.outputs.length === 4)).toBe(true)
      expect(superpoly.survivingTermLabels.length + superpoly.cancelledTermLabels.length + superpoly.zeroedTermLabels.length).toBe(15)
    }
    expect(() => affineEquation(result.superpolys[3], 0)).toThrow(/nonlinear superpoly/)
    expect(() => affineEquation({ ...result.superpolys[0], coefficients: [1, 0, 0, 0, 0, 0, 0, 0] as const, degree: 0, affine: true, maxterm: false, expression: '1' }, 1)).toThrow(/nonconstant degree-one/)
    expect(() => anfCoefficients([0, 1])).toThrow(/eight binary/)
  })

  it('filters 8 to 4 to 2 to 1 candidates and recovers 110 from sums 111 at rank three', () => {
    const hidden: ToyKey = [1, 1, 0]
    const result = runOnline(row => directOracle(hidden, row), runPreprocessing())
    expect(result.observations.map(observation => observation.recordedSum)).toEqual([1, 1, 1])
    expect(result.observations.map(observation => observation.candidatesAfter.length)).toEqual([4, 2, 1])
    expect(result.observations.map(observation => observation.candidatesAfter.map(keyLabel))).toEqual([
      ['000', '001', '110', '111'],
      ['001', '110'],
      ['110'],
    ])
    expect(result.equations.map(equation => equation.expression)).toEqual(['k₁ ⊕ k₂ = 0', 'k₂ ⊕ k₃ = 1', 'k₁ ⊕ k₂ ⊕ k₃ = 0'])
    expect(result.rank).toBe(3)
    expect(result.candidates.map(keyLabel)).toEqual(['110'])
    expect(result).toMatchObject({ rawCubeEvaluations: 12, distinctPublicRows: 8 })
  })

  it('stops on the 001/110 ambiguity and rejects the wrong 000 candidate after a flipped C13 sum', () => {
    const hidden: ToyKey = [1, 1, 0], preprocessing = runPreprocessing(), query = (row: number) => directOracle(hidden, row)
    const dropped = runOnline(query, preprocessing, ['C12', 'C13'])
    expect(dropped.rank).toBe(2)
    expect(candidateLabels(dropped.candidates)).toBe('001, 110')

    const flipped = runOnline(query, preprocessing, AFFINE_CUBES, 'C13')
    expect(flipped.observations.map(observation => observation.recordedSum)).toEqual([1, 0, 1])
    expect(flipped.candidates.map(keyLabel)).toEqual(['000'])
    const check = verifyHeldouts(query, flipped.candidates[0])
    expect(check).toMatchObject({ observed: [1, 0, 1, 1], predicted: [0, 0, 0, 1], allMatch: false })
  })

  it('uses four disjoint, injective held-outs and reports 16 raw calls across 12 unique public rows', () => {
    const fingerprints = Array.from({ length: 8 }, (_, row) => {
      const key = keyFromRow(row)
      return HELDOUT_ROWS.map(publicRow => directOracle(key, publicRow)).join('')
    })
    expect(HELDOUT_ROWS.map(publicLabel)).toEqual(['0110', '1101', '1011', '1110'])
    expect(fingerprints).toEqual(['0001', '1101', '0101', '1011', '0011', '0000', '0111', '0110'])
    expect(new Set(fingerprints).size).toBe(8)

    const hidden: ToyKey = [1, 1, 0], query = (row: number) => directOracle(hidden, row)
    const online = runOnline(query, runPreprocessing()), candidate = online.candidates[0]
    const heldout = verifyHeldouts(query, candidate)
    expect(heldout).toMatchObject({ observed: [1, 0, 1, 1], predicted: [1, 0, 1, 1], allMatch: true, rawEvaluations: 4 })
    expect(new Set(online.observations.flatMap(observation => observation.vertices).filter(row => HELDOUT_ROWS.includes(row))).size).toBe(0)
    expect(onlineWork(online, heldout)).toEqual({ rawEvaluations: 16, distinctPublicRows: 12 })
    expect(() => runOnline(() => 2 as 0 | 1, runPreprocessing())).toThrow(/binary bit/)
  })
})
