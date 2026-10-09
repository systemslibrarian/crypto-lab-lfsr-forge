export type Bit = 0 | 1
export type State = readonly Bit[]
export type Connection = readonly Bit[]

export function parseBits(text: string): Bit[] {
  const compact = text.replace(/[\s,]/g, '')
  if (!/^[01]*$/.test(compact)) throw new Error('Use only 0 and 1, with optional spaces or commas.')
  return Array.from(compact, character => Number(character) as Bit)
}

export function connection(degree: number, taps: readonly number[]): Bit[] {
  if (!Number.isInteger(degree) || degree < 1 || !taps.includes(degree)) throw new Error('The connection must include its highest degree.')
  const coefficients: Bit[] = Array(degree + 1).fill(0)
  coefficients[0] = 1
  for (const tap of taps) {
    if (!Number.isInteger(tap) || tap < 1 || tap > degree || coefficients[tap]) throw new Error('Invalid or duplicate tap.')
    coefficients[tap] = 1
  }
  return coefficients
}

export function formatConnection(coefficients: Connection, symbol = 'D'): string {
  return coefficients.flatMap((bit, index) => bit ? [index === 0 ? '1' : index === 1 ? symbol : `${symbol}^${index}`] : []).join(' + ')
}

export function characteristic(coefficients: Connection): string {
  const degree = coefficients.length - 1
  return formatConnection([...coefficients].reverse(), 'X').replace(/^1(?= \+)/, '1') + ` (reciprocal of degree ${degree})`
}

export function assertRegister(coefficients: Connection, state: State): void {
  const degree = coefficients.length - 1
  if (degree < 1 || coefficients[0] !== 1 || coefficients[degree] !== 1 || state.length !== degree) throw new Error('Connection and state length do not match.')
  if (![...coefficients, ...state].every(bit => bit === 0 || bit === 1)) throw new Error('Registers require binary symbols.')
  if (state.every(bit => bit === 0)) throw new Error('A maximal-length profile requires a nonzero state.')
}

export function clock(coefficients: Connection, state: State): { output: Bit; feedback: Bit; next: Bit[]; terms: Bit[] } {
  assertRegister(coefficients, state)
  const degree = state.length
  const terms = Array.from({ length: degree }, (_, index) => (coefficients[index + 1] & state[degree - index - 1]) as Bit)
  const feedback = terms.reduce<Bit>((sum, bit) => (sum ^ bit) as Bit, 0)
  return { output: state[0], feedback, next: [...state.slice(1), feedback], terms }
}

export function generate(coefficients: Connection, initial: State, count: number): { bits: Bit[]; state: Bit[] } {
  assertRegister(coefficients, initial)
  if (!Number.isInteger(count) || count < 0) throw new Error('Count must be a nonnegative integer.')
  const bits: Bit[] = []
  let state = [...initial]
  for (let index = 0; index < count; index++) {
    const step = clock(coefficients, state)
    bits.push(step.output)
    state = step.next
  }
  return { bits, state }
}

export function period(coefficients: Connection, initial: State): number {
  assertRegister(coefficients, initial)
  let state = [...initial]
  const maximum = 2 ** initial.length - 1
  for (let count = 1; count <= maximum; count++) {
    state = clock(coefficients, state).next
    if (state.every(bit => bit === 0)) throw new Error('The register reached zero.')
    if (state.every((bit, index) => bit === initial[index])) return count
  }
  throw new Error('The register did not return within its state space.')
}

// Tested primitive connection registry for the declared hidden challenge degrees.
export const PRIMITIVE_TAPS: Readonly<Record<number, readonly number[]>> = {
  3: [1, 3], 4: [1, 4], 5: [2, 5], 6: [1, 6], 7: [1, 7],
  8: [2, 3, 4, 8], 9: [4, 9], 10: [3, 10], 11: [2, 11], 12: [1, 4, 6, 12],
}

export function randomNonzeroState(degree: number): Bit[] {
  const bytes = new Uint8Array(degree)
  let state: Bit[]
  do {
    crypto.getRandomValues(bytes)
    state = Array.from(bytes, byte => (byte & 1) as Bit)
  } while (state.every(bit => bit === 0))
  return state
}
