import { firstUrl, linkSource, topicFromUrl } from './links'

describe('topicFromUrl', () => {
  it('reads LeetCode problem slugs as titles', () => {
    expect(topicFromUrl('https://leetcode.com/problems/number-of-islands/')).toEqual({
      title: 'Number of Islands', source: 'LeetCode', url: 'https://leetcode.com/problems/number-of-islands/',
    })
    expect(topicFromUrl('https://leetcode.com/problems/best-time-to-buy-and-sell-stock/description/?envType=study-plan')?.title)
      .toBe('Best Time to Buy and Sell Stock')
    expect(topicFromUrl('leetcode.com/problems/two-sum')?.title).toBe('Two Sum') // scheme-less paste
  })
  it('knows NeetCode, GeeksforGeeks, HackerRank, Codeforces and GitHub', () => {
    expect(topicFromUrl('https://neetcode.io/problems/duplicate-integer')).toMatchObject({ title: 'Duplicate Integer', source: 'NeetCode' })
    expect(topicFromUrl('https://www.geeksforgeeks.org/dijkstras-shortest-path-algorithm-greedy-algo-7/'))
      .toMatchObject({ title: 'Dijkstras Shortest Path Algorithm Greedy Algo', source: 'GeeksforGeeks' })
    expect(topicFromUrl('https://www.hackerrank.com/challenges/ctci-ransom-note/problem')).toMatchObject({ title: 'Ctci Ransom Note', source: 'HackerRank' })
    expect(topicFromUrl('https://codeforces.com/problemset/problem/1857/C')).toMatchObject({ title: 'Codeforces 1857C', source: 'Codeforces' })
    expect(topicFromUrl('https://codeforces.com/contest/1857/problem/C')).toMatchObject({ title: 'Codeforces 1857C' })
    expect(topicFromUrl('https://github.com/karpathy/nanoGPT')).toMatchObject({ title: 'karpathy/nanoGPT', source: 'GitHub' })
  })
  it('falls back to the last path segment, or the site name', () => {
    expect(topicFromUrl('https://jalammar.github.io/illustrated-transformer/')).toMatchObject({ title: 'Illustrated Transformer', source: 'jalammar.github.io' })
    expect(topicFromUrl('https://www.youtube.com/watch?v=kCc8FmEb1nY')).toMatchObject({ title: 'YouTube video', source: 'YouTube' })
    expect(topicFromUrl('https://youtu.be/kCc8FmEb1nY')).toMatchObject({ source: 'YouTube' })
    expect(topicFromUrl('https://docs.python.org/3/library/heapq.html')).toMatchObject({ title: 'Heapq', source: 'docs.python.org' })
    expect(topicFromUrl('https://example.com/')).toMatchObject({ title: 'example.com', source: 'example.com' })
  })
  it('returns null for things that are not links', () => {
    expect(topicFromUrl('Dijkstra')).toBeNull()
    expect(topicFromUrl('LC 200. Number of Islands')).toBeNull()
  })
})

describe('firstUrl / linkSource', () => {
  it('finds the first link in free text', () => {
    expect(firstUrl('see https://leetcode.com/problems/two-sum and https://x.dev')).toBe('https://leetcode.com/problems/two-sum')
    expect(firstUrl('no links here')).toBeNull()
    expect(firstUrl(null)).toBeNull()
  })
  it('names the source of a link', () => {
    expect(linkSource('https://leetcode.com/problems/two-sum')).toBe('LeetCode')
    expect(linkSource('https://www.medium.com/@x/post')).toBe('medium.com')
  })
})
