import type { Bit, Connection } from './lfsr'

export interface BmStep {
  index: number
  processed: number
  input: Bit
  discrepancy: Bit
  beforeC: readonly Bit[]
  afterC: readonly Bit[]
  beforeB: readonly Bit[]
  afterB: readonly Bit[]
  beforeLength: number
  afterLength: number
  beforeLastLengthUpdate: number
  afterLastLengthUpdate: number
  shift: number
}

export interface BmResult {
  length: number
  coefficients: readonly Bit[]
  trace: readonly BmStep[]
}

function checked(bits: readonly number[]): asserts bits is readonly Bit[] {
  if (!bits.every(bit => bit === 0 || bit === 1)) throw new Error('BM accepts only binary symbols.')
}

export function berlekampMasseyTrace(bits: readonly number[]): BmResult {
  checked(bits)
  let C: Bit[] = [1]
  let B: Bit[] = [1]
  let length = 0
  let lastLengthUpdate = -1
  const trace: BmStep[] = []
  for (let index = 0; index < bits.length; index++) {
    let discrepancy = bits[index]
    for (let lag = 1; lag < C.length && lag <= index; lag++) discrepancy = (discrepancy ^ (C[lag] & bits[index - lag])) as Bit
    const beforeC = [...C]
    const beforeB = [...B]
    const beforeLength = length
    const beforeLastLengthUpdate = lastLengthUpdate
    const shift = discrepancy ? index - lastLengthUpdate : 0
    if (discrepancy) {
      const updated = [...C]
      while (updated.length < B.length + shift) updated.push(0)
      for (let lag = 0; lag < B.length; lag++) updated[lag + shift] = (updated[lag + shift] ^ B[lag]) as Bit
      while (updated.length > 1 && updated.at(-1) === 0) updated.pop()
      C = updated
      if (2 * length <= index) {
        length = index + 1 - length
        B = beforeC
        lastLengthUpdate = index
      }
    }
    trace.push({ index, processed: index + 1, input: bits[index], discrepancy, beforeC, afterC: [...C], beforeB, afterB: [...B], beforeLength, afterLength: length, beforeLastLengthUpdate, afterLastLengthUpdate: lastLengthUpdate, shift })
  }
  return { length, coefficients: C, trace }
}

export function forecast(prefix: readonly number[], coefficients: Connection, length: number, horizon: number): Bit[] {
  checked(prefix)
  if (!Number.isInteger(length) || length < 0 || length > prefix.length || !Number.isInteger(horizon) || horizon < 0) throw new Error('Invalid prediction length or horizon.')
  const result = [...prefix]
  for (let index = 0; index < horizon; index++) {
    let next: Bit = 0
    for (let lag = 1; lag <= length; lag++) next = (next ^ ((coefficients[lag] ?? 0) & result[result.length - lag])) as Bit
    result.push(next)
  }
  return result.slice(prefix.length) as Bit[]
}
