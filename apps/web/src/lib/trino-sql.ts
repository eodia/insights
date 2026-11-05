/** Trino's words beyond standard SQL — functions and clauses —, coloured as keywords in the editor and in answers. */
export const TRINO_KEYWORDS =
  'approx_distinct approx_percentile date_trunc date_add date_diff date_format format_datetime from_iso8601_timestamp at time zone interval unnest cross join lateral try_cast try coalesce nullif array_agg map_agg count_if bool_and bool_or arbitrary any_value max_by min_by histogram regexp_like regexp_extract split_part strpos json_extract_scalar json_extract greatest least row_number rank dense_rank lag lead ntile over partition rows range preceding following unbounded current row tablesample bernoulli system table query'

/**
 * Standard SQL's words. CodeMirror's SQL dialect replaces its own list by the one given: given
 * Trino's alone, SELECT or GROUP BY would no longer be read as keywords.
 */
export const SQL_KEYWORDS =
  'select from where group by order having limit offset fetch first next only join inner left right full outer cross natural on using as and or not in is null like ilike escape between case when then else end distinct all union intersect except with recursive values insert into update set delete merge create replace table view materialized drop alter add column rename to if exists asc desc nulls last over partition window rows range filter within cast any some true false interval date time timestamp zone extract show describe explain analyze grant revoke'

/** Every keyword the editor and the answers colour: standard SQL, then Trino's own. */
export const ALL_SQL_KEYWORDS = `${SQL_KEYWORDS} ${TRINO_KEYWORDS}`
