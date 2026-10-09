import { describe, expect, it } from 'vitest'
import { characteristic, clock, connection, generate, parseBits, period, PRIMITIVE_TAPS, type Bit } from './lfsr'
import { berlekampMasseyTrace, forecast } from './bm'

describe('register mechanics and registry', () => {
  it('outputs before the shift, uses chronological state order, and preserves split runs', () => {
    const c = connection(3, [1, 3])
    expect(clock(c, [1, 0, 0])).toEqual({ output: 1, feedback: 1, next: [0, 0, 1], terms: [0, 0, 1] })
    const whole = generate(c, [1, 0, 0], 15)
    const first = generate(c, [1, 0, 0], 6)
    const second = generate(c, first.state, 9)
    expect([...first.bits, ...second.bits]).toEqual(whole.bits)
    expect(whole.bits.slice(0, 5)).toEqual([1, 0, 0, 1, 1])
    expect(characteristic(connection(5, [2, 5]))).toBe('1 + X^3 + X^5 (reciprocal of degree 5)')
  })
  it('each shipped connection has exactly its stated primitive period and crosses the boundary', () => {
    for (const [degreeText, taps] of Object.entries(PRIMITIVE_TAPS)) {
      const degree = Number(degreeText)
      const c = connection(degree, taps)
      const initial: Bit[] = [1, ...Array<Bit>(degree - 1).fill(0)]
      expect(period(c, initial)).toBe(2 ** degree - 1)
      const bits = generate(c, initial, 2 ** degree)
      expect(bits.state).toEqual(clock(c, initial).next)
      expect(bits.bits.at(-1)).toBe(initial[0])
    }
  })
  it('rejects zero states and malformed symbols but allows zero observed prefixes', () => {
    expect(() => generate(connection(3, [1, 3]), [0, 0, 0], 1)).toThrow(/nonzero/)
    expect(() => parseBits('01x')).toThrow(/only 0 and 1/)
    expect(parseBits('0, 0 1')).toEqual([0, 0, 1])
    expect(berlekampMasseyTrace([0, 0, 0]).length).toBe(0)
  })
})

describe('binary Berlekamp–Massey', () => {
  it('matches HAC Example 6.33/Table 6.1, including every intermediate row', () => {
    const bits = [0, 0, 1, 1, 0, 1, 1, 1, 0]
    const result = berlekampMasseyTrace(bits)
    expect(result.length).toBe(5)
    expect(result.coefficients).toEqual([1, 0, 0, 1, 0, 1])
    expect(result.trace.map(row => row.afterLength)).toEqual([0, 0, 3, 3, 3, 3, 3, 5, 5])
    expect(result.trace.map(row => row.discrepancy)).toEqual([0, 0, 1, 1, 1, 1, 0, 1, 1])
    expect(result.trace.map(row => row.afterLastLengthUpdate)).toEqual([-1, -1, 2, 2, 2, 2, 2, 7, 7])
    expect(result.trace.map(row => row.afterC)).toEqual([
      [1], [1], [1, 0, 0, 1], [1, 1, 0, 1], [1, 1, 1, 1],
      [1, 1, 1], [1, 1, 1], [1, 1, 1, 0, 0, 1], [1, 0, 0, 1, 0, 1],
    ])
    expect(result.trace[2].beforeC).toEqual([1])
    expect(result.trace[2].afterC).toEqual([1, 0, 0, 1])
    expect(result.trace[5].afterC.length - 1).toBeLessThan(result.trace[5].afterLength)
    expect(Object.isFrozen(result.trace)).toBe(true)
    expect(Object.isFrozen(result.trace[2])).toBe(true)
    expect(Object.isFrozen(result.trace[2].afterC)).toBe(true)
  })

  it('agrees with an independent brute-force shortest-recurrence oracle on every sequence through 8 bits', () => {
    const brute = (bits: number[]): number => {
      for (let length = 0; length <= bits.length; length++) {
        const candidates = 2 ** length
        for (let mask = 0; mask < candidates; mask++) {
          let valid = true
          for (let index = length; index < bits.length; index++) {
            let predicted = 0
            for (let lag = 1; lag <= length; lag++) if ((mask >> (lag - 1)) & 1) predicted ^= bits[index - lag]
            if (predicted !== bits[index]) { valid = false; break }
          }
          if (valid) return length
        }
      }
      return bits.length
    }
    for (let size = 0; size <= 8; size++) for (let value = 0; value < 2 ** size; value++) {
      const bits = Array.from({ length: size }, (_, index) => (value >> index) & 1)
      const fitted = berlekampMasseyTrace(bits)
      expect(fitted.length, `sequence ${bits.join('')}`).toBe(brute(bits))
      for (let index = fitted.length; index < bits.length; index++) {
        let expected = 0
        for (let lag = 1; lag <= fitted.length; lag++) expected ^= (fitted.coefficients[lag] ?? 0) & bits[index - lag]
        expect(expected, `fit ${bits.join('')} at ${index}`).toBe(bits[index])
      }
    }
  })

  it('handles edge prefixes and honest early success/failure', () => {
    expect(berlekampMasseyTrace([]).length).toBe(0)
    expect(berlekampMasseyTrace([1, 1, 1, 1]).coefficients).toEqual([1, 1])
    expect(() => berlekampMasseyTrace([0, 2])).toThrow(/binary/)
    const source = generate(connection(3, [1, 3]), [1, 0, 0], 70).bits
    const four = source.slice(0, 4), five = source.slice(0, 5)
    const fourBm = berlekampMasseyTrace(four), fiveBm = berlekampMasseyTrace(five)
    expect(forecast(four, fourBm.coefficients, fourBm.length, 64)).not.toEqual(source.slice(4, 68))
    expect(forecast(five, fiveBm.coefficients, fiveBm.length, 64)).toEqual(source.slice(5, 69))
    const ambiguous = generate(connection(3, [2, 3]), [1, 0, 0], 5).bits
    expect(ambiguous.slice(0, 4)).toEqual(source.slice(0, 4))
    expect(ambiguous[4]).not.toBe(source[4])
  })

  it('recovers every supported hidden degree at the declared 24-bit target', () => {
    for (const [degreeText, taps] of Object.entries(PRIMITIVE_TAPS)) {
      const degree = Number(degreeText)
      const coefficients = connection(degree, taps)
      const seeds: Bit[][] = [
        [1, ...Array<Bit>(degree - 1).fill(0)],
        Array.from({ length: degree }, (_, index) => (index % 3 === 0 ? 1 : 0) as Bit),
      ]
      for (const seed of seeds) {
        const full = generate(coefficients, seed, 88).bits
        const prefix = full.slice(0, 24)
        const fitted = berlekampMasseyTrace(prefix)
        expect(fitted.length).toBe(degree)
        expect(fitted.coefficients).toEqual(coefficients)
        expect(forecast(prefix, fitted.coefficients, fitted.length, 64)).toEqual(full.slice(24))
        expect(prefix.slice(0, degree)).toEqual(seed)
      }
    }
  })
})
