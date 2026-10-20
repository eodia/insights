'use client'

import { CATALOG_NAME_RE, type Datasource, type DatasourceInput, type EngineField, type EngineSpec, fieldApplies, sourceSchemas } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { $t, intlLocale, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CalendarDays, CheckCircle2, ChevronRight, ClipboardPaste, Copy, Hand, Info, Loader2, Plug, Plus, Timer, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { useId, useState } from 'react'

type ConfigValue = string | number | boolean
type Schedule = Datasource['sync']['schedule']

interface TestResult {
  readonly ok: boolean
  readonly version?: string
  readonly error?: string
  readonly ms: number
}

/**
 * The French of `ENGINE_SPECS` (`@eodia/contracts`) — labels, help and example values of the
 * fields —, marked here for the catalog: the form shows them through `$t`.
 */
export const ENGINE_SPEC_TEXT = [
  msg('Connecteur Trino (avancé)'),
  msg('Hôte'),
  msg('db.exemple.fr'),
  msg('Port'),
  msg('Utilisateur'),
  msg('Mot de passe'),
  msg('Base de données'),
  msg('Seules ces bases sont exposées, séparées par des virgules ; vide, toutes celles que l’utilisateur voit.'),
  msg('ventes, crm'),
  msg('Chiffrer la connexion'),
  msg('Faire confiance au certificat du serveur'),
  msg('Nom de service'),
  msg('Compte'),
  msg('Entrepôt'),
  msg('Rôle'),
  msg('Chaîne de connexion'),
  msg('mongodb://utilisateur:motdepasse@hote:27017/'),
  msg('Connecteur'),
  msg('Propriétés'),
  msg('La valeur de connector.name dans le fichier du catalogue.'),
  msg('Une propriété par ligne, au format clé=valeur : le fichier du catalogue, sans connector.name. Une valeur laissée vide est ignorée.'),
  msg('Iceberg · metastore Hive'),
  msg('Iceberg · catalogue REST'),
  msg('Apache Iceberg'),
  msg('Catalogue Iceberg'),
  msg('Metastore Hive'),
  msg('Catalogue REST'),
  msg('URI du metastore'),
  msg('Plusieurs URI séparées par des virgules.'),
  msg('URI du catalogue REST'),
  msg('Entrepôt (warehouse)'),
  msg('Facultatif'),
  msg('Jeton OAuth2'),
  msg('Facultatif : un catalogue ouvert n’en demande pas.'),
  msg('Accès au stockage fournis par le catalogue'),
  msg('Le catalogue REST délivre les accès aux fichiers (vended credentials) : les clés S3 deviennent inutiles.'),
  msg('Région Glue'),
  msg('Endpoint S3'),
  msg('Vide pour AWS ; sinon l’adresse de MinIO, Ceph, Scality…'),
  msg('Région S3'),
  msg('Exigée même hors AWS : gardez us-east-1 pour MinIO.'),
  msg('Clé d’accès S3'),
  msg('Clé secrète S3'),
  msg('Adresses de type chemin (path-style)'),
  msg('Nécessaire pour MinIO et la plupart des S3 sur site.'),
] as const

/**
 * Catalog properties pasted: a JSON object of texts (numbers and booleans read as text), or
 * `key=value` lines as in a catalog file. Null when it is neither.
 */
function readProperties(text: string): Record<string, string> | null {
  const t = text.trim()
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as unknown
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(o)) {
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return null
        out[k.trim()] = String(v)
      }
      return out
    } catch {
      return null
    }
  }
  const out: Record<string, string> = {}
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) return null
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return Object.keys(out).length ? out : null
}

/** What a name becomes as a Trino catalog: `Support client` → `support_client`. */
export function catalogFromName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(slug) ? slug.slice(0, 63) : `src_${slug}`.slice(0, 63)
}

function initialConfig(spec: EngineSpec, ds?: Datasource): Record<string, ConfigValue> {
  const out: Record<string, ConfigValue> = {}
  for (const f of spec.fields) {
    const saved = ds?.config[f.key]
    if (f.secret) out[f.key] = ''
    else if (saved !== undefined) out[f.key] = saved
    else if (f.default !== undefined) out[f.key] = f.default
    else out[f.key] = f.type === 'boolean' ? false : ''
  }
  return out
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>
}

