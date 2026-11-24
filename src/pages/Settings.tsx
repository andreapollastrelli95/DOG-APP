import { useEffect, useState } from 'react'
import { Bell, Download, FlaskConical, LogOut, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { useApp, useTable } from '../lib/app'
import { supabase } from '../lib/supabase'
import { aiStatus, type AiStatus } from '../lib/ai'
import { TABLES } from '../lib/schema'
import { Badge, Button, Card, inputCls, useUi } from '../components/ui'
import { download, fmtDateTime, toCsv } from '../lib/format'
import { csvValue } from '../components/Resource'
import type { ConflictRecord } from '../lib/store'

export default function Settings() {
  const { store, mode, isAdmin, signOut, setDemo, resetDemo, theme, toggleTheme, householdName } = useApp()
  const { toast, confirm } = useUi()
  const [ai, setAi] = useState<AiStatus | null>(null)
  const { rows: logs } = useTable('audit_logs')
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([])
  const [members, setMembers] = useState<{ user_id: string; role: string; profiles: { display_name?: string; email?: string } | null }[]>([])
  const [invite, setInvite] = useState('')
  const [name, setName] = useState(localStorage.getItem('dm.name') ?? '')
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')

  useEffect(() => {
    void aiStatus().then(setAi)
    void store.conflicts().then(setConflicts)
  }, [store])
  const loadMembers = async () => {
    if (mode !== 'cloud' || !supabase) return
    const { data } = await supabase.from('household_members').select('user_id, role, profiles(display_name, email)').eq('household_id', store.householdId)
    setMembers((data as any) ?? [])
  }
  useEffect(() => {
    void loadMembers()
  }, [store])

  async function inviteMember() {
    if (!supabase) return
    if (!/^\S+@\S+\.\S+$/.test(invite)) return toast('Email non valida', 'err')
    const { data, error } = await supabase.functions.invoke('invite', { body: { email: invite.trim(), household_id: store.householdId } })
    if (error || data?.error) return toast(data?.error ?? error?.message ?? 'Invito non riuscito', 'err')
    toast('Invito inviato a ' + invite)
    setInvite('')
  }
  async function revoke(uid: string) {
    if (!supabase || !(await confirm('Revocare l’accesso a questo familiare? Non potrà più vedere i dati.', { action: 'Revoca' }))) return
    const { error } = await supabase.rpc('remove_member', { p_household: store.householdId, p_user: uid })
    if (error) return toast(error.message, 'err')
    toast('Accesso revocato')
    void loadMembers()
  }

  async function exportJson() {
    download(`dog-manager-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await store.exportAll(), null, 2), 'application/json')
  }
  async function exportCsv(t: string) {
    const def = TABLES[t]
    const rows = await store.list(t)
    download(`${t}.csv`, toCsv(def.fields.map((f) => f.label), rows.map((r) => def.fields.map((f) => csvValue(f, r)))))
  }

  async function wipe() {
    if (!(await confirm('Eliminare TUTTI i dati dell’app' + (mode === 'cloud' ? ' per tutta la famiglia' : ' su questo dispositivo') + '? Non si può annullare. Esporta prima un backup.', { action: 'Elimina tutto' }))) return
    try {
      if (mode === 'cloud' && supabase) {
        const { error } = await supabase.rpc('delete_household_data', { p_household: store.householdId })
        if (error) throw error
        const { data: files } = await supabase.storage.from('documents').list(store.householdId, { limit: 1000 })
        if (files?.length) await supabase.storage.from('documents').remove(files.map((f) => `${store.householdId}/${f.name}`))
      }
      await store.wipeLocal()
      toast('Dati eliminati')
    } catch (e: any) {
      toast(e?.message ?? 'Eliminazione non riuscita', 'err')
    }
  }
  async function deleteAccount() {
    if (!supabase || !(await confirm('Eliminare il tuo account? Se sei l’unico amministratore, anche la famiglia e i suoi dati verranno eliminati.', { action: 'Elimina account' }))) return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return toast(error.message, 'err')
    await store.wipeLocal()
    await signOut()
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return toast('Notifiche non supportate da questo browser', 'err')
    const p = await Notification.requestPermission()
    setPerm(p)
    toast(p === 'granted' ? 'Notifiche attive (mentre l’app è aperta)' : 'Permesso non concesso', p === 'granted' ? 'ok' : 'err')
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Impostazioni</h1>

      <Card className="space-y-2">
        <h2 className="font-medium">Dove sono i dati</h2>
        {mode === 'demo' && <p className="text-sm">Stai usando la <strong>modalità demo</strong>: dati di esempio in un archivio separato, non reali.</p>}
        {mode === 'local' && <p className="text-sm">I dati sono salvati <strong>solo su questo dispositivo</strong> (nessun cloud). Per condividerli con la famiglia serve configurare Supabase (vedi CONFIGURAZIONE.txt). Esporta regolarmente un backup.</p>}
        {mode === 'cloud' && <p className="text-sm">Famiglia “{householdName}”, dati su Supabase con accesso protetto. Una copia di consultazione è tenuta su questo dispositivo per l’uso offline.</p>}
        <div className="flex flex-wrap gap-2">
          {mode !== 'demo' ? (
            <Button variant="soft" onClick={() => void setDemo(true)}>
              <FlaskConical size={16} /> Prova la demo
            </Button>
          ) : (
            <>
              <Button variant="soft" onClick={() => void setDemo(false)}>
                Esci dalla demo
              </Button>
              <Button variant="soft" onClick={() => void resetDemo()}>
                Ripristina dati demo
              </Button>
            </>
          )}
          {mode === 'cloud' && (
            <Button variant="soft" onClick={() => void signOut()}>
              <LogOut size={16} /> Esci
            </Button>
          )}
        </div>
        {mode === 'local' && (
          <div className="flex items-center gap-2 pt-1">
            <input className={inputCls + ' max-w-48'} placeholder="Il tuo nome" value={name} onChange={(e) => setName(e.target.value)} aria-label="Il tuo nome" />
            <Button
              size="sm"
              variant="soft"
              onClick={() => {
                localStorage.setItem('dm.name', name)
                toast('Nome salvato (valido dai prossimi inserimenti dopo il riavvio)')
              }}
            >
              Salva nome
            </Button>
          </div>
        )}
      </Card>

      {mode === 'cloud' && (
        <Card className="space-y-3">
          <h2 className="font-medium">Famiglia</h2>
          <ul className="space-y-1.5 text-sm">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-2">
                <span>
                  {m.profiles?.display_name || m.profiles?.email || 'Familiare'} <Badge tone={m.role === 'admin' ? 'gold' : 'neutral'}>{m.role === 'admin' ? 'Amministratore' : 'Familiare'}</Badge>
                </span>
                {isAdmin && m.user_id !== store.userId && (
                  <Button size="sm" variant="ghost" onClick={() => void revoke(m.user_id)}>
                    <UserMinus size={14} /> Revoca
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <div className="flex gap-2">
              <input className={inputCls} type="email" placeholder="Email del familiare da invitare" value={invite} onChange={(e) => setInvite(e.target.value)} aria-label="Email da invitare" />
              <Button onClick={() => void inviteMember()}>
                <UserPlus size={16} /> Invita
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">Solo gli amministratori possono invitare o revocare accessi.</p>
          )}
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-medium">Intelligenza artificiale</h2>
        {!ai ? (
          <p className="text-sm text-muted">Verifica in corso…</p>
        ) : ai.configured ? (
          <p className="text-sm">
            <Badge tone="good">Attiva</Badge> Provider: Google Gemini · modello {ai.model} · eseguita su: {ai.where}.
          </p>
        ) : (
          <p className="text-sm">
            <Badge tone="warn">Non disponibile</Badge> {ai.reason}
          </p>
        )}
        <p className="text-xs text-muted">La chiave API non si inserisce mai nell'app: è un segreto del server (variabile GEMINI_API_KEY, oppure “supabase secrets set”). Il modello si cambia con GEMINI_MODEL. Se il limite gratuito si esaurisce l'app lo segnala e riprova più tardi; il resto continua a funzionare. Istruzioni: CONFIGURAZIONE.txt.</p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Aspetto e notifiche</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={toggleTheme}>
            Tema: {theme === 'dark' ? 'scuro' : 'chiaro'}
          </Button>
          <Button variant="soft" onClick={() => void enableNotifications()} disabled={perm === 'granted' || perm === 'unsupported'}>
            <Bell size={16} /> {perm === 'granted' ? 'Notifiche attive' : perm === 'denied' ? 'Notifiche bloccate dal browser' : 'Attiva notifiche'}
          </Button>
        </div>
        <p className="text-xs text-muted">I promemoria dell'agenda compaiono nell'app e come notifica del dispositivo mentre l'app è aperta o in background recente. Le notifiche push a app chiusa richiedono un servizio push e non sono ancora attive.</p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Esporta e backup</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void exportJson()}>
            <Download size={16} /> Backup completo (JSON)
          </Button>
          {Object.keys(TABLES).map((t) => (
            <Button key={t} size="sm" variant="soft" onClick={() => void exportCsv(t)}>
              CSV {TABLES[t].label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">Il backup JSON contiene i dati (non i file dei documenti, che si scaricano dall'Archivio).</p>
      </Card>

      {conflicts.length > 0 && (
        <Card className="space-y-2 border-warn/40">
          <h2 className="font-medium text-warn">Conflitti di sincronizzazione</h2>
          {conflicts.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
              <span>
                {TABLES[c.table]?.label ?? c.table} — {c.reason} <span className="text-muted">({fmtDateTime(c.at)})</span>
              </span>
              <Button size="sm" variant="soft" onClick={() => void store.dismissConflict(c.id).then(() => store.conflicts().then(setConflicts))}>
                Ok
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-medium">Cronologia modifiche</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted">Nessuna modifica registrata.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {[...logs]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 100)
              .map((l) => (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-line/50 py-1">
                  <span>
                    <strong>{l.user_name ?? store.authorName(l.user_id)}</strong> {l.action === 'insert' ? 'ha aggiunto' : l.action === 'update' ? 'ha modificato' : 'ha eliminato'}: {l.summary ?? l.table_name}
                  </span>
                  <span className="text-xs text-muted">{fmtDateTime(l.created_at)}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2 border-danger/30">
        <h2 className="font-medium text-danger">Privacy e cancellazione</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => void wipe()} disabled={mode === 'cloud' && !isAdmin}>
            <Trash2 size={16} /> Elimina tutti i dati
          </Button>
          {mode === 'cloud' && (
            <Button variant="danger" onClick={() => void deleteAccount()}>
              Elimina il mio account
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
