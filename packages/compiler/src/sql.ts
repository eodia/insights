/** Citation et littéraux Trino : rien d'une valeur ne passe dans le SQL sans eux. */

export const ident = (name: string): string => `"${name.replace(/"/g, '""')}"`

export const qualified = (...parts: string[]): string => parts.map(ident).join('.')

export const str = (value: string): string => `'${value.replace(/'/g, "''")}'`

const DAY = /^\d{4}-\d{2}-\d{2}$/
const STAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/

export function dateLiteral(day: string): string {
  if (!DAY.test(day)) throw new CompileError(`Date invalide : ${day}`)
  return `DATE ${str(day)}`
}

export function timestampLiteral(value: string): string {
  const v = DAY.test(value) ? `${value} 00:00:00` : value.replace('T', ' ')
  if (!STAMP.test(v)) throw new CompileError(`Horodatage invalide : ${value}`)
  return `TIMESTAMP ${str(v)}`
}

export function numberLiteral(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n)) throw new CompileError(`Nombre invalide : ${String(value)}`)
  return String(n)
}

/** A literal for any value, by what the column holds. */
export function literalFor(kind: string, value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (kind === 'number') return numberLiteral(value)
  if (kind === 'boolean') {
    const v = String(value).toLowerCase()
    return v === 'true' || v === '1' || v === 'oui' ? 'TRUE' : 'FALSE'
  }
  if (kind === 'date') return dateLiteral(String(value).slice(0, 10))
  if (kind === 'datetime') return timestampLiteral(String(value))
  return str(String(value))
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompileError'
  }
}
