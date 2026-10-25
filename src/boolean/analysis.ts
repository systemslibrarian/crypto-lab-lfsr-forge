import type { Bit } from '../lfsr/lfsr'

export const BOOLEAN_INPUTS = 4
export const BOOLEAN_ROWS = 1 << BOOLEAN_INPUTS

export type BooleanPresetKey = 'parity' | 'bent' | 'resilient' | 'correlated'
export type Restriction = {
  subsetMask: number
  fixedVariables: number[]
  assignment: Bit[]
  ones: number
  total: number
  independent: boolean
}
export type AnnihilatorWitness = {
  side: 'f' | '1+f'
  degree: number
  monomialMasks: number[]
  expression: string
  values: Bit[]
  product: Bit[]
}
export type AlgebraicImmunity = {
  degree: number
  candidatesPerSide: number
  candidatesTotal: number
  witness: AnnihilatorWitness
}
export type BooleanAnalysis = {
  truth: Bit[]
  weight: number
  balanced: boolean
  anf: Bit[]
  anfExpression: string
  degree: number
  walsh: number[]
  nonlinearity: number
  correlationImmunity: number
  restrictionOrder: number
  checksAgree: boolean
  resiliency: number | null
  restrictions: Restriction[]
  algebraicImmunity: AlgebraicImmunity
}

const popcount = (value: number): number => {
  let count = 0
  for (let current = value; current; current >>>= 1) count += current & 1
  return count
}

export function validateTruthTable(values: readonly number[]): Bit[] {
  if (values.length !== BOOLEAN_ROWS) throw new Error('A four-input truth table must contain exactly 16 outputs.')
  if (values.some(value => value !== 0 && value !== 1)) throw new Error('Truth-table outputs must be binary.')
  return [...values] as Bit[]
}

export function inputBits(row: number): Bit[] {
  if (!Number.isInteger(row) || row < 0 || row >= BOOLEAN_ROWS) throw new Error('Truth-table row must be an integer from 0 through 15.')
  return Array.from({ length: BOOLEAN_INPUTS }, (_, index) => ((row >>> index) & 1) as Bit)
}

export function maskLabel(mask: number): string {
  if (!Number.isInteger(mask) || mask < 0 || mask >= BOOLEAN_ROWS) throw new Error('Mask must be an integer from 0 through 15.')
  return mask === 0 ? '0' : inputBits(mask).flatMap((bit, index) => bit ? [`x${index + 1}`] : []).join(' ⊕ ')
}

export function subsetLabel(mask: number): string {
  if (!Number.isInteger(mask) || mask <= 0 || mask >= BOOLEAN_ROWS) throw new Error('A fixed subset mask must be an integer from 1 through 15.')
  return `{${inputBits(mask).flatMap((bit, index) => bit ? [`x${index + 1}`] : []).join(', ')}}`
}

export function anfCoefficients(values: readonly number[]): Bit[] {
  const coefficients = validateTruthTable(values)
  for (let variable = 0; variable < BOOLEAN_INPUTS; variable++) {
    const bit = 1 << variable
    for (let mask = 0; mask < BOOLEAN_ROWS; mask++) if (mask & bit) coefficients[mask] = (coefficients[mask] ^ coefficients[mask ^ bit]) as Bit
  }
  return coefficients
}

export function polynomialValues(monomialMasks: readonly number[]): Bit[] {
  if (monomialMasks.some(mask => !Number.isInteger(mask) || mask < 0 || mask >= BOOLEAN_ROWS)) throw new Error('Monomial masks must be integers from 0 through 15.')
  return Array.from({ length: BOOLEAN_ROWS }, (_, row) => monomialMasks.reduce((value, mask) => value ^ Number((row & mask) === mask), 0) as Bit)
}

export function formatAnfMasks(monomialMasks: readonly number[]): string {
  if (!monomialMasks.length) return '0'
  return monomialMasks.map(mask => mask === 0 ? '1' : inputBits(mask).flatMap((bit, index) => bit ? [`x${index + 1}`] : []).join('')).join(' ⊕ ')
}

export function walshSpectrum(values: readonly number[]): number[] {
  const truth = validateTruthTable(values)
  const spectrum: number[] = truth.map(value => value ? -1 : 1)
  for (let stride = 1; stride < BOOLEAN_ROWS; stride <<= 1) {
    for (let block = 0; block < BOOLEAN_ROWS; block += 2 * stride) {
      for (let offset = 0; offset < stride; offset++) {
        const left = spectrum[block + offset]
        const right = spectrum[block + offset + stride]
        spectrum[block + offset] = left + right
        spectrum[block + offset + stride] = left - right
      }
    }
  }
  return spectrum
}

