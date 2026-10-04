---
title: Copilot
description: L’assistant IA d’eodia insights — fournisseurs, ce qu’il sait faire, ses garde-fous, ses quotas et sa configuration.
---

Le **copilot** est un assistant qui connaît vos sources : il cherche les tables, lit leurs
descriptions, écrit du SQL Trino, et vous **propose** des questions, des tableaux de bord ou des
descriptions de tables. Il s’ouvre par le bouton **Copilote** de la barre du haut, depuis
l’accueil (« Demander au copilote »), dans l’éditeur SQL, une question, un tableau de bord ou
l’écran Structure.

Il est facultatif : sans fournisseur configuré, ses boutons restent absents.

:::tip[Converser plutôt que travailler à côté]
Le même moteur a son écran : l’[assistant IA](/insights/fonctionnalites/assistant/), avec un
historique de conversations, des graphiques interactifs dans les réponses et un filtre des sources.
:::

## Ce qu’il sait faire

Le panneau garde le **contexte** de l’écran d’où on l’ouvre :

| Écran | Ce qu’on lui demande, par exemple |
|---|---|
| Accueil, ou toutes les données | « Quel est le chiffre d’affaires par région sur les 6 derniers mois ? » |
| Éditeur SQL | écrire une requête ; **Corriger avec le copilote** lui passe l’erreur de Trino |
| Question | modifier ou expliquer la question en cours |
| Tableau de bord | « Construis un tableau de bord du service client », ou ajouter des cartes |
| Structure | **Décrire avec le copilot** : libellés, descriptions et types sémantiques d’une table |

Pour y parvenir, il dispose d’outils :

| Outil | Rôle |
|---|---|
| `search_schema` | chercher des tables, modèles et métriques par mots-clés |
| `describe_table` | lire une table : colonnes, types Trino, types sémantiques, descriptions, valeurs, relations |
| `list_metrics` | lister les métriques et les modèles définis par l’équipe |
| `run_query` | exécuter une requête en lecture seule, sous vos droits — si vous l’y autorisez |
| `propose_question` | proposer une question : SQL et visualisation |
| `propose_dashboard` | proposer un tableau de bord, ou des cartes à ajouter au tableau ouvert |
| `propose_metadata` | proposer des métadonnées pour une table |

Les descriptions, types sémantiques et valeurs que vous saisissez dans
[Structure](/insights/fonctionnalites/sources/#lécran-structure) font partie de son contexte :
plus vos tables sont décrites, plus ses réponses sont justes.

Les réponses arrivent **en continu** (streaming), et les conversations sont **gardées par
personne** : **Nouvelle conversation** en ouvre une autre.

## Il propose, vous appliquez

Le copilot **ne modifie rien lui-même**. Une proposition s’affiche dans le panneau avec un bouton
**Appliquer** (ou **Ouvrir**) : la question s’ouvre dans l’éditeur, les cartes s’ajoutent au
tableau, la description s’écrit dans Structure — seulement sur votre clic.

## Ses garde-fous

- **Il lit sous vos droits.** `run_query` passe par Trino sous votre identité, comme toute autre
  requête : vos règles de ligne s’appliquent, les colonnes cachées n’existent pas pour lui et les
  colonnes masquées lui arrivent masquées.
- **Il n’exécute rien sans votre accord.** L’interrupteur **Autoriser l’exécution de requêtes
  (sous vos droits)**, éteint par défaut, vaut pour la conversation. Éteint, le copilot écrit les
  requêtes sans les lancer.
- **Il ne reçoit qu’un extrait** de chaque résultat : 40 lignes au plus.
- **Un quota** limite le nombre de messages par personne et par heure.
- **Chaque appel est journalisé** : fournisseur, modèle, écran, jetons consommés, outils
  employés, durée, erreur éventuelle.

Ses requêtes apparaissent dans l’[historique](/insights/fonctionnalites/questions/#lhistorique-des-requêtes)
avec l’origine « copilot ».

## Configurer un fournisseur

Le copilot se configure par les variables d’environnement de l’API et du worker :

| Variable | Défaut | Rôle |
|---|---|---|
| `AI_PROVIDER` | `anthropic` si `ANTHROPIC_API_KEY` est définie, sinon `openai` si `OPENAI_API_KEY` l’est, sinon `none` | `anthropic`, `openai`, `mistral`, `openai-compatible` ou `none` |
| `AI_API_KEY` | `ANTHROPIC_API_KEY`, sinon `OPENAI_API_KEY` | la clé du fournisseur |
| `AI_MODEL` | `claude-sonnet-5-5` (Anthropic), `mistral-large-latest` (Mistral), `gpt-4.1` (les autres) | le modèle |
| `AI_BASE_URL` | l’adresse du fournisseur | obligatoire pour `openai-compatible` |
| `AI_HOURLY_QUOTA` | `60` | messages par personne et par heure |

Quelques exemples :

```bash
# Anthropic
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-…

# Mistral
AI_PROVIDER=mistral
AI_API_KEY=…

# Un serveur compatible OpenAI (passerelle, modèle local…)
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://llm.exemple.fr/v1
AI_API_KEY=…
AI_MODEL=mon-modele
```

:::note[Une clé est toujours nécessaire]
Sans clé, le copilot reste désactivé, y compris pour `openai-compatible` : donnez une valeur à
`AI_API_KEY` même si votre serveur n’en vérifie pas.
:::

**Administration › Réglages** montre le fournisseur, le modèle, le quota et si la configuration
est complète. Quand une personne atteint son quota, le copilot le lui dit et l’invite à
réessayer plus tard.
