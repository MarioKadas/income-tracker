export const CATEGORIES = ['Salary', 'Freelance', 'Side gig', 'Interest', 'Gifts', 'Other']
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'SEK', 'PLN']

const pad = (n) => String(n).padStart(2, '0')
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => iso(new Date())

export const money = (n, cur) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n) }
  catch { return `${n.toFixed(2)} ${cur}` }
}

// Current and previous period ranges (inclusive ISO strings). Weeks start on Monday.
export function periodRanges(kind, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  let s, e, ps, pe
  if (kind === 'week') {
    const off = (now.getDay() + 6) % 7
    s = new Date(y, m, now.getDate() - off); e = new Date(y, m, s.getDate() + 6)
    ps = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7); pe = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1)
  } else if (kind === 'month') {
    s = new Date(y, m, 1); e = new Date(y, m + 1, 0)
    ps = new Date(y, m - 1, 1); pe = new Date(y, m, 0)
  } else {
    s = new Date(y, 0, 1); e = new Date(y, 11, 31)
    ps = new Date(y - 1, 0, 1); pe = new Date(y - 1, 11, 31)
  }
  return { cur: [iso(s), iso(e)], prev: [iso(ps), iso(pe)] }
}

export const sumIn = (entries, [a, b]) =>
  entries.filter((x) => x.date >= a && x.date <= b).reduce((t, x) => t + x.amount, 0)

const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
export const toCSV = (entries) =>
  ['date,amount,currency,source,category,note',
   ...entries.map((x) => [x.date, x.amount, x.currency, q(x.source), q(x.category), q(x.note)].join(','))].join('\n')

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click(); URL.revokeObjectURL(url)
}

export const uid = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random())

// Validate imported rows; returns clean entries and a count of skipped rows.
export function parseImport(text) {
  const data = JSON.parse(text)
  const rows = Array.isArray(data) ? data : data.entries
  if (!Array.isArray(rows)) throw new Error('No "entries" array found in this file.')
  const clean = [], bad = []
  rows.forEach((r) => {
    const amount = Number(r.amount)
    if (Number.isFinite(amount) && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      clean.push({ id: r.id || uid(), amount, date: r.date, source: String(r.source || ''),
        category: String(r.category || 'Other'), currency: String(r.currency || 'USD').toUpperCase(), note: String(r.note || '') })
    else bad.push(r)
  })
  return { clean, skipped: bad.length, settings: Array.isArray(data) ? null : data.settings }
}
