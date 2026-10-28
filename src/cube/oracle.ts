import type { Bit } from '../lfsr/lfsr'

export type ToyKey = readonly [Bit, Bit, Bit]

export type OracleTerm = Readonly<{
  publicMask: number
  secretMask: number
  label: string
}>

// ePrint 2008/385 (Dinur and Shamir, "Cube Attacks on Tweakable Black Box
// Polynomials"), Section 1, displays the introductory master polynomial
//   P(v1, v2, v3, x1, x2, x3) = v1v2v3 + v1v2x1 + v1v3x1 + v2v3x1 + v1v2x3
//     + v1v3x2 + v2v3x2 + v1v3x3 + v1x1x3 + v3x2x3 + x1x2x3 + v1v2 + v1x3
//     + v3x1 + x1x2 + x2x3 + x2 + v1 + v3 + 1
// and then states that "summing the four derived polynomials with v3 = 0 we
// get x1 + x3". Summing over v1, v2 in {0, 1} with v3 = 0 keeps exactly the
// terms divisible by v1v2, namely v1v2x1 + v1v2x3 + v1v2, whose coefficient
// is x1 + x3 + 1: the printed sum omits the constant 1 that the standalone
// v1v2 term contributes. The paper's other two printed sums, x1 + x2 for
// v1 = 0 and x1 + x2 + x3 for v2 = 0, agree with the displayed polynomial.
// Checked against the ePrint PDF on 2026-10-27; cube.test.ts recomputes all
// three sums. This lesson therefore uses the independently checkable oracle
// below rather than reproducing that fixture.
export const ORACLE_TERMS: readonly OracleTerm[] = [
  { publicMask: 0b0011, secretMask: 0b001, label: 'v₁v₂k₁' },
  { publicMask: 0b0011, secretMask: 0b010, label: 'v₁v₂k₂' },
  { publicMask: 0b0011, secretMask: 0b000, label: 'v₁v₂' },
  { publicMask: 0b0101, secretMask: 0b010, label: 'v₁v₃k₂' },
  { publicMask: 0b0101, secretMask: 0b100, label: 'v₁v₃k₃' },
  { publicMask: 0b1010, secretMask: 0b001, label: 'v₂v₄k₁' },
  { publicMask: 0b1010, secretMask: 0b010, label: 'v₂v₄k₂' },
  { publicMask: 0b1010, secretMask: 0b100, label: 'v₂v₄k₃' },
  { publicMask: 0b1010, secretMask: 0b000, label: 'v₂v₄' },
  { publicMask: 0b1100, secretMask: 0b011, label: 'v₃v₄k₁k₂' },
  { publicMask: 0b1100, secretMask: 0b100, label: 'v₃v₄k₃' },
  { publicMask: 0b0001, secretMask: 0b100, label: 'v₁k₃' },
  { publicMask: 0b0010, secretMask: 0b001, label: 'v₂k₁' },
  { publicMask: 0b1000, secretMask: 0b010, label: 'v₄k₂' },
  { publicMask: 0b0000, secretMask: 0b101, label: 'k₁k₃' },
]

export const ORACLE_EXPRESSION = 'v₁v₂(k₁ ⊕ k₂ ⊕ 1) ⊕ v₁v₃(k₂ ⊕ k₃) ⊕ v₂v₄(k₁ ⊕ k₂ ⊕ k₃ ⊕ 1) ⊕ v₃v₄(k₁k₂ ⊕ k₃) ⊕ v₁k₃ ⊕ v₂k₁ ⊕ v₄k₂ ⊕ k₁k₃'

export function popcount(value: number): number {
  let count = 0
  for (let current = value; current; current >>>= 1) count += current & 1
  return count
}

function validateRow(row: number, maximum: number, name: string): void {
  if (!Number.isInteger(row) || row < 0 || row >= maximum) throw new Error(`${name} must be an integer from 0 through ${maximum - 1}.`)
}

export function keyFromRow(row: number): ToyKey {
  validateRow(row, 8, 'Secret row')
  return [row & 1, (row >>> 1) & 1, (row >>> 2) & 1] as ToyKey
}

export function keyRow(key: readonly number[]): number {
  if (key.length !== 3 || key.some(bit => bit !== 0 && bit !== 1)) throw new Error('Toy key must contain exactly three binary bits.')
  return key[0] | (key[1] << 1) | (key[2] << 2)
}

export function keyLabel(key: readonly number[]): string {
  keyRow(key)
  return key.join('')
}

export function publicBits(row: number): readonly [Bit, Bit, Bit, Bit] {
  validateRow(row, 16, 'Public row')
  return [row & 1, (row >>> 1) & 1, (row >>> 2) & 1, (row >>> 3) & 1].map(bit => bit as Bit) as [Bit, Bit, Bit, Bit]
}

export function publicLabel(row: number): string {
  return publicBits(row).join('')
}

export function toyOracle(key: ToyKey, publicRow: number): Bit {
  const secretRow = keyRow(key)
  validateRow(publicRow, 16, 'Public row')
  return ORACLE_TERMS.reduce<number>((sum, term) => sum ^ Number(
    (publicRow & term.publicMask) === term.publicMask
      && (secretRow & term.secretMask) === term.secretMask,
  ), 0) as Bit
}

export function cubeVertices(cubeMask: number): number[] {
  validateRow(cubeMask, 16, 'Cube mask')
  if (cubeMask === 0) throw new Error('Cube mask must select at least one public variable.')
  const variables = Array.from({ length: 4 }, (_, index) => index).filter(index => cubeMask & (1 << index))
  return Array.from({ length: 2 ** variables.length }, (_, assignment) => variables.reduce(
    (row, variable, index) => row | (((assignment >>> index) & 1) << variable),
    0,
  ))
}

export function cubeOutputs(key: ToyKey, cubeMask: number): Bit[] {
  return cubeVertices(cubeMask).map(row => toyOracle(key, row))
}

export function cubeSum(key: ToyKey, cubeMask: number): Bit {
  return cubeOutputs(key, cubeMask).reduce<number>((sum, bit) => sum ^ bit, 0) as Bit
}

export function oracleDegree(): number {
  return Math.max(...ORACLE_TERMS.map(term => popcount(term.publicMask) + popcount(term.secretMask)))
}

export function survivingTerms(cubeMask: number): readonly OracleTerm[] {
  cubeVertices(cubeMask)
  // Every non-cube public variable is fixed to zero. Terms missing a cube
  // variable cancel; terms with an extra public variable evaluate to zero.
  return ORACLE_TERMS.filter(term => term.publicMask === cubeMask)
}
