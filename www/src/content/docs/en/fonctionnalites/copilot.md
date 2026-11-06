---
title: Copilot
description: The eodia insights AI assistant — providers, what it can do, its safeguards, its quotas and its configuration.
---

The **copilot** is an assistant that knows your sources: it searches for tables, reads their
descriptions, writes Trino SQL, and **suggests** questions, dashboards or table descriptions to
you. It opens from the **Copilot** button in the top bar, from the home page (**Ask the
copilot**), in the SQL editor, a question, a dashboard or the
Structure screen.

It is optional: without a configured provider, its buttons do not appear.

:::tip[Talk rather than work alongside]
The same engine has its own screen: the [AI assistant](/insights/en/fonctionnalites/assistant/),
with a conversation history, interactive charts in its answers and a source filter.
:::

## What it can do

The panel keeps the **context** of the screen it is opened from:

| Screen | What you might ask it |
|---|---|
| Home, or all data | “What is the revenue by region over the last 6 months?” |
| SQL editor | write a query; **Fix with the copilot** passes it the Trino error |
| Question | modify or explain the current question |
| Dashboard | “Build a customer service dashboard”, or add cards |
| Structure | **Describe with the copilot**: labels, descriptions and semantic types of a table |

To do so, it has tools:

| Tool | Role |
|---|---|
| `search_schema` | search for tables, models and metrics by keywords |
| `describe_table` | read a table: columns, Trino types, semantic types, descriptions, values, relationships |
| `list_metrics` | list the metrics and models defined by the team |
| `run_query` | run a read-only query, under your permissions — if you allow it |
| `show_chart` | show a chart in the conversation |
| `propose_question` | suggest a question: SQL and visualization |
| `propose_dashboard` | suggest a dashboard, or cards to add to the open dashboard |
| `propose_metadata` | suggest metadata for a table |
| `find_filter_values`, `set_filters` | on a dashboard: find a filter's values, then set the filters |

The descriptions, semantic types and values you enter in
[Structure](/insights/en/fonctionnalites/sources/#the-structure-screen) are part of its context:
the better your tables are described, the more accurate its answers.

Answers arrive **continuously** (streaming), and conversations are **kept per person**: the
panel takes its conversation along from one screen to the next, **New conversation** starts
another one, and **History** lists the recent conversations, to reopen or delete.

It **shows charts** in its answers — **Add to a dashboard** turns one into a card, in one click —
and its SQL is formatted and coloured as in the editor. The SQL it suggests is first **checked by
Trino**, under your permissions and without reading any data: a suggestion that would fail is
never shown to you.

## Filtering by voice

On a dashboard, the copilot **sets the filters** from a sentence: “show me Brittany in March”. It
looks up the filters' actual values (“brittany” → “Bretagne”), sets them, and says so in one
sentence; “all regions” removes the filter. The filters apply at once, as if you had chosen them —
a question about the data (“which channel sells most?”) leaves them alone.

The **microphone**, in the input area, dictates the question: the text is written as you speak,
and is sent when you stop. The answer to a question asked aloud is **read aloud**, without its
code or tables. Voice mode works in the [assistant](/insights/en/fonctionnalites/assistant/) too.

:::note[Dictation depends on the browser]
Speech recognition is the browser's own: Chrome and Edge send the sound to their maker's service
to be written down; Firefox has none, and the microphone is then not offered. Reading aloud
happens on the device.
:::

## It suggests, you apply

The copilot **changes nothing by itself**. A suggestion appears in the panel with an **Apply**
(or **Open**) button: the question opens in the editor, the cards are
added to the dashboard, the description is written into Structure — only when you click. Only a
dashboard's filters, when you ask it to set them, apply directly: they change only what you see,
nothing is saved.

## Its safeguards

- **It reads under your permissions.** `run_query` goes through Trino under your identity, like
  any other query: your row rules apply, hidden columns do not exist for it, and masked columns
  reach it masked.
- **It reads nothing without your consent.** The **Allow access** button, in the input area, off
  by default, lets it run queries under your permissions. When it is off, the copilot writes
  queries without running them.
- **It only receives an excerpt** of each result: 40 rows at most.
- **A quota** limits the number of messages per person per hour.
- **Every call is logged**: provider, model, screen, tokens consumed, tools used, duration, any
  error.

Its queries appear in the [history](/insights/en/fonctionnalites/questions/#query-history) with
the origin “copilot”.

## Configuring a provider

The copilot is configured through the API and worker environment variables:

| Variable | Default | Role |
|---|---|---|
| `AI_PROVIDER` | `anthropic` if `ANTHROPIC_API_KEY` is set, otherwise `openai` if `OPENAI_API_KEY` is, otherwise `none` | `anthropic`, `openai`, `mistral`, `openai-compatible` or `none` |
| `AI_API_KEY` | `ANTHROPIC_API_KEY`, otherwise `OPENAI_API_KEY` | the provider’s key |
| `AI_MODEL` | `claude-sonnet-5-5` (Anthropic), `mistral-large-latest` (Mistral), `gpt-4.1` (the others) | the model |
| `AI_BASE_URL` | the provider’s URL | required for `openai-compatible` |
| `AI_HOURLY_QUOTA` | `60` | messages per person per hour |
| `AI_PROVIDER_SSL_VERIFY` | `true` | `false`: the provider’s certificate is not checked |

A few examples:

```bash
# Anthropic
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-…

# Mistral
AI_PROVIDER=mistral
AI_API_KEY=…

# An OpenAI-compatible server (gateway, local model…)
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://llm.example.com/v1
AI_API_KEY=…
AI_MODEL=my-model
```

:::note[A key is always required]
Without a key, the copilot stays disabled, including for `openai-compatible`: give
`AI_API_KEY` a value even if your server does not check it.
:::

:::caution[A certificate Node.js does not recognise]
Behind a corporate proxy that re-signs traffic, or in front of an internal server with a
self-signed certificate, calls to the provider fail on a certificate error.
`AI_PROVIDER_SSL_VERIFY=false` lifts the check for those calls only: Trino, the identity provider
and the mail server keep theirs. Traffic stays encrypted, but the server's identity is no longer
proven: keep it to a network you control. The API reminds you of it at startup.
:::

**Administration › Settings** shows the provider, the model, the
quota and whether the configuration is complete. When a person reaches their quota, the copilot
tells them so and invites them to try again later.
