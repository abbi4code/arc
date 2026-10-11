import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronLeft, Copy, Download, Eye, EyeOff, Fingerprint, KeyRound, Lock, Plus, Search, ShieldCheck, Trash2, X,
} from 'lucide-react'
import { Button, Field, Input } from '@/components/primitives'
import { Sheet } from '@/components/Sheet'
import { useAuth } from '@/lib/auth'
import { useMutations, useVault, useVaultItems, type VaultItemRow } from '@/lib/data'
import { aad, decryptEntry, encryptEntry, type VaultEntry, type VaultField } from '@/lib/vault/crypto'
import { passkeysSupported } from '@/lib/vault/passkey'
import { copySecret, useAutoLock, useVaultKey, vaultSession } from '@/lib/vault/session'
import { addPasskey, deleteVault, deviceLabel, removePasskey, replaceRecoveryKey, setupVault, unlock, type Meta, type Proof } from '@/lib/vault/vault'
import { cn } from '@/lib/ui'

const CATEGORIES = ['Bank', 'Email', 'Social', 'Work', 'Shopping', 'Other']
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong.'

export default function VaultPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const meta = useVault()
  const key = useVaultKey()
  const [recoveryToShow, setRecoveryToShow] = useState<string | null>(null)
  const qc = useQueryClient()
  useAutoLock(!!key)

  let body: ReactNode
  if (meta.isLoading) body = null
  else if (meta.error) body = <p className="text-sm text-danger">Couldn't load the vault: {errMsg(meta.error)}</p>
  else if (recoveryToShow) body = <RecoveryKeyStep recoveryKey={recoveryToShow} onDone={() => setRecoveryToShow(null)} />
  else if (!meta.data?.vault) body = <Setup userId={userId} onCreated={(k, rk) => { vaultSession.unlock(k); setRecoveryToShow(rk); qc.invalidateQueries({ queryKey: ['vault'] }) }} />
  else if (!key) body = <Locked userId={userId} meta={meta.data} />
  else body = <Unlocked userId={userId} vk={key} meta={meta.data} onNewRecoveryKey={setRecoveryToShow} />

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6">
      <Link to="/settings" className="-ml-1 mb-3 inline-flex items-center gap-0.5 text-xs text-muted hover:text-fg"><ChevronLeft size={14} /> Settings</Link>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound size={20} className="text-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">Passwords</h1>
        </div>
        {key && !recoveryToShow && <Button variant="subtle" onClick={() => vaultSession.lock()}><Lock size={14} /> Lock</Button>}
      </header>
      {body}
    </div>
  )
}

