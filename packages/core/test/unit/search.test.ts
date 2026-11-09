import { describe, expect, it } from 'vitest'
import { searched } from '../../src/query/run'

describe('searched', () => {
  it('keeps the rows where one of the columns holds the text, whatever the case', () => {
    const sql = searched('SELECT canal, statut FROM t', { text: 'Rembours', columns: ['canal', 'statut'] })
    expect(sql).toBe(
      `SELECT * FROM (\nSELECT canal, statut FROM t\n) AS "__search" WHERE strpos(lower(try(CAST("canal" AS varchar))), 'rembours') > 0 OR strpos(lower(try(CAST("statut" AS varchar))), 'rembours') > 0`,
    )
  })

  it('never lets the text or a column name out as SQL', () => {
    const sql = searched('SELECT 1 AS a', { text: "x') > 0 OR 1=1 --", columns: ['a" FROM secrets --'] })
    expect(sql).toContain(`'x'') > 0 or 1=1 --'`)
    expect(sql).toContain('"a"" FROM secrets --"')
  })
})