export function enumerateRestrictions(values: readonly number[]): Restriction[] {
  const truth = validateTruthTable(values)
  const weight = truth.reduce<number>((sum, bit) => sum + bit, 0)
  const restrictions: Restriction[] = []
  for (let subsetMask = 1; subsetMask < BOOLEAN_ROWS; subsetMask++) {
    const fixedVariables = inputBits(subsetMask).flatMap((bit, index) => bit ? [index] : [])
    for (let assignmentCode = 0; assignmentCode < 2 ** fixedVariables.length; assignmentCode++) {
      const assignment = fixedVariables.map((_, index) => ((assignmentCode >>> index) & 1) as Bit)
      let encoded = 0
      fixedVariables.forEach((variable, index) => { encoded |= assignment[index] << variable })
      let ones = 0
      for (let row = 0; row < BOOLEAN_ROWS; row++) if ((row & subsetMask) === encoded) ones += truth[row]
      restrictions.push({
        subsetMask,
        fixedVariables,
        assignment,
        ones,
        total: 1 << (BOOLEAN_INPUTS - fixedVariables.length),
        independent: ones * (1 << fixedVariables.length) === weight,
      })
    }
  }
  return restrictions
}

function maximumOrder(predicate: (mask: number) => boolean): number {
  let order = 0
  for (let candidate = 1; candidate <= BOOLEAN_INPUTS; candidate++) {
    if (Array.from({ length: BOOLEAN_ROWS - 1 }, (_, index) => index + 1).filter(mask => popcount(mask) <= candidate).every(predicate)) order = candidate
    else break
  }
  return order
}

function polynomialFromChoice(eligible: readonly number[], choice: number): number[] {
  return eligible.filter((_, index) => (choice >>> index) & 1)
}

export function boundedAlgebraicImmunity(values: readonly number[]): AlgebraicImmunity {
  const truth = validateTruthTable(values)
  let best: AnnihilatorWitness | null = null
  let candidatesPerSide = 0
  for (let degree = 0; degree <= 2; degree++) {
    const eligible = Array.from({ length: BOOLEAN_ROWS }, (_, mask) => mask)
      .filter(mask => popcount(mask) <= degree)
      .sort((left, right) => popcount(left) - popcount(right) || left - right)
    const previousCount = eligible.filter(mask => popcount(mask) < degree).length
    for (let choice = 1; choice < 2 ** eligible.length; choice++) {
      if (degree > 0 && (choice >>> previousCount) === 0) continue
      candidatesPerSide++
      const monomialMasks = polynomialFromChoice(eligible, choice)
      const candidate = polynomialValues(monomialMasks)
      for (const side of ['f', '1+f'] as const) {
        const product = candidate.map((bit, row) => (bit & (side === 'f' ? truth[row] : 1 ^ truth[row])) as Bit)
        if (!product.some(Boolean) && (!best || degree < best.degree)) best = { side, degree, monomialMasks, expression: formatAnfMasks(monomialMasks), values: candidate, product }
      }
    }
  }
  if (!best) throw new Error('No degree-at-most-two annihilator found; the exhaustive four-input bound was violated.')
  return { degree: best.degree, candidatesPerSide, candidatesTotal: 2 * candidatesPerSide, witness: best }
}

export function analyzeBoolean(values: readonly number[]): BooleanAnalysis {
  const truth = validateTruthTable(values)
  const weight = truth.reduce<number>((sum, bit) => sum + bit, 0)
  const anf = anfCoefficients(truth)
  const monomialMasks = anf.flatMap((coefficient, mask) => coefficient ? [mask] : [])
  const degree = monomialMasks.reduce((maximum, mask) => Math.max(maximum, popcount(mask)), 0)
  const walsh = walshSpectrum(truth)
  const maxWalsh = Math.max(...walsh.map(Math.abs))
  const correlationImmunity = maximumOrder(mask => walsh[mask] === 0)
  const restrictions = enumerateRestrictions(truth)
  const restrictionOrder = maximumOrder(mask => restrictions.filter(entry => entry.subsetMask === mask).every(entry => entry.independent))
  const balanced = weight === BOOLEAN_ROWS / 2
  return {
    truth,
    weight,
    balanced,
    anf,
    anfExpression: formatAnfMasks(monomialMasks),
    degree,
    walsh,
    nonlinearity: BOOLEAN_ROWS / 2 - maxWalsh / 2,
    correlationImmunity,
    restrictionOrder,
    checksAgree: correlationImmunity === restrictionOrder,
    resiliency: balanced ? correlationImmunity : null,
    restrictions,
    algebraicImmunity: boundedAlgebraicImmunity(truth),
  }
}

const fromAnf = (...monomialMasks: number[]): Bit[] => polynomialValues(monomialMasks)

export const BOOLEAN_PRESETS: Record<BooleanPresetKey, { label: string; truth: Bit[]; expression: string }> = {
  parity: { label: 'Parity: correlation immune but linear', truth: fromAnf(1, 2, 4, 8), expression: 'x1 ⊕ x2 ⊕ x3 ⊕ x4' },
  bent: { label: 'Bent: maximum nonlinearity but unbalanced', truth: fromAnf(3, 12), expression: 'x1x2 ⊕ x3x4' },
  resilient: { label: 'Order-1 resilient with order-2 correlation', truth: fromAnf(1, 2, 12), expression: 'x1 ⊕ x2 ⊕ x3x4' },
  correlated: { label: 'AI 2 with a single-register correlation', truth: fromAnf(3, 5, 8), expression: 'x1x2 ⊕ x1x3 ⊕ x4' },
}