function Field({ field, value, onChange, secretSet }: { field: EngineField; value: ConfigValue; onChange: (v: ConfigValue) => void; secretSet: boolean }) {
  const id = useId()
  const required = field.required && !(field.secret && secretSet)
  if (field.type === 'choice') {
    return (
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{$t(field.label)}</Label>
        <Segmented
          value={String(value)}
          onValueChange={onChange}
          aria-label={$t(field.label)}
          inline
          options={(field.options ?? []).map((o) => ({ value: o.value, label: $t(o.label) }))}
        />
        {field.help ? <p className="text-xs text-muted-foreground">{$t(field.help)}</p> : null}
      </div>
    )
  }
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor={id}>{$t(field.label)}</Label>
          {field.help ? <p className="mt-0.5 text-xs text-muted-foreground">{$t(field.help)}</p> : null}
        </div>
        <Switch id={id} checked={value === true} onCheckedChange={onChange} />
      </div>
    )
  }
  const listId = `${id}-suggestions`
  const placeholder = field.secret && secretSet ? $t('••••• (inchangé)') : field.placeholder ? $t(field.placeholder) : undefined
  return (
    <div className={cn('space-y-1.5', field.type === 'textarea' && 'sm:col-span-2', field.key === 'connection_url' && 'sm:col-span-2')}>
      <Label htmlFor={id}>
        {$t(field.label)}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {field.type === 'textarea' ? (
        <Textarea
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={Math.min(14, Math.max(4, String(value).split('\n').length + 1))}
          spellCheck={false}
          className="font-mono text-xs"
        />
      ) : (
        <Input
          id={id}
          type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={field.type === 'password' ? 'new-password' : 'off'}
          list={field.suggestions ? listId : undefined}
          className={cn((field.key === 'connection_url' || field.suggestions) && 'font-mono text-xs')}
        />
      )}
      {field.suggestions ? (
        <datalist id={listId}>
          {field.suggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ) : null}
      {field.help ? <p className="text-xs text-muted-foreground">{$t(field.help)}</p> : null}
      {field.secret && secretSet ? <p className="text-xs text-muted-foreground">{$t('Laissez vide pour conserver la valeur enregistrée.')}</p> : null}
    </div>
  )
}

/**
 * The connection form of a source, drawn from its engine's spec: the same for adding and for
 * editing. Secrets never come back from the API: a blank secret keeps the saved one.
 */
