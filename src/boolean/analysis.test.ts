import { describe, expect, it } from 'vitest'
import { analyzeBoolean, anfCoefficients, BOOLEAN_PRESETS, enumerateRestrictions, inputBits, polynomialValues, subsetLabel, validateTruthTable, walshSpectrum } from './analysis'

const truthFromInteger = (value: number) => Array.from({ length: 16 }, (_, row) => (value >>> row) & 1)
const parity = (value: number) => {
  let result = 0
  for (let current = value; current; current >>>= 1) result ^= current & 1
  return result
}

describe('exact four-input Boolean analysis', () => {
  it('matches independent direct Walsh and ANF evaluations for all 65,536 truth tables', () => {
    for (let encoded = 0; encoded < 2 ** 16; encoded++) {
      const truth = truthFromInteger(encoded)
      const walsh = Array.from({ length: 16 }, (_, mask) => truth.reduce<number>((sum, output, row) => sum + (output ^ parity(row & mask) ? -1 : 1), 0))
      expect(walshSpectrum(truth)).toEqual(walsh)
      const coefficients = anfCoefficients(truth)
      const reconstructed = Array.from({ length: 16 }, (_, row) => coefficients.reduce<number>((sum, coefficient, monomial) => sum ^ (coefficient & Number((row & monomial) === monomial)), 0))
      expect(reconstructed).toEqual(truth)
    }
  }, 20000)

  it('reports the four counterexample presets with exact spectra-derived metrics', () => {
    const expected = {
      parity: { weight: 8, degree: 1, nonlinearity: 0, correlationImmunity: 3, resiliency: 3, ai: 1 },
      bent: { weight: 6, degree: 2, nonlinearity: 6, correlationImmunity: 0, resiliency: null, ai: 2 },
      resilient: { weight: 8, degree: 2, nonlinearity: 4, correlationImmunity: 1, resiliency: 1, ai: 2 },
      correlated: { weight: 8, degree: 2, nonlinearity: 4, correlationImmunity: 0, resiliency: 0, ai: 2 },
    } as const
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      const result = analyzeBoolean(BOOLEAN_PRESETS[key].truth)
      const { ai, ...metrics } = expected[key]
      expect(result).toMatchObject({ ...metrics, algebraicImmunity: { degree: ai, candidatesPerSide: 2047, candidatesTotal: 4094 } })
      expect(result.checksAgree).toBe(true)
      expect(result.restrictionOrder).toBe(result.correlationImmunity)
      expect(result.algebraicImmunity.witness.values.some(Boolean)).toBe(true)
      expect(result.algebraicImmunity.witness.product).toEqual(Array(16).fill(0))
      expect(polynomialValues(result.algebraicImmunity.witness.monomialMasks)).toEqual(result.algebraicImmunity.witness.values)
    }
    expect(analyzeBoolean(BOOLEAN_PRESETS.resilient.truth).walsh[3]).toBe(8)
    expect(analyzeBoolean(BOOLEAN_PRESETS.correlated.truth).walsh[8]).toBe(8)
    for (const constant of [0, 1] as const) {
      const result = analyzeBoolean(Array(16).fill(constant))
      expect(result).toMatchObject({ degree: 0, correlationImmunity: 4, resiliency: null, algebraicImmunity: { degree: 0 } })
      expect(result.algebraicImmunity.witness.expression).toBe('1')
      expect(result.algebraicImmunity.witness.product).toEqual(Array(16).fill(0))
    }
  })

  it('independently counts every fixed-subset slice and catches a failed order', () => {
    const truth = BOOLEAN_PRESETS.resilient.truth
    const restrictions = enumerateRestrictions(truth)
    for (const entry of restrictions) {
      const encoded = entry.fixedVariables.reduce((value, variable, index) => value | (entry.assignment[index] << variable), 0)
      const rows = Array.from({ length: 16 }, (_, row) => row).filter(row => (row & entry.subsetMask) === encoded)
      expect(entry.total).toBe(rows.length)
      expect(entry.ones).toBe(rows.reduce((sum, row) => sum + truth[row], 0))
      expect(entry.independent).toBe(entry.ones * 2 ** entry.fixedVariables.length === 8)
    }
    expect(restrictions.filter(entry => entry.subsetMask === 1).every(entry => entry.independent)).toBe(true)
    expect(restrictions.filter(entry => entry.subsetMask === 3).every(entry => entry.independent)).toBe(false)
  })

  it('uses the declared row order and rejects values outside the bounded model', () => {
    expect(inputBits(13)).toEqual([1, 0, 1, 1])
    expect(subsetLabel(13)).toBe('{x1, x3, x4}')
    expect(() => inputBits(16)).toThrow(/0 through 15/)
    expect(() => validateTruthTable(Array(15).fill(0))).toThrow(/exactly 16/)
    expect(() => validateTruthTable([...Array(15).fill(0), 2])).toThrow(/binary/)
  })
})
