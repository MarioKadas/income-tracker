import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, CURRENCIES, today, money, periodRanges, sumIn, toCSV, download, uid, parseImport } from './utils.js'

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const blank = (currency) => ({ amount: '', date: today(), source: '', category: 'Salary', currency, note: '' })

function Delta({ cur, prev, currency }) {
  if (prev === 0 && cur === 0) return <span className="delta flat">no income in either period</span>
  if (prev === 0) return <span className="delta up">new: nothing in the previous period</span>
  const pct = ((cur - prev) / prev) * 100
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'
  return <span className={`delta ${cls}`}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}% vs {money(prev, currency)}</span>
}

export default function App() {
  const [entries, setEntries] = useState(() => load('it.entries', []))
  const [currency, setCurrency] = useState(() => load('it.currency', 'USD'))
  const [form, setForm] = useState(blank(currency))
  const [editId, setEditId] = useState(null)
  const [f, setF] = useState({ q: '', from: '', to: '', source: '', category: '' })
  const [msg, setMsg] = useState(null)
  const fileRef = useRef()

  useEffect(() => localStorage.setItem('it.entries', JSON.stringify(entries)), [entries])
  useEffect(() => localStorage.setItem('it.currency', JSON.stringify(currency)), [currency])

  // Currencies in use, so totals are never mixed across currencies.
  const used = useMemo(() => [...new Set([currency, ...entries.map((e) => e.currency)])], [entries, currency])
  const sources = useMemo(() => [...new Set(entries.map((e) => e.source).filter(Boolean))].sort(), [entries])
  const mine = useMemo(() => entries.filter((e) => e.currency === currency), [entries, currency])

  const periods = useMemo(() => ['week', 'month', 'year'].map((k) => {
    const r = periodRanges(k)
    return { k, cur: sumIn(mine, r.cur), prev: sumIn(mine, r.prev) }
  }), [mine])

  const filtered = useMemo(() => {
    const t = f.q.trim().toLowerCase()
    return entries.filter((e) =>
      (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to) &&
      (!f.source || e.source === f.source) && (!f.category || e.category === f.category) &&
      (!t || [e.source, e.category, e.note, e.currency, String(e.amount)].some((v) => v.toLowerCase().includes(t)))
    ).sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, f])

  const breakdown = (key) => {
    const m = {}
    mine.forEach((e) => { const k = e[key] || 'Unspecified'; m[k] = (m[k] || 0) + e.amount })
    const total = Object.values(m).reduce((a, b) => a + b, 0)
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, v, pct: total ? (v / total) * 100 : 0 }))
  }
  const byCat = useMemo(() => breakdown('category'), [mine])
  const bySrc = useMemo(() => breakdown('source').slice(0, 6), [mine])

  const set = (k) => (ev) => setForm({ ...form, [k]: ev.target.value })
  const submit = (ev) => {
    ev.preventDefault()
    const amount = Number(form.amount)
    if (!(amount > 0)) return setMsg({ err: true, t: 'Enter an amount greater than zero.' })
    const row = { ...form, amount, source: form.source.trim() }
    setEntries(editId ? entries.map((e) => (e.id === editId ? { ...row, id: editId } : e)) : [...entries, { ...row, id: uid() }])
    setMsg({ t: editId ? 'Entry updated.' : 'Entry added.' })
    setEditId(null); setForm(blank(currency))
  }
  const edit = (e) => { setEditId(e.id); setForm({ ...e, amount: String(e.amount) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const remove = (e) => { if (confirm(`Delete ${money(e.amount, e.currency)} from ${e.source || e.category}?`)) setEntries(entries.filter((x) => x.id !== e.id)) }

  const onImport = async (ev) => {
    const file = ev.target.files[0]; ev.target.value = ''
    if (!file) return
    try {
      const { clean, skipped } = parseImport(await file.text())
      const have = new Set(entries.map((e) => e.id))
      const fresh = clean.filter((e) => !have.has(e.id))
      setEntries([...entries, ...fresh])
      setMsg({ t: `Imported ${fresh.length} entries. ${clean.length - fresh.length} duplicates and ${skipped} invalid rows skipped.` })
    } catch (err) { setMsg({ err: true, t: `Import failed: ${err.message}` }) }
  }

  const stamp = today()
  return (
    <main>
      <header className="top">
        <h1>Income tracker</h1>
        <div className="tools">
          <label className="inline">Totals in
            <select value={currency} onChange={(e) => { setCurrency(e.target.value); if (!editId) setForm((x) => ({ ...x, currency: e.target.value })) }}>
              {[...new Set([...used, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <button onClick={() => download(`income-${stamp}.csv`, toCSV(entries), 'text/csv')} disabled={!entries.length}>Export CSV</button>
          <button onClick={() => download(`income-${stamp}.json`, JSON.stringify({ version: 1, entries }, null, 2), 'application/json')} disabled={!entries.length}>Export JSON</button>
          <button onClick={() => fileRef.current.click()}>Import JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      </header>

      {msg && <p className={`msg ${msg.err ? 'err' : ''}`} role="status" onClick={() => setMsg(null)}>{msg.t}</p>}

      <section className="totals" aria-label="Totals">
        {periods.map((p) => (
          <div className="total" key={p.k}>
            <span className="label">This {p.k}</span>
            <strong>{money(p.cur, currency)}</strong>
            <Delta cur={p.cur} prev={p.prev} currency={currency} />
          </div>
        ))}
        {used.length > 1 && <p className="note">Totals only include entries in {currency}. Switch currency above to see the others.</p>}
      </section>

      <section className="split">
        <form onSubmit={submit} className="panel">
          <h2>{editId ? 'Edit income' : 'Add income'}</h2>
          <div className="row">
            <label>Amount<input type="number" step="0.01" min="0" inputMode="decimal" value={form.amount} onChange={set('amount')} required /></label>
            <label>Currency<select value={form.currency} onChange={set('currency')}>{[...new Set([...used, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <div className="row">
            <label>Date<input type="date" value={form.date} onChange={set('date')} required /></label>
            <label>Category<select value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <label>Source<input list="sources" value={form.source} onChange={set('source')} placeholder="Employer, client, bank…" /></label>
          <datalist id="sources">{sources.map((s) => <option key={s} value={s} />)}</datalist>
          <label>Note (optional)<input value={form.note} onChange={set('note')} /></label>
          <div className="row">
            <button className="primary" type="submit">{editId ? 'Save changes' : 'Add income'}</button>
            {editId && <button type="button" onClick={() => { setEditId(null); setForm(blank(currency)) }}>Cancel</button>}
          </div>
        </form>

        <div className="panel">
          <h2>Where it comes from <small>({currency})</small></h2>
          {!byCat.length ? <p className="empty">Add an entry in {currency} to see the breakdown.</p> : (
            <>
              {byCat.map((c) => (
                <div className="bar" key={c.name}>
                  <div className="barhead"><span>{c.name}</span><span>{money(c.v, currency)} · {c.pct.toFixed(0)}%</span></div>
                  <div className="track"><i style={{ width: `${c.pct}%` }} /></div>
                </div>
              ))}
              <h3>Top sources</h3>
              <ul className="srcs">{bySrc.map((s) => <li key={s.name}><span>{s.name}</span><span>{money(s.v, currency)}</span></li>)}</ul>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>History <small>({filtered.length} of {entries.length})</small></h2>
        <div className="filters">
          <input type="search" placeholder="Search…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search" />
          <label className="inline">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="inline">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="Source"><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <button onClick={() => setF({ q: '', from: '', to: '', source: '', category: '' })}>Clear</button>
        </div>
        {!filtered.length ? <p className="empty">{entries.length ? 'No entries match these filters.' : 'No income yet. Add your first entry above.'}</p> : (
          <div className="scroll">
            <table>
              <thead><tr><th>Date</th><th>Source</th><th>Category</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.source || '—'}{e.note && <small className="n">{e.note}</small>}</td>
                    <td><span className="tag">{e.category}</span></td>
                    <td className="r amt">{money(e.amount, e.currency)}</td>
                    <td className="r acts"><button onClick={() => edit(e)}>Edit</button><button className="danger" onClick={() => remove(e)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