export function SourceForm({
  spec,
  source,
  onSaved,
  onCancel,
  onBack,
}: {
  spec: EngineSpec
  source?: Datasource
  onSaved: (ds: Datasource) => void
  onCancel?: () => void
  onBack?: () => void
}) {
  const editing = !!source
  const [name, setName] = useState(source?.name ?? '')
  const [description, setDescription] = useState(source?.description ?? '')
  const [catalog, setCatalog] = useState('')
  const [schedule, setSchedule] = useState<Schedule>(source?.sync.schedule ?? 'hourly')
  const [config, setConfig] = useState<Record<string, ConfigValue>>(() => initialConfig(spec, source))
  const [nativeSql, setNativeSql] = useState(source?.options.native_sql ?? true)
  const [cacheTtl, setCacheTtl] = useState<string>(source?.options.cache_ttl != null ? String(source.options.cache_ttl) : '')
  const [props, setProps] = useState<{ key: string; value: string }[]>(() => Object.entries(source?.options.trino_properties ?? {}).map(([key, value]) => ({ key, value })))
  const [advanced, setAdvanced] = useState(props.length > 0)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const descId = useId()
  const catId = useId()
  const ttlId = useId()

  const catalogError = catalog && !CATALOG_NAME_RE.test(catalog) ? $t('Minuscules, chiffres, _ et - ; commence par une lettre.') : null
  const fields = spec.fields.filter((f) => fieldApplies(f, config))
  // Kept to some databases, the source cannot take native SQL: it would reach the others.
  const native = spec.nativeQuery && sourceSchemas(spec.engine, config) === null
  const missing = fields.filter((f) => f.required && !(f.secret && source?.secrets.includes(f.key)) && (config[f.key] === '' || config[f.key] === undefined))
  const ttlInvalid = cacheTtl !== '' && !(Number.isInteger(Number(cacheTtl)) && Number(cacheTtl) >= 0)
  const valid = name.trim() !== '' && missing.length === 0 && !catalogError && !ttlInvalid

  const build = (): DatasourceInput => {
    const cfg: Record<string, ConfigValue> = {}
    for (const f of fields) {
      const v = config[f.key]
      if (v === undefined) continue
      // A blank secret on an existing source keeps the saved one; a blank optional field is left out.
      if (v === '' && (f.secret || !f.required)) continue
      cfg[f.key] = f.type === 'number' && v !== '' ? Number(v) : v
    }
    const trino = Object.fromEntries(props.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]))
    return {
      name: name.trim(),
      engine: spec.engine,
      ...(!editing && catalog ? { catalog } : {}),
      description: description.trim() || null,
      config: cfg,
      options: {
        native_sql: native && nativeSql,
        cache_ttl: cacheTtl === '' ? null : Number(cacheTtl),
        trino_properties: trino,
      },
      schedule,
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTest(null)
    try {
      const input = build()
      setTest(await api.post<TestResult>('/v1/datasources/test', { ...input, ...(source ? { id: source.id } : {}) }))
    } catch (err) {
      setTest({ ok: false, error: err instanceof Error ? err.message : String(err), ms: 0 })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const input = build()
      const ds = source ? await api.put<Datasource>(`/v1/datasources/${source.id}`, input) : await api.post<Datasource>('/v1/datasources', input)
      onSaved(ds)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) void save()
      }}
    >
      {/* Identité */}
      <div className="space-y-3">
        <SectionTitle>{$t('Source')}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>
              {$t('Nom')}
              <span className="text-destructive">*</span>
            </Label>
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder={$t('Boutique, Entrepôt…')} autoFocus={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={catId}>{$t('Nom du catalogue')}</Label>
            {editing ? (
              <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 font-mono text-sm text-muted-foreground">{source.catalog}</div>
            ) : (
              <Input id={catId} value={catalog} onChange={(e) => setCatalog(e.target.value)} placeholder={name ? catalogFromName(name) : 'boutique'} className="font-mono" />
            )}
            <p className={cn('text-xs', catalogError ? 'text-destructive' : 'text-muted-foreground')}>
              {catalogError ??
                (editing
                  ? $t('Le catalogue ne change pas : le SQL le cite.')
                  : $t('Facultatif : dérivé du nom. Le SQL cite les tables en catalogue.schéma.table.'))}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={descId}>{$t('Description')}</Label>
            <Input id={descId} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={$t('Facultative')} />
          </div>
        </div>
      </div>

      {/* Connexion */}
      <div className="space-y-3">
        <SectionTitle>{$t('Connexion {engine}', { engine: $t(spec.label) })}</SectionTitle>
        {spec.templates?.length ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{$t('Partir d’un modèle :')}</span>
              {spec.templates.map((tpl) => (
                <Button
                  key={tpl.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setConfig((c) => ({ ...c, ...tpl.values }))
                    setTest(null)
                  }}
                >
                  {$t(tpl.label)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{$t('Remplacez ensuite les valeurs d’exemple par celles de votre catalogue.')}</p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <Field
              key={f.key}
              field={f}
              value={config[f.key] ?? ''}
              secretSet={!!source?.secrets.includes(f.key)}
              onChange={(v) => {
                setConfig((c) => ({ ...c, [f.key]: v }))
                setTest(null)
              }}
            />
          ))}
        </div>
        {spec.engine !== 'trino' ? (
          <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {$t('En développement, Trino tourne dans Docker : « localhost » est traduit automatiquement en « host.docker.internal » pour que Trino joigne votre base.')}
            </span>
          </p>
        ) : null}
      </div>

      {/* Synchronisation et options */}
      <div className="space-y-3">
        <SectionTitle>{$t('Synchronisation et options')}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{$t('Synchronisation du schéma')}</Label>
            <Segmented
              value={schedule}
              onValueChange={(v) => setSchedule(v as Schedule)}
              aria-label={$t('Synchronisation du schéma')}
              options={[
                { value: 'hourly', label: $t('Chaque heure'), icon: Timer, hint: $t('Toutes les heures') },
                { value: 'daily', label: $t('Chaque jour'), icon: CalendarDays, hint: $t('Tous les jours') },
                { value: 'manual', label: $t('Manuelle'), icon: Hand, hint: $t('Manuelle uniquement') },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ttlId}>{$t('Cache des résultats (secondes)')}</Label>
            <Input id={ttlId} type="number" min={0} value={cacheTtl} onChange={(e) => setCacheTtl(e.target.value)} placeholder={$t('Réglage de l’instance')} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5 sm:col-span-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{$t('Autoriser le SQL natif')}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {native
                  ? $t('Les personnes autorisées peuvent écrire des requêtes dans le dialecte de la base, transmises telles quelles.')
                  : spec.nativeQuery
                    ? $t('Indisponible quand la source se limite à certaines bases : une requête native atteindrait les autres.')
                    : $t('Ce moteur n’accepte pas de requête native : seul le SQL Trino est possible.')}
              </p>
            </div>
            <Switch checked={native && nativeSql} onCheckedChange={setNativeSql} disabled={!native} aria-label={$t('Autoriser le SQL natif')} />
          </div>
        </div>

        <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronRight className={cn('size-4 transition-transform', advanced && 'rotate-90')} />
          {$t('Avancé')}
        </button>
        {advanced ? (
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 text-sm font-medium">{$t('Propriétés du catalogue Trino')}</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={!props.some((p) => p.key.trim())}
                onClick={async () => {
                  const json = JSON.stringify(Object.fromEntries(props.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value])), null, 2)
                  await navigator.clipboard.writeText(json)
                  toast.success($t('Propriétés copiées en JSON.'))
                }}
              >
                <Copy /> {$t('Copier en JSON')}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPasting(true)}>
                <ClipboardPaste /> {$t('Coller')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{$t('Ajoutées aux réglages par défaut du connecteur : cache des métadonnées, pushdown, délais…')}</p>
            {props.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={p.key}
                  onChange={(e) => setProps((list) => list.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                  placeholder="metadata.cache-ttl"
                  className="h-8 flex-1 font-mono text-xs"
                  aria-label={$t('Propriété')}
                />
                <span className="text-muted-foreground">=</span>
                <Input
                  value={p.value}
                  onChange={(e) => setProps((list) => list.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  placeholder="10m"
                  className="h-8 flex-1 font-mono text-xs"
                  aria-label={$t('Valeur')}
                />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setProps((list) => list.filter((_, j) => j !== i))} aria-label={$t('Retirer')}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setProps((list) => [...list, { key: '', value: '' }])}>
              <Plus /> {$t('Ajouter une propriété')}
            </Button>
          </div>
        ) : null}
        <Dialog open={pasting} onOpenChange={setPasting}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{$t('Coller des propriétés')}</DialogTitle>
              <DialogDescription>{$t('Un objet JSON { "clé": "valeur" }, ou des lignes clé=valeur comme dans un fichier de catalogue. Elles remplacent les propriétés actuelles.')}</DialogDescription>
            </DialogHeader>
            <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={10} spellCheck={false} className="font-mono text-xs" placeholder={'{\n  "metadata.cache-ttl": "10m"\n}'} />
            {pasteError ? <p className="text-xs text-destructive">{pasteError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPasting(false)}>
                {$t('Annuler')}
              </Button>
              <Button
                type="button"
                disabled={!pasted.trim()}
                onClick={() => {
                  const read = readProperties(pasted)
                  if (!read) return setPasteError($t('Ni un objet JSON de textes, ni des lignes clé=valeur.'))
                  setProps(Object.entries(read).map(([key, value]) => ({ key, value })))
                  setPasted('')
                  setPasteError(null)
                  setPasting(false)
                  setTest(null)
                }}
              >
                {$t('Remplacer les propriétés')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {test ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm',
            test.ok ? 'bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200',
          )}
        >
          {test.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium">{test.ok ? $t('Connexion réussie') : $t('Connexion impossible')}</div>
            <div className="text-xs break-words opacity-90">
              {test.ok ? [test.version, test.ms ? new Intl.NumberFormat(intlLocale(), { style: 'unit', unit: 'millisecond' }).format(test.ms) : null].filter(Boolean).join(' · ') : test.error}
            </div>
          </div>
        </div>
      ) : null}
      {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            {$t('Retour')}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={runTest} disabled={testing || missing.length > 0}>
          {testing ? <Loader2 className="animate-spin" /> : <Plug />}
          {$t('Tester la connexion')}
        </Button>
        <span className="flex-1" />
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {$t('Annuler')}
          </Button>
        ) : null}
        <Button type="submit" disabled={!valid || saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {editing ? $t('Enregistrer') : $t('Ajouter et synchroniser')}
        </Button>
      </div>
      {saving && !editing ? (
        <p className="text-right text-xs text-muted-foreground">{$t('Test de la connexion et création du catalogue Trino…')}</p>
      ) : null}
    </form>
  )
}
