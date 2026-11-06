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
| `show_chart` | montrer un graphique dans la conversation |
| `propose_question` | proposer une question : SQL et visualisation |
| `propose_dashboard` | proposer un tableau de bord, ou des cartes à ajouter au tableau ouvert |
| `propose_metadata` | proposer des métadonnées pour une table |
| `find_filter_values`, `set_filters` | sur un tableau de bord : trouver les valeurs d’un filtre, puis poser les filtres |

Les descriptions, types sémantiques et valeurs que vous saisissez dans
[Structure](/insights/fonctionnalites/sources/#lécran-structure) font partie de son contexte :
plus vos tables sont décrites, plus ses réponses sont justes.

Les réponses arrivent **en continu** (streaming), et les conversations sont **gardées par
personne** : le panneau reprend la sienne d’un écran à l’autre, **Nouvelle conversation** en ouvre
une autre, et **Historique** liste les conversations récentes, à rouvrir ou à supprimer.

Il **montre des graphiques** dans ses réponses — **Ajouter à un tableau de bord** en fait une
carte, d’un clic — et son SQL est mis en forme et coloré comme dans l’éditeur. Le SQL qu’il
propose est d’abord **vérifié par Trino**, sous vos droits et sans lire de données : une requête
qui ne passerait pas ne vous est pas montrée.

## Filtrer à la voix

Sur un tableau de bord, le copilot **pose les filtres** à partir d’une phrase : « montre-moi la
Bretagne en mars ». Il cherche les valeurs réelles des filtres (« bretagne » → « Bretagne »), les
pose, et le dit en une phrase ; « toutes les régions » retire le filtre. Les filtres s’appliquent
aussitôt, comme si vous les aviez choisis — une question sur les données (« quel canal vend le
plus ? ») ne les touche pas.

Le **micro**, dans la zone de saisie, dicte la question : le texte s’écrit pendant que vous
parlez, et part quand vous vous arrêtez. La réponse à une question posée à voix haute est **lue à
voix haute**, sans son code ni ses tableaux. Le mode vocal marche aussi dans
l’[assistant](/insights/fonctionnalites/assistant/).

:::note[La dictée dépend du navigateur]
La reconnaissance vocale est celle du navigateur : Chrome et Edge envoient le son au service de
leur éditeur pour l’écrire ; Firefox n’en a pas, et le micro n’est alors pas proposé. La lecture
à voix haute se fait sur l’appareil.
:::

## Il propose, vous appliquez

Le copilot **ne modifie rien lui-même**. Une proposition s’affiche dans le panneau avec un bouton
**Appliquer** (ou **Ouvrir**) : la question s’ouvre dans l’éditeur, les cartes s’ajoutent au
tableau, la description s’écrit dans Structure — seulement sur votre clic. Seuls les filtres d’un
tableau de bord, que vous lui demandez de poser, s’appliquent directement : ils ne changent que
votre affichage, rien n’est enregistré.

## Ses garde-fous

- **Il lit sous vos droits.** `run_query` passe par Trino sous votre identité, comme toute autre
  requête : vos règles de ligne s’appliquent, les colonnes cachées n’existent pas pour lui et les
  colonnes masquées lui arrivent masquées.
- **Il ne lit rien sans votre accord.** Le bouton **Autoriser l’accès**, dans la zone de
  saisie, éteint par défaut, lui permet d’exécuter des requêtes sous vos droits. Éteint, le
  copilot écrit les requêtes sans les lancer.
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
| `AI_PROVIDER_SSL_VERIFY` | `true` | `false` : le certificat du fournisseur n’est pas vérifié |

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

:::caution[Un certificat que Node.js ne reconnaît pas]
Derrière un proxy d’entreprise qui re-signe le trafic, ou devant un serveur interne au certificat
auto-signé, l’appel au fournisseur échoue sur une erreur de certificat. `AI_PROVIDER_SSL_VERIFY=false`
lève la vérification pour ces appels seulement : Trino, le fournisseur d’identité et le serveur
d’e-mails gardent la leur. Le trafic reste chiffré, mais l’identité du serveur n’est plus prouvée :
réservez-le à un réseau que vous maîtrisez. L’API le rappelle au démarrage.
:::

**Administration › Réglages** montre le fournisseur, le modèle, le quota et si la configuration
est complète. Quand une personne atteint son quota, le copilot le lui dit et l’invite à
réessayer plus tard.
