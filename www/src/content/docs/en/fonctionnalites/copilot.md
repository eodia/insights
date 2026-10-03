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
| `propose_question` | suggest a question: SQL and visualization |
| `propose_dashboard` | suggest a dashboard, or cards to add to the open dashboard |
| `propose_metadata` | suggest metadata for a table |

The descriptions, semantic types and values you enter in
[Structure](/insights/en/fonctionnalites/sources/#the-structure-screen) are part of its context:
the better your tables are described, the more accurate its answers.

Answers arrive **continuously** (streaming), and conversations are **kept per person**: **New
conversation** starts another one.

## It suggests, you apply

The copilot **changes nothing by itself**. A suggestion appears in the panel with an **Apply**
(or **Open**) button: the question opens in the editor, the cards are
added to the dashboard, the description is written into Structure — only when you click.

## Its safeguards

- **It reads under your permissions.** `run_query` goes through Trino under your identity, like
  any other query: your row rules apply, hidden columns do not exist for it, and masked columns
  reach it masked.
- **It runs nothing without your consent.** The **Allow running queries (with your
  permissions)** switch, off by default,
  applies to the conversation. When it is off, the copilot writes queries without running them.
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
| `EODIA_AI_PROVIDER` | `anthropic` if `ANTHROPIC_API_KEY` is set, otherwise `openai` if `OPENAI_API_KEY` is, otherwise `none` | `anthropic`, `openai`, `mistral`, `openai-compatible` or `none` |
| `EODIA_AI_API_KEY` | `ANTHROPIC_API_KEY`, otherwise `OPENAI_API_KEY` | the provider’s key |
| `EODIA_AI_MODEL` | `claude-sonnet-5-5` (Anthropic), `mistral-large-latest` (Mistral), `gpt-4.1` (the others) | the model |
| `EODIA_AI_BASE_URL` | the provider’s URL | required for `openai-compatible` |
| `EODIA_AI_HOURLY_QUOTA` | `60` | messages per person per hour |

A few examples:

```bash
# Anthropic
EODIA_AI_PROVIDER=anthropic
EODIA_AI_API_KEY=sk-ant-…

# Mistral
EODIA_AI_PROVIDER=mistral
EODIA_AI_API_KEY=…

# An OpenAI-compatible server (gateway, local model…)
EODIA_AI_PROVIDER=openai-compatible
EODIA_AI_BASE_URL=https://llm.example.com/v1
EODIA_AI_API_KEY=…
EODIA_AI_MODEL=my-model
```

:::note[A key is always required]
Without a key, the copilot stays disabled, including for `openai-compatible`: give
`EODIA_AI_API_KEY` a value even if your server does not check it.
:::

**Administration › Settings** shows the provider, the model, the
quota and whether the configuration is complete. When a person reaches their quota, the copilot
tells them so and invites them to try again later.