// ── Setup ───────────────────────────────────────────────────────────────────
function Setup({ userId, onCreated }: { userId: string; onCreated: (k: CryptoKey, recoveryKey: string) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { passkeysSupported().then(setSupported) }, [])

  const create = async () => {
    setBusy(true)
    try {
      const { key, recoveryKey } = await setupVault(userId)
      onCreated(key, recoveryKey)
    } catch (e) { toast.error('Vault not created', { description: errMsg(e) }) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <ShieldCheck className="text-accent" size={22} />
      <h2 className="mt-3 text-base font-semibold">An encrypted vault for your passwords</h2>
      <ul className="mt-3 grid gap-2 text-sm text-muted md:text-[13px]">
        <li>• Everything is encrypted <span className="text-fg">on this device</span> before it's saved. The server only stores unreadable data.</li>
        <li>• Unlock with <span className="text-fg">Face ID / Touch ID</span>. The passkey syncs to your Mac through iCloud Keychain.</li>
        <li>• You'll get a <span className="text-fg">recovery key</span> for when Face ID isn't available. Save it somewhere safe.</li>
        <li>• If you lose both the passkey and the recovery key, <span className="text-fg">nobody can recover the vault</span>, not even the app.</li>
      </ul>
      <Button variant="primary" className="mt-5 w-full sm:w-auto" disabled={busy || supported === false} onClick={create}>
        <Fingerprint size={16} /> {busy ? 'Waiting for Face ID…' : 'Create vault with Face ID'}
      </Button>
      {supported === false && <p className="mt-2 text-xs text-danger">Face ID / Touch ID passkeys aren't available in this browser. Set up the vault on your iPhone or Mac.</p>}
    </div>
  )
}

function RecoveryKeyStep({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState('')
  const last4 = recoveryKey.slice(-4)
  const ok = confirm.trim().toUpperCase() === last4
  const download = () => {
    const blob = new Blob([`Winter Arc vault recovery key\n\n${recoveryKey}\n\nKeep this private. It can unlock your password vault.\n`], { type: 'text/plain' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'winter-arc-recovery-key.txt' })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-base font-semibold">Save your recovery key</h2>
      <p className="mt-1 text-sm text-muted md:text-[13px]">It unlocks the vault if Face ID isn't available. It's shown <span className="text-fg">only now</span>. Keep it in Apple Notes (locked), a password-protected file, or on paper.</p>
      {/* <wbr> lets it wrap only between groups, without adding characters when selected/copied */}
      <p data-testid="recovery-key" className="tabular mt-4 select-all rounded-lg border border-line bg-panel-2 p-3 font-mono text-sm leading-relaxed tracking-wide">
        {recoveryKey.split('-').map((g, i) => <span key={i}>{i > 0 && '-'}<wbr />{g}</span>)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="subtle" onClick={() => copySecret(recoveryKey, 120_000).then(() => toast('Recovery key copied'))}><Copy size={14} /> Copy</Button>
        <Button variant="subtle" onClick={download}><Download size={14} /> Download .txt</Button>
      </div>
      <form className="mt-5 grid gap-2" onSubmit={(e) => { e.preventDefault(); if (ok) onDone() }}>
        <Field label={`To confirm you saved it, type its last 4 characters`}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="····" aria-label="Last 4 characters of the recovery key" className="font-mono uppercase" />
        </Field>
        <Button type="submit" variant="primary" disabled={!ok}>I've saved it, continue</Button>
      </form>
    </div>
  )
}

// ── Locked ──────────────────────────────────────────────────────────────────
function Locked({ userId, meta }: { userId: string; meta: Meta }) {
  const [mode, setMode] = useState<'passkey' | 'recovery'>(meta.passkeys.length ? 'passkey' : 'recovery')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const go = async (proof: Proof) => {
    setBusy(true); setError('')
    try { vaultSession.unlock(await unlock(userId, meta, proof)) } catch (e) { setError(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="grid place-items-center rounded-xl border border-line bg-panel px-5 py-10 text-center">
      <Lock size={26} className="text-faint" />
      <h2 className="mt-3 text-base font-semibold">Vault locked</h2>
      {mode === 'passkey' ? (
        <>
          <Button variant="primary" className="mt-5" disabled={busy} onClick={() => go({ kind: 'passkey' })}>
            <Fingerprint size={16} /> {busy ? 'Waiting for Face ID…' : 'Unlock with Face ID'}
          </Button>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setMode('recovery'); setError('') }}>Use recovery key</Button>
        </>
      ) : (
        <form className="mt-4 grid w-full max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); go({ kind: 'recovery', text }) }}>
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="WA-XXXX-XXXX-…" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-label="Recovery key" className="font-mono" />
          <Button type="submit" variant="primary" disabled={busy || !text.trim()}>{busy ? 'Unlocking…' : 'Unlock'}</Button>
          {meta.passkeys.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('passkey'); setError('') }}>Use Face ID instead</Button>}
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
    </div>
  )
}

// ── Unlocked ────────────────────────────────────────────────────────────────
type Decrypted = { id: string; entry: VaultEntry }
const NO_ROWS: VaultItemRow[] = []
const EMPTY: VaultEntry = { title: '', category: 'Bank', username: '', password: '', url: '', notes: '', fields: [] }

function Unlocked({ userId, vk, meta, onNewRecoveryKey }: { userId: string; vk: CryptoKey; meta: Meta; onNewRecoveryKey: (k: string) => void }) {
  const { data } = useVaultItems()
  const rows = data ?? NO_ROWS // stable identity: the decrypt effect below depends on it
  const { saveVaultItem, deleteVaultItem } = useMutations()
  const [items, setItems] = useState<Decrypted[]>([])
  const [failed, setFailed] = useState(0)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Decrypted | null>(null)
  const [editing, setEditing] = useState<{ id?: string; entry: VaultEntry } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled(rows.map(async (r: VaultItemRow) => ({ id: r.id, entry: await decryptEntry(vk, r, aad.item(userId, r.id)) })))
      .then((res) => {
        if (cancelled) return
        setItems(res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])).sort((a, b) => a.entry.title.localeCompare(b.entry.title)))
        setFailed(res.filter((r) => r.status === 'rejected').length)
      })
    return () => { cancelled = true }
  }, [rows, vk, userId])
  useEffect(() => () => { setItems([]); setViewing(null); setEditing(null) }, []) // drop plaintext on unmount

  const categories = useMemo(() => [...new Set([...CATEGORIES, ...items.map((i) => i.entry.category)])].filter((c) => items.some((i) => i.entry.category === c)), [items])
  const q = query.trim().toLowerCase()
  const shown = items.filter((i) => (!category || i.entry.category === category) &&
    (!q || [i.entry.title, i.entry.username, i.entry.url, i.entry.category].some((s) => s.toLowerCase().includes(q))))

  const save = async (id: string | undefined, entry: VaultEntry) => {
    const itemId = id ?? crypto.randomUUID()
    const box = await encryptEntry(vk, entry, aad.item(userId, itemId)) // encrypted before it can reach the offline queue
    saveVaultItem({ id: itemId, ...box, version: 1 })
    setEditing(null)
    setViewing({ id: itemId, entry })
  }
  const remove = (d: Decrypted) => { deleteVaultItem(d.id); setViewing(null); toast(`Deleted “${d.entry.title}”`) }

  return (
    <>
      <div className="mb-4 flex gap-2">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-accent/60">
          <Search size={15} className="text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search passwords" aria-label="Search passwords" autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-[13px]" />
        </div>
        <Button variant="primary" className="h-10" onClick={() => setEditing({ entry: { ...EMPTY, category: category ?? 'Bank' } })}><Plus size={15} /> New</Button>
      </div>

      {categories.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[null, ...categories].map((c) => (
            <button key={c ?? 'all'} onClick={() => setCategory(c)} aria-pressed={category === c}
              className={cn('h-8 rounded-full border px-3 text-xs transition-colors cursor-pointer', category === c ? 'border-accent/50 bg-accent/15 text-fg' : 'border-line text-muted hover:text-fg')}>
              {c ?? 'All'}
            </button>
          ))}
        </div>
      )}

      {failed > 0 && <p className="mb-3 text-xs text-danger">{failed} entr{failed === 1 ? 'y' : 'ies'} couldn't be decrypted.</p>}
      {items.length === 0 && !failed && (
        <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-sm font-medium">No passwords yet</p>
          <p className="mt-1 text-[13px] text-muted">Add your bank, email and other logins. They're encrypted before they leave this device.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line empty:hidden">
        {shown.map((d) => (
          <button key={d.id} onClick={() => setViewing(d)} className="flex items-center gap-3 bg-panel px-4 py-3 text-left transition-colors hover:bg-panel-2 cursor-pointer">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-sm font-semibold text-accent">{d.entry.title.charAt(0).toUpperCase() || '?'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium md:text-[13px]">{d.entry.title}</span>
              <span className="block truncate text-xs text-muted">{d.entry.username || d.entry.category}</span>
            </span>
            <span className="shrink-0 text-[11px] text-faint">{d.entry.category}</span>
          </button>
        ))}
      </div>

      <Manage userId={userId} meta={meta} onNewRecoveryKey={onNewRecoveryKey} />

      <Sheet open={!!viewing && !editing} onOpenChange={(o) => !o && setViewing(null)} title={viewing?.entry.title ?? ''}>
        {viewing && <EntryView entry={viewing.entry} onEdit={() => setEditing({ id: viewing.id, entry: viewing.entry })} onDelete={() => remove(viewing)} />}
      </Sheet>
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? 'Edit password' : 'New password'}>
        {editing && <EntryForm initial={editing.entry} categories={[...new Set([...CATEGORIES, ...categories])]} onSave={(e) => save(editing.id, e)} />}
      </Sheet>
    </>
  )
}

