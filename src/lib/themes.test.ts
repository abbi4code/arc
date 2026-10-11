// Every theme must stay readable: checks WCAG contrast of the color tokens defined in index.css.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEMES } from './theme'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

function tokens(id: string): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-theme="${id}"\\][^{]*\\{([^}]*)\\}`))
  if (!block) throw new Error(`no CSS block for theme ${id}`)
  return Object.fromEntries([...block[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe.each(THEMES.map((t) => t.id))('theme %s', (id) => {
  const t = tokens(id)

  it('defines every token', () => {
    for (const k of ['bg', 'panel', 'panel-2', 'fg', 'muted', 'faint', 'accent', 'accent-fg', 'danger'])
      expect(t[k], k).toMatch(/^#/)
  })
  it('body text is strong but not glaring (10–17:1)', () => {
    for (const surface of ['bg', 'panel']) {
      const c = contrast(t.fg, t[surface])
      expect(c, `fg on ${surface}`).toBeGreaterThanOrEqual(10)
      expect(c, `fg on ${surface}`).toBeLessThanOrEqual(17)
    }
  })
  it('secondary and hint text meet WCAG AA (4.5:1) on every surface', () => {
    for (const text of ['muted', 'faint'])
      for (const surface of ['bg', 'panel', 'panel-2'])
        expect(contrast(t[text], t[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5)
  })
  it('accent is readable as text and as a button', () => {
    expect(contrast(t.accent, t.bg), 'accent text on bg').toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['accent-fg'], t.accent), 'button label on accent').toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.danger, t.panel), 'danger on panel').toBeGreaterThanOrEqual(4.5)
  })
})
