// Turns pasted links into readable titles from the URL alone (no network, works offline).

export interface LinkTopic { title: string; source: string; url: string }

const SOURCES: Record<string, string> = {
  'leetcode.com': 'LeetCode', 'leetcode.cn': 'LeetCode', 'neetcode.io': 'NeetCode',
  'geeksforgeeks.org': 'GeeksforGeeks', 'hackerrank.com': 'HackerRank', 'codeforces.com': 'Codeforces',
  'github.com': 'GitHub', 'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube', 'youtu.be': 'YouTube',
}

const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'from', 'vs', 'per'])

/** A whole string that is a link: with a scheme, or scheme-less "host.tld/path". */
const LINK_RE = /^(?:https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*)$/i

export const isLink = (s: string) => LINK_RE.test(s.trim())

const normalize = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`)

const hostOf = (url: URL) => url.hostname.replace(/^www\./, '')

/** "number-of-islands" → "Number of Islands" (drops trailing numeric ids like "-7"). */
function slugTitle(slug: string) {
  const words = decodeURIComponent(slug).replace(/\.[a-z0-9]+$/i, '').split(/[-_+\s]+/).filter(Boolean)
  while (words.length > 1 && /^\d+$/.test(words[words.length - 1])) words.pop()
  return words.map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}

export function linkSource(raw: string) {
  try {
    const host = hostOf(new URL(normalize(raw)))
    return SOURCES[host] ?? host
  } catch {
    return ''
  }
}

export function topicFromUrl(raw: string): LinkTopic | null {
  if (!isLink(raw)) return null
  let url: URL
  try { url = new URL(normalize(raw)) } catch { return null }
  const href = normalize(raw)
  const host = hostOf(url)
  const source = SOURCES[host] ?? host
  const seg = url.pathname.split('/').filter(Boolean)
  const after = (key: string) => { const i = seg.indexOf(key); return i >= 0 ? seg[i + 1] : undefined }

  let title: string | undefined
  if (source === 'LeetCode' || source === 'NeetCode') title = after('problems') && slugTitle(after('problems')!)
  else if (source === 'HackerRank') title = after('challenges') && slugTitle(after('challenges')!)
  else if (source === 'Codeforces') {
    const m = url.pathname.match(/\/(?:problemset\/problem|contest)\/(\d+)\/(?:problem\/)?([A-Z]\d?)/i)
    if (m) title = `Codeforces ${m[1]}${m[2].toUpperCase()}`
  } else if (source === 'GitHub' && seg.length >= 2) title = `${seg[0]}/${seg[1]}`
  else if (source === 'YouTube') title = 'YouTube video'

  title ??= seg.length ? slugTitle(seg[seg.length - 1]) : host
  return { title: title || host, source, url: href }
}

export function firstUrl(text: string | null | undefined): string | null {
  return text?.match(/https?:\/\/[^\s<>"')]+/)?.[0] ?? null
}
