# La démo publique

Une instance d'eodia insights ouverte à tous, sur des données fictives mais vivantes : **Maison
Arvor**, une boutique en ligne française. Le visiteur entre en un clic, explore, construit ses
questions, interroge l'assistant ; chaque nuit, tout repart de zéro.

## Ce qu'on y trouve

Deux sources, générées au démarrage et datées par rapport au jour même — trois ans d'historique
jusqu'à aujourd'hui, la démo ne vieillit pas :

- **Boutique** (PostgreSQL) : 16 000 clients, ~57 000 commandes, 96 produits, avis, objectifs
  mensuels, dépenses marketing, entrepôts et un calendrier des événements ;
- **Support client** (MongoDB) : ~4 500 tickets et ~130 000 événements de navigation sur 90 jours.

Les données racontent des histoires, que les tableaux de bord mettent en scène :

| Histoire | Où la voir |
|---|---|
| Croissance de ~35 % par an, Noël, août creux, soldes, Black Friday | Pilotage, Ventes › Tendances (calendrier) |
| L'application mobile prend 45 % des commandes en six mois | Ventes › Tendances (part des canaux) |
| Une campagne TV fait bondir les inscriptions | Acquisition et fidélité |
| Le parrainage fidélise deux fois mieux que les réseaux sociaux | Acquisition et fidélité (coût et valeur à 12 mois, cohortes) |
| L'entrepôt de Rennes divise par trois le délai de l'Ouest, qui croît deux fois plus vite | Livraisons, Pilotage (croissance par région) |
| Les écouteurs Kerys Air 2 : succès, défaut de batterie, avis effondrés, rappel | Produits et marges |
| Une grève du transporteur : retards, annulations, tickets ×4, satisfaction en chute | Livraisons, Service client |
| Un bug de paiement mobile : la conversion finale passe de 80 % à 17 % | Acquisition et fidélité (tunnel) |

Et ce qui fait la différence d'eodia insights :

- **deux espaces** : « Maison Arvor » (la boutique, sa base PostgreSQL) et « Service client »
  (le support, sa base MongoDB), chacun partageant sa source avec l'autre ; le sélecteur en haut
  de la barre latérale passe de l'un à l'autre, et le lien « Service client » du tableau de
  pilotage y bascule de lui-même ;
- **requêtes inter-bases** : les tickets MongoDB joints aux clients PostgreSQL dans une seule
  requête (Service client) ;
- **sécurité appliquée par Trino** : sous le profil « Analyste en Bretagne », les mêmes tableaux
  ne montrent que sa région et son canal, les e-mails masqués ;
- **prévisions** saisonnières, carte, tunnel, cohortes, course de barres, calendrier ;
- **l'assistant IA**, si une clé est fournie.

## Déployer

Il faut un serveur avec Docker (Compose v2) et **4 Go de mémoire** au moins (Trino en prend 2),
et un nom de domaine qui pointe dessus.

```bash
git clone https://github.com/eodia/insights.git /opt/eodia-insights
cd /opt/eodia-insights
cp .env.demo.example .env
# renseignez DOMAIN, SECRET_KEY (openssl rand -hex 32), OPA_SECRET (openssl rand -hex 24)
docker compose -f docker-compose.demo.yml up -d
```

Le premier démarrage prend deux à trois minutes : les bases d'exemple se remplissent (~30 s),
Trino démarre, puis le worker synchronise les sources et crée la démo. Caddy obtient le
certificat HTTPS tout seul.

L'image vient de Docker Hub (`eodia/insights:latest`) ; pour construire celle du dépôt :
`docker compose -f docker-compose.demo.yml up -d --build`, ou `IMAGE=…` pour une autre.

### Derrière un proxy existant

Si le serveur a déjà un nginx ou un Traefik qui gère le HTTPS, Caddy sert en HTTP sur un port
local, et le proxy lui relaie tout le domaine — sans tampon, pour l'assistant et la
progression des synchronisations (SSE) :

```bash
# .env
CADDY_SITE=:80
HTTP_PORT=127.0.0.1:8088
HTTPS_PORT=127.0.0.1:8443
```

```nginx
server {
  server_name demo.exemple.fr;
  # … certificat …
  location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
}
```

### Remise à zéro chaque nuit

```bash
crontab -e
0 4 * * * sh /opt/eodia-insights/scripts/demo-reset.sh >> /var/log/eodia-demo.log 2>&1
```

Le script tire la dernière image, recrée les conteneurs et leurs volumes anonymes (catalogue,
bases d'exemple), garde les certificats. Deux à trois minutes d'indisponibilité.

### L'assistant IA

Sans clé, il est désactivé. Avec une clé (`AI_PROVIDER`, `AI_API_KEY`), chaque compte a droit à
`AI_HOURLY_QUOTA` messages par heure (30 par défaut) — les visiteurs partagent deux comptes :
c'est aussi le plafond de la facture.

## Ce qui est verrouillé

`DEMO_PUBLIC=1` (posé par `docker-compose.demo.yml`) ferme ce qui touche à l'instance
elle-même (`apps/api/src/demo-guard.ts`) :

- les connexions aux bases (création, test, modification, suppression) et leurs partages ;
- les espaces et leurs membres (on passe librement de l'un à l'autre) ;
- l'administration : personnes, invitations, groupes, droits, réglages ;
- le nom et le mot de passe des comptes de démonstration ;
- le contenu créé par « Équipe data » : il ne se modifie ni ne se supprime, il se **duplique**.

Tout le reste s'essaie : créer des questions et des tableaux de bord, l'éditeur SQL, décrire
des colonnes, partager, l'assistant, les jetons d'API et le serveur MCP. Les requêtes d'un
visiteur sont limitées à 30 secondes et 5 000 lignes.

## En développement

La même démo se crée au premier démarrage d'un catalogue vide (`DEMO=1` par défaut en dev),
sur les bases de `docker compose up -d`. Pour la régénérer :

```bash
docker compose rm -sfv demo-pg demo-mongo && docker compose up -d demo-pg demo-mongo
```

— puis videz le catalogue de développement pour que la démo soit recréée.
