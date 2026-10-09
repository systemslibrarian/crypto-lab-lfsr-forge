import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { auditContrast, formatContrastFailures } from './contrast'
import { auditNonText, formatNonTextFailures } from './nontext'
import { NONTEXT_BASELINE } from './nontext-baseline'

// Adapted from the Crypto Lab Schnorr Forge gate. Scan actual reached states.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
export const NARROW = { width: 380, height: 800 }

export function watchPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })
  return errors
}

export async function boot(page: Page): Promise<void> {
  page.setDefaultTimeout(20000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('.')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('main#app')).toHaveCount(1)
  await expect(page.locator('section.panel')).toHaveCount(5)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app')
  await expect(page.locator('details[open]')).toHaveCount(0)
  await expect(page.locator('header[role="banner"]')).toHaveCount(1)
  await expect(page.locator('[data-theme-toggle], #theme-toggle')).toHaveCount(0)
}

export async function scan(page: Page, state: string): Promise<void> {
  await expect(page.locator('#visible-view')).not.toBeEmpty()
  await expect(page.locator('#bm-view')).not.toBeEmpty()
  expect(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
    const ownText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim())
    return ownText && (element as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }) && getComputedStyle(element).opacity === '0'
  }).length), `visible text at zero opacity in ${state}`).toBe(0)
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const landmarks = await new AxeBuilder({ page }).withRules(['landmark-no-duplicate-banner', 'landmark-unique', 'landmark-one-main', 'landmark-complementary-is-top-level']).analyze()
  const violations = [...wcag.violations, ...landmarks.violations].map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target.join(' ')) }))
  expect(violations, `axe violations in ${state}`).toEqual([])
  const incomplete = [...wcag.incomplete, ...landmarks.incomplete].filter(issue => issue.id !== 'color-contrast').map(issue => issue.id)
  expect(incomplete, `unresolved axe results in ${state}`).toEqual([])
  expect(formatContrastFailures(await auditContrast(page)), `text contrast in ${state}`).toEqual([])
  const nontext = await auditNonText(page)
  const unbaselined = nontext.filter(issue => !NONTEXT_BASELINE[`${issue.kind}|${issue.selector}`])
  expect(formatNonTextFailures(unbaselined), `non-text contrast in ${state}`).toEqual([])
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(horizontalOverflow, `horizontal overflow in ${state}`).toBeLessThanOrEqual(1)
  const unreachableScrollers = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].filter(element => element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflowX !== 'visible' && element.tabIndex < 0 && !element.matches('table')).map(element => element.className || element.tagName))
  expect(unreachableScrollers, `unreachable horizontal scrollers in ${state}`).toEqual([])
}