function SecretRow({ label, value, hidden, mono }: { label: string; value: string; hidden?: boolean; mono?: boolean }) {
  const [reveal, setReveal] = useState(false)
  if (!value) return null
  return (
    <div className="flex items-center gap-2 border-b border-line py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{label}</div>
        <div className={cn('truncate text-sm', (mono || hidden) && 'font-mono')} data-testid={`field-${label}`}>
          {hidden && !reveal ? '•'.repeat(Math.min(12, Math.max(8, value.length))) : value}
        </div>
      </div>
      {hidden && (
        <Button variant="ghost" size="icon" aria-label={`${reveal ? 'Hide' : 'Show'} ${label}`} onClick={() => setReveal((r) => !r)}>
          {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label={`Copy ${label}`} onClick={() => copySecret(value).then(() => toast(`${label} copied`, { description: hidden ? 'Clipboard clears in 30 s' : undefined }))}>
        <Copy size={15} />
      </Button>
    </div>
  )
}

function EntryView({ entry, onEdit, onDelete }: { entry: VaultEntry; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-line bg-panel-2 px-3">
        <SecretRow label="Username" value={entry.username} />
        <SecretRow label="Password" value={entry.password} hidden />
        {entry.fields.map((f, i) => <SecretRow key={i} label={f.label || 'Field'} value={f.value} hidden={f.hidden} />)}
        {entry.url && (
          <div className="border-b border-line py-2.5 last:border-0">
            <div className="text-xs text-muted">Website</div>
            <a href={/^https?:\/\//.test(entry.url) ? entry.url : `https://${entry.url}`} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-accent underline underline-offset-2">{entry.url}</a>
          </div>
        )}
      </div>
      {entry.notes && <p className="whitespace-pre-wrap rounded-lg border border-line bg-panel-2 p-3 text-sm">{entry.notes}</p>}
      <div className="flex items-center justify-between">
        <Button variant="danger" size="sm" onClick={() => (confirm ? onDelete() : setConfirm(true))}><Trash2 size={14} /> {confirm ? 'Tap again to delete' : 'Delete'}</Button>
        <Button variant="primary" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  )
}

function EntryForm({ initial, categories, onSave }: { initial: VaultEntry; categories: string[]; onSave: (e: VaultEntry) => void }) {
  const [e, setE] = useState<VaultEntry>(initial)
  const [showPw, setShowPw] = useState(false)
  const set = <K extends keyof VaultEntry>(k: K, v: VaultEntry[K]) => setE((x) => ({ ...x, [k]: v }))
  const setField = (i: number, patch: Partial<VaultField>) => set('fields', e.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (!e.title.trim()) return
    onSave({ ...e, title: e.title.trim(), category: e.category.trim() || 'Other', fields: e.fields.filter((f) => f.label.trim() || f.value) })
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4" autoComplete="off">
      <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3">
        <Field label="Name"><Input autoFocus value={e.title} onChange={(x) => set('title', x.target.value)} placeholder="e.g. HDFC NetBanking" required /></Field>
        <Field label="Category">
          <Input list="vault-categories" value={e.category} onChange={(x) => set('category', x.target.value)} />
          <datalist id="vault-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
      <Field label="Username / email / customer ID"><Input value={e.username} onChange={(x) => set('username', x.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} /></Field>
      <Field label="Password">
        <div className="flex gap-2">
          <Input type={showPw ? 'text' : 'password'} value={e.password} onChange={(x) => set('password', x.target.value)} autoComplete="new-password" className="font-mono" />
          <Button type="button" variant="subtle" size="icon" className="h-10 w-10 md:h-9 md:w-9" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((s) => !s)}>
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </Button>
        </div>
      </Field>
      <Field label="Website"><Input value={e.url} onChange={(x) => set('url', x.target.value)} placeholder="netbanking.example.com" inputMode="url" autoCapitalize="off" /></Field>

      <div role="group" aria-label="Custom fields" className="grid gap-2">
        <span className="text-xs font-medium text-muted">Custom fields</span>
        {e.fields.map((f, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto_auto] items-center gap-1.5">
            <Input value={f.label} onChange={(x) => setField(i, { label: x.target.value })} placeholder="Label (e.g. MPIN)" aria-label={`Field ${i + 1} label`} />
            <Input type={f.hidden ? 'password' : 'text'} value={f.value} onChange={(x) => setField(i, { value: x.target.value })} placeholder="Value" aria-label={`Field ${i + 1} value`} autoComplete="off" className="font-mono" />
            <Button type="button" variant="ghost" size="icon" aria-label={f.hidden ? 'Make visible' : 'Make hidden'} title={f.hidden ? 'Hidden (masked)' : 'Visible'} onClick={() => setField(i, { hidden: !f.hidden })}>
              {f.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove field ${i + 1}`} onClick={() => set('fields', e.fields.filter((_, j) => j !== i))}><X size={15} /></Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => set('fields', [...e.fields, { label: '', value: '', hidden: true }])}>
          <Plus size={14} /> Add field (MPIN, security answer…)
        </Button>
      </div>

      <Field label="Notes">
        <textarea value={e.notes} onChange={(x) => set('notes', x.target.value)} rows={3}
          className="w-full resize-none rounded-md border border-line bg-panel-2 px-3 py-2 text-base outline-none focus:border-accent/60 md:text-[13px]" />
      </Field>
      <div className="flex justify-end"><Button type="submit" variant="primary">Save</Button></div>
    </form>
  )
}

// ── Manage ──────────────────────────────────────────────────────────────────
function Manage({ userId, meta, onNewRecoveryKey }: { userId: string; meta: Meta; onNewRecoveryKey: (k: string) => void }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [proofFor, setProofFor] = useState<null | 'add' | 'rotate'>(null)
  const [recoveryText, setRecoveryText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')
  // Wait for the fresh vault record so the cached copy can't lag behind a change (e.g. a replaced recovery key).
  const refresh = () => qc.refetchQueries({ queryKey: ['vault'] })

  const run = async (what: 'add' | 'rotate', proof: Proof) => {
    setBusy(true)
    try {
      if (what === 'add') { await addPasskey(userId, meta, proof); await refresh(); toast(`Face ID added for ${deviceLabel()}`) }
      else { const k = await replaceRecoveryKey(userId, meta, proof); await refresh(); onNewRecoveryKey(k) }
      setProofFor(null); setRecoveryText('')
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <details className="mt-8 rounded-xl border border-line bg-panel">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Manage vault</summary>
      <div className="grid gap-5 border-t border-line p-4">
        <section>
          <h3 className="mb-2 text-xs font-medium text-muted">Face ID passkeys</h3>
          {meta.passkeys.length === 0 && <p className="text-xs text-faint">None. Unlock is recovery-key only.</p>}
          {meta.passkeys.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
              <Fingerprint size={15} className="text-faint" />
              <span className="flex-1">{p.label} <span className="text-xs text-faint">· added {new Date(p.created_at).toLocaleDateString()}</span></span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={async () => { await removePasskey(p.id); await refresh(); toast('Passkey removed') }}>Remove</Button>
            </div>
          ))}
          <Button variant="subtle" size="sm" className="mt-2" disabled={busy} onClick={() => setProofFor('add')}><Plus size={14} /> Add Face ID / Touch ID on this device</Button>
        </section>
        <section>
          <h3 className="mb-1 text-xs font-medium text-muted">Recovery key</h3>
          <p className="mb-2 text-xs text-faint">The old key stops working for the vault from now on. (It could still open an old backup copy of the vault.)</p>
          <Button variant="subtle" size="sm" disabled={busy} onClick={() => setProofFor('rotate')}><KeyRound size={14} /> Replace recovery key</Button>
        </section>
        {proofFor && (
          <section className="rounded-lg border border-line bg-panel-2 p-3">
            <p className="mb-2 text-xs text-muted">Confirm it's you first:</p>
            <div className="flex flex-wrap gap-2">
              {meta.passkeys.length > 0 && <Button size="sm" variant="primary" disabled={busy} onClick={() => run(proofFor, { kind: 'passkey' })}><Fingerprint size={14} /> Face ID</Button>}
              <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); run(proofFor, { kind: 'recovery', text: recoveryText }) }}>
                <Input value={recoveryText} onChange={(e) => setRecoveryText(e.target.value)} placeholder="or recovery key WA-…" aria-label="Recovery key to confirm" className="font-mono" autoComplete="off" />
                <Button size="sm" type="submit" variant="subtle" disabled={busy || !recoveryText.trim()}>Confirm</Button>
              </form>
              <Button size="sm" variant="ghost" onClick={() => setProofFor(null)}>Cancel</Button>
            </div>
          </section>
        )}
        <section>
          <h3 className="mb-1 text-xs font-medium text-danger">Delete vault</h3>
          <p className="mb-2 text-xs text-faint">Permanently deletes every saved password. Type DELETE to confirm.</p>
          <div className="flex gap-2">
            <Input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" className="max-w-40" />
            <Button variant="danger" size="sm" disabled={confirmDelete !== 'DELETE' || busy} onClick={async () => {
              setBusy(true)
              try { await deleteVault(userId); vaultSession.lock(); qc.removeQueries({ queryKey: ['vault_items'] }); refresh(); toast('Vault deleted') }
              catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
            }}><Trash2 size={14} /> Delete everything</Button>
          </div>
        </section>
      </div>
    </details>
  )
}
