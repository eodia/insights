'use client'

import {
  type DashboardCard,
  type DashboardParameter,
  type DisplayCondition,
  type DisplayRule,
  type FilterTest,
  type RowsTest,
  CONDITION_LIMITS,
  conditionAllowsRun,
  conditionCard,
  conditionHolds,
  sqlVariableNames,
  truthy,
} from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Textarea } from '@/components/ui/textarea'
import type { RunResult } from '@/lib/api'
import { $t, msg } from '@/lib/i18n'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { Code2, Filter as FilterIcon, Plus, Rows3, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { type Values, filterName } from './parameters'

/** How a dashboard runs a card: its own, a shared link's, an embed's. */
export type Runner = (card: DashboardCard, values: Values, opts: { fresh: boolean; draft: boolean }) => Promise<RunResult>

/** The values a card's result depends on: only the filters tied to it. */
export function relevantValues(card: DashboardCard, values: Values): Values {
  const ids = new Set((card.mappings ?? []).map((m) => m.parameter))
  return Object.fromEntries(Object.entries(values).filter(([k]) => ids.has(k)))
}

/**
 * A card's run — the same query, cached once, whoever asks: the card itself, or what checks
 * whether it shows.
 */
export function useCardRun(opts: { card: DashboardCard; dashboardId: string; values: Values; tick: number; fresh: boolean; draft: boolean; runner: Runner; enabled: boolean }) {
  const { card, dashboardId, values, tick, fresh, draft, runner, enabled } = opts
  const relevant = useMemo(() => relevantValues(card, values), [card, values])
  return useQuery({
    queryKey: ['card', dashboardId, card.id, JSON.stringify({ q: card.question, query: card.query, m: card.mappings, draft }), JSON.stringify(relevant), tick],
    queryFn: () => runner(card, values, { fresh, draft }),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    // A refresh or a new filter keeps the chart on screen: its values move to the new ones.
    placeholderData: keepPreviousData,
  })
}

/** The answers of a condition's query rules, by rank: each run as a card of its own. */
function useQueryAnswers(owner: string, condition: DisplayCondition | undefined, ctx: { dashboardId: string; values: Values; tick: number; draft: boolean; runner: Runner }) {
  const rules = (condition?.rules ?? []).map((rule, index) => ({ rule, index })).filter((r): r is { rule: Extract<DisplayRule, { kind: 'query' }>; index: number } => r.rule.kind === 'query')
  const results = useQueries({
    queries: rules.map(({ rule, index }) => {
      const card = conditionCard(owner, index, rule)
      return {
        queryKey: ['card', ctx.dashboardId, card.id, JSON.stringify({ query: card.query, m: card.mappings, draft: ctx.draft }), JSON.stringify(relevantValues(card, ctx.values)), ctx.tick],
        queryFn: () => ctx.runner(card, ctx.values, { fresh: false, draft: ctx.draft }),
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
      }
    }),
  })
  const byIndex = new Map(rules.map(({ index }, i) => [index, results[i]]))
  // A query in error answers no: the card stays hidden rather than shown on a guess.
  return (index: number) => {
    const r = byIndex.get(index)
    if (!r) return undefined
    if (r.error) return false
    return r.data ? truthy(r.data.rows[0]?.[0]) : undefined
  }
}

/**
 * Says whether a card shows, its condition weighed: the filters at once, its query rules as they
 * answer, its own rows once it ran — through the very query the card runs, cached once.
 */
export function CardCondition(props: {
  card: DashboardCard
  dashboardId: string
  values: Values
  tick: number
  fresh: boolean
  draft: boolean
  runner: Runner
  onAnswer: (id: string, shown: boolean | undefined) => void
}) {
  const { card, onAnswer } = props
  const query = useQueryAnswers(card.id, card.condition, props)
  const allow = conditionAllowsRun(card.condition, { values: props.values, query })
  const needsRows = card.kind === 'question' && (card.condition?.rules ?? []).some((r) => r.kind === 'rows')
  const run = useCardRun({ ...props, enabled: needsRows && allow === true })
  const shown = allow === false ? false : conditionHolds(card.condition, { values: props.values, query, rows: run.data?.rows.length, isTab: card.kind !== 'question' })
  useEffect(() => onAnswer(card.id, shown), [card.id, shown, onAnswer])
  return null
}

/** Says whether a tab shows: its rules on the filters, and its queries. */
export function TabCondition(props: { id: string; condition: DisplayCondition; dashboardId: string; values: Values; tick: number; draft: boolean; runner: Runner; onAnswer: (id: string, shown: boolean | undefined) => void }) {
  const { id, condition, onAnswer } = props
  const query = useQueryAnswers(id, condition, props)
  const shown = conditionHolds(condition, { values: props.values, query, isTab: true })
  useEffect(() => onAnswer(id, shown), [id, shown, onAnswer])
  return null
}

const FILTER_TEST_LABELS: Record<FilterTest, string> = {
  one: msg('a exactement une valeur choisie'),
  some: msg('a au moins une valeur choisie'),
  none: msg('n’a aucune valeur choisie'),
  equals: msg('vaut'),
  not_equals: msg('ne vaut pas'),
}

const ROWS_TEST_LABELS: Record<RowsTest, string> = {
  some: msg('a au moins une ligne'),
  none: msg('n’a aucune ligne'),
  at_least: msg('a au moins'),
  at_most: msg('a au plus'),
}

/** What a dashboard filter is, for a SQL variable of type « filtre » it feeds. */
const columnKind = (p: DashboardParameter | undefined) => (p?.type === 'number' ? 'number' : p?.type === 'date' ? 'date' : 'text')

/** One rule, as it is set. */
function RuleRow({ rule, parameters, onChange, onRemove }: { rule: DisplayRule; parameters: readonly DashboardParameter[]; onChange: (r: DisplayRule) => void; onRemove: () => void }) {
  const filters = parameters.filter((p) => p.type !== 'temporal_unit')
  return (
    <div className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 shrink-0 text-muted-foreground">
          {rule.kind === 'filter' ? <FilterIcon className="size-4" /> : rule.kind === 'query' ? <Code2 className="size-4" /> : <Rows3 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          {rule.kind === 'filter' ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{$t('Le filtre')}</span>
              <Choice
                value={rule.parameter}
                onValueChange={(v) => onChange({ ...rule, parameter: v })}
                options={filters.map((p) => ({ value: p.id, label: filterName(p) }))}
                placeholder={$t('Choisir un filtre')}
                aria-label={$t('Filtre')}
                className="w-44"
              />
              <Choice
                value={rule.test}
                onValueChange={(v) => onChange({ ...rule, test: v as FilterTest })}
                options={(Object.keys(FILTER_TEST_LABELS) as FilterTest[]).map((k) => ({ value: k, label: $t(FILTER_TEST_LABELS[k]) }))}
                aria-label={$t('Test')}
                className="min-w-56 flex-1"
                searchable={false}
              />
              {rule.test === 'equals' || rule.test === 'not_equals' ? (
                <Input value={rule.value ?? ''} onChange={(e) => onChange({ ...rule, value: e.target.value })} placeholder={$t('Valeur')} className="h-8 w-40" />
              ) : null}
            </div>
          ) : rule.kind === 'rows' ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{$t('Le résultat de la carte')}</span>
              <Choice
                value={rule.test}
                onValueChange={(v) => onChange({ ...rule, test: v as RowsTest })}
                options={(Object.keys(ROWS_TEST_LABELS) as RowsTest[]).map((k) => ({ value: k, label: $t(ROWS_TEST_LABELS[k]) }))}
                aria-label={$t('Test')}
                className="w-48"
                searchable={false}
              />
              {rule.test === 'at_least' || rule.test === 'at_most' ? (
                <>
                  <Input type="number" min={0} value={rule.value ?? 1} onChange={(e) => onChange({ ...rule, value: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-24" />
                  <span>{$t('lignes')}</span>
                </>
              ) : null}
            </div>
          ) : (
            <QueryRule rule={rule} parameters={filters} onChange={onChange} />
          )}
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label={$t('Retirer la règle')}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

/** A rule by SQL: its query, each `{{variable}}` tied to a filter and to the column it bears on. */
function QueryRule({ rule, parameters, onChange }: { rule: Extract<DisplayRule, { kind: 'query' }>; parameters: readonly DashboardParameter[]; onChange: (r: DisplayRule) => void }) {
  const names = sqlVariableNames(rule.sql)
  const mappingOf = (name: string) => rule.mappings?.find((m) => 'variable' in m.target && m.target.variable === name)?.parameter ?? ''
  const variableOf = (name: string) => rule.variables?.find((v) => v.name === name)
  // The variables follow the text: one tied by name to a filter of the same name, by default.
  const update = (sql: string, tie: Record<string, { parameter?: string; column?: string }> = {}) => {
    const next = sqlVariableNames(sql)
    const variables = next.map((name) => {
      const parameter = tie[name]?.parameter ?? (mappingOf(name) || parameters.find((p) => p.id === name || filterName(p).toLowerCase() === name.toLowerCase())?.id) ?? ''
      const column = tie[name]?.column ?? variableOf(name)?.column ?? name
      return { name, label: name, type: 'filter' as const, column, column_kind: columnKind(parameters.find((p) => p.id === parameter)) as 'text' | 'number' | 'date', parameter }
    })
    onChange({
      kind: 'query',
      sql,
      variables: variables.map(({ parameter: _p, ...v }) => v),
      mappings: variables.filter((v) => v.parameter).map((v) => ({ parameter: v.parameter, target: { variable: v.name } })),
    })
  }
  return (
    <div className="space-y-2">
      <div className="text-sm">{$t('La requête répond oui')}</div>
      <Textarea
        value={rule.sql}
        onChange={(e) => update(e.target.value)}
        placeholder={'SELECT count(*) > 0\nFROM boutique.public.commandes\nWHERE {{statut}}'}
        className="min-h-24 font-mono text-xs"
        spellCheck={false}
        maxLength={CONDITION_LIMITS.sql}
      />
      <p className="text-[11px] text-muted-foreground">{$t('Oui : la première valeur est vraie — true, un nombre non nul, un texte non vide. Écrivez WHERE {{nom}} pour filtrer comme un filtre du tableau de bord.')}</p>
      {names.length ? (
        <div className="space-y-1.5">
          {names.map((name) => (
            <div key={name} className="flex flex-wrap items-center gap-2 text-xs">
              <code className="rounded bg-muted px-1.5 py-0.5">{`{{${name}}}`}</code>
              <span className="text-muted-foreground">{$t('reçoit')}</span>
              <Choice
                value={mappingOf(name)}
                onValueChange={(v) => update(rule.sql, { [name]: { parameter: v } })}
                options={parameters.map((p) => ({ value: p.id, label: filterName(p) }))}
                placeholder={$t('Choisir un filtre')}
                aria-label={$t('Filtre')}
                className="w-40"
              />
              <span className="text-muted-foreground">{$t('sur la colonne')}</span>
              <Input value={variableOf(name)?.column ?? name} onChange={(e) => update(rule.sql, { [name]: { column: e.target.value } })} className="h-7 w-40 font-mono text-xs" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * « Condition d'affichage » of a card or a tab: rules on the filters — a single value chosen, none,
 * one in particular —, a SQL query's yes or no, the card's own rows. Hidden when it does not hold.
 */
export function ConditionDialog({
  open,
  onOpenChange,
  title,
  condition,
  parameters,
  rows,
  onApply,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  condition: DisplayCondition | undefined
  parameters: readonly DashboardParameter[]
  /** A question card: its own rows can be a rule. */
  rows: boolean
  onApply: (c: DisplayCondition | undefined) => void
}) {
  const [match, setMatch] = useState<'all' | 'any'>(condition?.match ?? 'all')
  const [rules, setRules] = useState<DisplayRule[]>([...(condition?.rules ?? [])])
  // biome-ignore lint/correctness/useExhaustiveDependencies: reopened, it starts from the condition saved
  useEffect(() => {
    if (!open) return
    setMatch(condition?.match ?? 'all')
    setRules([...(condition?.rules ?? [])])
  }, [open])
  const firstFilter = parameters.find((p) => p.type !== 'temporal_unit')?.id ?? ''
  const add = (rule: DisplayRule) => setRules((r) => (r.length >= CONDITION_LIMITS.rules ? r : [...r, rule]))
  const complete = rules.every((r) => (r.kind === 'filter' ? !!r.parameter && ((r.test !== 'equals' && r.test !== 'not_equals') || !!r.value) : r.kind === 'query' ? r.sql.trim() !== '' : true))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{$t('Masquée tant que la condition n’est pas remplie. Une règle sur un filtre se lit sans requête ; une requête SQL tourne avec vos droits.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {rules.length > 1 ? (
            <Segmented
              value={match}
              onValueChange={(v) => setMatch(v as 'all' | 'any')}
              aria-label={$t('Règles')}
              inline
              options={[
                { value: 'all', label: $t('Toutes les règles') },
                { value: 'any', label: $t('Au moins une règle') },
              ]}
            />
          ) : null}
          {rules.map((rule, i) => (
            <RuleRow
              // biome-ignore lint/suspicious/noArrayIndexKey: rules have no id; they are edited in place
              key={i}
              rule={rule}
              parameters={parameters}
              onChange={(r) => setRules((all) => all.map((x, j) => (j === i ? r : x)))}
              onRemove={() => setRules((all) => all.filter((_, j) => j !== i))}
            />
          ))}
          {rules.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{$t('Aucune règle : toujours affichée.')}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!parameters.length} onClick={() => add({ kind: 'filter', parameter: firstFilter, test: 'one' })}>
              <Plus /> {$t('Sur un filtre')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => add({ kind: 'query', sql: '' })}>
              <Plus /> {$t('Requête SQL')}
            </Button>
            {rows ? (
              <Button size="sm" variant="outline" onClick={() => add({ kind: 'rows', test: 'some' })}>
                <Plus /> {$t('Sur le résultat de la carte')}
              </Button>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          {condition ? (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => {
                onApply(undefined)
                onOpenChange(false)
              }}
            >
              {$t('Retirer la condition')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {$t('Annuler')}
          </Button>
          <Button
            disabled={!complete}
            onClick={() => {
              onApply(rules.length ? { match, rules } : undefined)
              onOpenChange(false)
            }}
          >
            {$t('Appliquer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A condition said in a few words, for the badge of a card or a tab being edited. */
export function conditionSummary(condition: DisplayCondition, parameters: readonly DashboardParameter[]): string {
  const said = condition.rules.map((r) => {
    if (r.kind === 'filter') {
      const p = parameters.find((x) => x.id === r.parameter)
      return `${p ? filterName(p) : '?'} ${$t(FILTER_TEST_LABELS[r.test])}${r.value ? ` « ${r.value} »` : ''}`
    }
    if (r.kind === 'rows') return `${$t('Résultat')} ${$t(ROWS_TEST_LABELS[r.test])}${r.test === 'at_least' || r.test === 'at_most' ? ` ${r.value ?? 1}` : ''}`
    return $t('Requête SQL')
  })
  return said.join(condition.match === 'any' ? ` ${$t('ou')} ` : ` ${$t('et')} `)
}
