# Translating the eodia insights interface

You translate the user interface of **eodia insights** — an open-source BI tool (questions,
dashboards, data sources and their structure, permissions enforced by Trino, an AI copilot,
REST API and MCP server) — from French into ONE target language (English or Spanish).

## How it works

Every UI text is written in French in the code: `$t('Enregistrer')`,
`$t('Nouveau champ dans {table}', { table })`, `$tp(n, '{count} ligne', '{count} lignes')`,
`msg('Barres')` (a label translated where it is shown). The French sentence is the key.

## Input / output

- Your batch: `tooling/i18n/batches/app-NN.json`. Each entry, keyed by the French sentence, is
  `{ "fr": "…", "where": [...] }` or, for a count-dependent sentence,
  `{ "one": "…", "other": "…", "where": [...] }` (French singular/plural; the key is the plural).
  `where` is `file:line` under `apps/web/src` (or a repo path): open it whenever a short label
  is ambiguous (« Carte » = card or map; « Note » = rating; « Tendance » = trend card…).
- Write ONE JSON file (path given in your task) with **exactly the same keys** (copy them
  character for character — non-breaking spaces, ’, « », … included) and as value:
  - a sentence → its translation (string);
  - a plural → an object with exactly these categories: English `{ "one", "other" }`;
    Spanish `{ "one", "many", "other" }` (Spanish `many` is used for millions: write it like
    `other`, e.g. `"{count} filas"`).
- Write the file with a Python script (`json.dump(obj, f, ensure_ascii=False, indent=2)`),
  not a shell heredoc. Then run, from /home/user/insights:
  `node tooling/i18n/check-part.mjs <en|es> tooling/i18n/batches/app-NN.json <your file>`
  and fix until it prints `0 missing, 0 errors, 0 unknown keys`.

## Rules

- Placeholders `{name}` stay exactly as written (never translated), may move. `{count}` is the
  number. `{{user.region}}`-style double braces are code: keep them.
- Keep untranslated: product names (eodia insights, Trino, PostgreSQL, MySQL, MongoDB,
  Snowflake, Oracle, Claude, MCP, OpenAPI, SQL, OIDC/SSO, CSV, JSON), code, SQL keywords and
  function names, identifiers, units (ms), file extensions, example hostnames/values like
  `db.exemple.fr`, `ORCLPDB1`, `xy12345.eu-west-1`, `tpch.splits-per-node=4`.
- A key `Mot||sens` = the word before `||`, in the meaning after it: translate the word only;
  never output the `||` part.
- Fragments (start/end with a space, ` · `, ` — `): keep the same leading/trailing spaces and
  punctuation.
- Style: sentence case (not Title Case) for labels and buttons, as modern product UIs do;
  short labels stay short; no French typography (no space before `:` `;` `?` `!`, no « »:
  use “ ” in English and « » or “ ” in Spanish as Spanish UIs do — prefer “ ”). Spanish: address
  the user as **tú** (Haz clic, Elige…), neutral international Spanish.
- Example data in examples stays as is unless it is a plain French word meant to read in the
  user's language (e.g. « Ventes » as a sample folder name → Sales / Ventas).
- Date examples in format labels (e.g. « Par défaut ({example}) ») keep their placeholders.

## Glossary (French → English → Spanish)

| French | English | Spanish |
|---|---|---|
| question | question | pregunta |
| tableau de bord | dashboard | panel |
| carte (d'un tableau de bord) | card | tarjeta |
| carte (géographique) | map | mapa |
| onglet | tab | pestaña |
| dossier / sous-dossier | folder / subfolder | carpeta / subcarpeta |
| collection personnelle | personal collection | colección personal |
| source (de données) | data source | fuente de datos |
| synchronisation | sync | sincronización |
| empreinte | fingerprint | huella |
| Structure (écran) | Structure | Estructura |
| modèle | model | modelo |
| métrique | metric | métrica |
| mesure | measure | medida |
| dimension | dimension | dimensión |
| type sémantique | semantic type | tipo semántico |
| visibilité : Normale / Masquée / Technique | Normal / Hidden / Technical | Normal / Oculta / Técnica |
| filtre / paramètre | filter / parameter | filtro / parámetro |
| filtre associatif | associative filter | filtro asociativo |
| valeurs possibles / exclues | possible / excluded values | valores posibles / excluidos |
| jointure | join | unión |
| regroupement / agrégation | grouping / aggregation | agrupación / agregación |
| prévision | forecast | previsión |
| course de barres / de courbes | bar race / line race | carrera de barras / de líneas |
| droits / permissions | permissions | permisos |
| groupe | group | grupo |
| Administrateurs / Tous les utilisateurs | Administrators / All users | Administradores / Todos los usuarios |
| règle de lignes | row rule | regla de filas |
| masque (colonne) | mask | máscara |
| niveau de requête | query level | nivel de consulta |
| partage / lien de partage | sharing / share link | uso compartido / enlace para compartir |
| intégration signée | signed embedding | inserción firmada |
| jeton d'intégration | integration token | token de integración |
| copilot | copilot | copiloto |
| historique | history | historial |
| éditeur SQL | SQL editor | editor SQL |
| requête | query | consulta |
| résultat | result | resultado |
| ligne (de résultat) | row | fila |
| colonne | column | columna |
| Tableau (visualisation) | Table | Tabla |
| Tableau croisé | Pivot table | Tabla dinámica |
| Camembert | Pie | Circular |
| Entonnoir | Funnel | Embudo |
| Nuage de points | Scatter | Dispersión |
| Jauge | Gauge | Indicador |
| Barres / Barres horizontales | Bar / Row | Barras / Barras horizontales |
| Lignes / Aires / Combiné | Line / Area / Combo | Líneas / Áreas / Combinado |
| Autres (catégorie regroupée) | Other | Otros |
| Enregistrer / Annuler / Supprimer | Save / Cancel / Delete | Guardar / Cancelar / Eliminar |
| Rafraîchir | Refresh | Actualizar |
| picto / pictogramme | icon | icono |
| Langue du navigateur | Browser language | Idioma del navegador |
