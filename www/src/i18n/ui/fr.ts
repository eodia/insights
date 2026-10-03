/**
 * The French texts of the landing page — the source every other language translates.
 *
 * - HTML strings (they hold `<strong>`, `<code>`, `<a>`) are rendered as HTML.
 * - Addresses of the site are written as on the French site, from the root and without
 *   `/insights`: `/fonctionnalites/droits/`, `<a href="/guides/installation/">`. The page
 *   gives them the reader's language; external addresses (`https://…`) stay as they are.
 * - `{name}` stands for a value the page fills in (`{n}`, `{year}`…).
 * - Records keyed by name (`faq.items`, `features.items`…) are shown in the order of this
 *   file; a translation overrides them one key at a time. A list is translated whole.
 *
 * See `../README.md`.
 */
import type { Link, Question, Tile } from '../types';

const tile = (t: Tile): Tile => t;
const question = (q: Question): Question => q;
const link = (l: Link): Link => l;

const fr = {
	meta: {
		title: 'eodia insights — la BI open source où Trino applique vos droits',
		description:
			'Questions sans SQL ou en SQL, tableaux de bord, copilot IA, API et serveur MCP — sur PostgreSQL, MySQL, SQL Server, Oracle, Snowflake et MongoDB à la fois, avec des droits par ligne et par colonne appliqués par Trino lui-même. Auto-hébergé, AGPL-3.0.',
	},

	/** Who makes eodia insights. */
	eodia: {
		home: 'https://eodia.com/fr/',
	},

	nav: {
		aria: 'Navigation principale',
		home: 'eodia insights, accueil',
		github: 'eodia insights sur GitHub',
		install: 'Installer',
		docs: 'Documentation',
		menu: {
			open: 'Ouvrir le menu',
			close: 'Fermer le menu',
			product: {
				label: 'Produit',
				groups: {
					explore: {
						title: 'Explorer',
						items: {
							sources: { href: '/fonctionnalites/sources/', title: 'Sources', text: 'Sept moteurs, un schéma synchronisé et décrit.' },
							questions: { href: '/fonctionnalites/questions/', title: 'Questions', text: 'Sans SQL, en SQL Trino ou en SQL natif.' },
							models: { href: '/fonctionnalites/modeles-et-metriques/', title: 'Modèles et métriques', text: 'Une définition, partout la même réponse.' },
							charts: { href: '/fonctionnalites/visualisations/', title: 'Visualisations', text: 'Seize formes, des palettes lisibles par tous.' },
						},
					},
					share: {
						title: 'Partager',
						items: {
							dashboards: { href: '/fonctionnalites/tableaux-de-bord/', title: 'Tableaux de bord', text: 'Filtres, onglets, rafraîchissement automatique.' },
							sharing: { href: '/fonctionnalites/partage/', title: 'Dossiers et partage', text: 'Liens publics, intégration dans vos pages.' },
							copilot: { href: '/fonctionnalites/copilot/', title: 'Copilot', text: 'Il écrit la requête, vous gardez la main.' },
						},
					},
					govern: {
						title: 'Gouverner',
						items: {
							rights: { href: '/fonctionnalites/droits/', title: 'Droits', text: 'Lignes et colonnes, appliqués par Trino.' },
							sso: { href: '/hebergement/sso/', title: 'Connexion unique', text: 'OpenID Connect, attributs et groupes.' },
							principles: { href: '/architecture/principes/', title: 'Architecture', text: 'Ce qui se passe à chaque requête.' },
						},
					},
				},
				feature: {
					tag: 'Nouveau',
					title: 'Les prévisions',
					text: 'Prolongez une courbe de 3, 6 ou 12 périodes : la saison reconnue, la tendance en pointillés verts, un intervalle honnête.',
					cta: 'Voir les prévisions',
					href: '/fonctionnalites/previsions/',
				},
			},
			developers: {
				label: 'Développeurs',
				groups: {
					integrate: {
						title: 'Intégrer',
						items: {
							api: { href: '/integrations/api-rest/', title: 'API REST', text: 'OpenAPI 3.1, jetons à surfaces limitées.' },
							mcp: { href: '/integrations/mcp/', title: 'Serveur MCP', text: 'Claude interroge vos métriques, sous vos droits.' },
							embed: { href: '/integrations/integration-signee/', title: 'Intégration signée', text: 'Un tableau de bord dans votre produit.' },
						},
					},
					host: {
						title: 'Héberger',
						items: {
							docker: { href: '/hebergement/docker/', title: 'Docker', text: 'Une image, cinq rôles, HTTPS automatique.' },
							env: { href: '/hebergement/variables/', title: 'Variables', text: 'Tout ce qui se règle, au même endroit.' },
							install: { href: '/guides/installation/', title: 'Installation', text: 'De zéro à votre premier tableau de bord.' },
						},
					},
				},
				feature: {
					title: 'Une stack, une commande',
					text: 'PostgreSQL, Trino, l’application et Caddy : tout démarre ensemble.',
					cta: 'Installer',
					href: '/guides/installation/',
				},
			},
			resources: {
				label: 'Ressources',
				groups: {
					learn: {
						title: 'Apprendre',
						items: {
							docs: { href: '/guides/introduction/', title: 'Documentation', text: 'Tout eodia insights, page par page.' },
							start: { href: '/guides/premiers-pas/', title: 'Premiers pas', text: 'La démo, en dix minutes.' },
						},
					},
					project: {
						title: 'Le projet',
						items: {
							github: { href: 'https://github.com/eodia/insights', title: 'GitHub', text: 'Le code, les tickets, les versions.' },
							eodia: { href: 'https://eodia.com/fr/', title: 'Eodia', text: 'Le studio qui fait eodia insights.' },
						},
					},
				},
				feature: {
					tag: 'AGPL-3.0',
					title: 'Libre, pour de vrai',
					text: 'Tout le code est public. Installez-le chez vous, lisez-le, améliorez-le.',
					cta: 'Voir le code',
					href: 'https://github.com/eodia/insights',
				},
			},
		},
	},

	language: {
		label: 'Langue',
		current: 'Langue : {name}',
	},

	footer: {
		tagline: 'La BI open source où chaque requête passe par Trino, et chaque droit avec elle.',
		madeBy: 'Un logiciel libre d’<a class="eodia" href="https://eodia.com/fr/">Eodia</a>.',
		columns: {
			product: {
				title: 'Produit',
				links: [
					link({ href: '/fonctionnalites/questions/', label: 'Questions' }),
					link({ href: '/fonctionnalites/tableaux-de-bord/', label: 'Tableaux de bord' }),
					link({ href: '/fonctionnalites/copilot/', label: 'Copilot' }),
					link({ href: '/fonctionnalites/droits/', label: 'Droits' }),
				],
			},
			developers: {
				title: 'Développeurs',
				links: [
					link({ href: '/integrations/api-rest/', label: 'API REST' }),
					link({ href: '/integrations/mcp/', label: 'Serveur MCP' }),
					link({ href: '/integrations/integration-signee/', label: 'Intégration signée' }),
					link({ href: '/architecture/principes/', label: 'Architecture' }),
				],
			},
			hosting: {
				title: 'Hébergement',
				links: [
					link({ href: '/guides/installation/', label: 'Installation' }),
					link({ href: '/hebergement/docker/', label: 'Docker' }),
					link({ href: '/hebergement/variables/', label: 'Variables' }),
					link({ href: '/hebergement/sso/', label: 'Connexion unique' }),
				],
			},
			project: {
				title: 'Projet',
				links: [
					link({ href: 'https://github.com/eodia/insights', label: 'GitHub' }),
					link({ href: 'https://github.com/eodia/insights/blob/main/LICENSE', label: 'Licence AGPL-3.0' }),
					link({ href: 'https://eodia.com/fr/', label: 'Eodia' }),
				],
			},
		},
		copyright: '© {year} <a href="https://eodia.com/fr/">Eodia</a> — eodia insights est distribué sous licence AGPL-3.0-or-later.',
		builtWith: 'Fait en France, avec Trino, PostgreSQL et beaucoup de café.',
	},

	docsFooter: {
		madeBy: 'eodia insights est un logiciel libre d’<a href="https://eodia.com/fr/">Eodia</a>.',
	},

	/** The first screens: the headline, then the window told by the scroll. */
	hero: {
		eyebrow: 'eodia insights',
		title: 'Toutes vos bases.',
		titleAccent: 'Une seule vérité.',
		lead: 'Posez une question à PostgreSQL, MongoDB et Snowflake dans la même requête. Chacun ne voit que ce qu’il a le droit de voir — même en SQL libre.',
		primary: 'Installer eodia insights',
		secondary: 'Lire la documentation',
		facts: ['Open source, AGPL-3.0', 'Sept moteurs, une requête', 'Droits appliqués par Trino'],
		/** The ribbon above the title: what is new. */
		announce: { tag: 'Nouveau', text: 'Les prévisions : prolongez vos courbes, saison comprise', href: '#previsions' },
	},

	story: {
		aria: 'Les étapes de la démonstration',
		steps: {
			builder: {
				tab: 'Sans SQL',
				title: 'Une question, sans une ligne de SQL.',
				text: 'Choisissez une table, filtrez, résumez : le graphique se dessine pendant que vous cliquez.',
			},
			sql: {
				tab: 'En SQL',
				title: 'Ou tout le SQL que vous voulez.',
				text: 'Un éditeur Trino avec autocomplétion, variables et formatage. Joignez deux bases comme deux tables.',
			},
			copilot: {
				tab: 'Copilot',
				title: 'Demandez. Il écrit la requête.',
				text: 'Le copilot lit votre schéma, propose la requête et le graphique. Vous relisez, vous appliquez.',
			},
			dashboard: {
				tab: 'Tableau de bord',
				title: 'Tout se retrouve sur un tableau de bord.',
				text: 'Des cartes, des filtres qui pilotent toute la page, un rafraîchissement automatique — et un lien à partager.',
			},
		},
	},

	/** The window of the story: the application, drawn. */
	stage: {
		url: 'insights.exemple.fr',
		workspace: 'Boutique',
		workspaceSub: 'eodia insights',
		nav: {
			home: 'Accueil',
			browse: 'Parcourir',
			sql: 'Éditeur SQL',
			data: 'Données',
			history: 'Historique',
		},
		folders: 'Dossiers',
		folderNames: ['Mon dossier', 'Ventes', 'Service client', 'Direction'],
		breadcrumb: 'Ventes',
		builder: {
			title: 'Chiffre d’affaires par canal',
			data: 'Données',
			table: 'Commandes',
			filter: 'Filtrer',
			filterValue: 'Statut est livrée',
			summarize: 'Résumer',
			metric: 'Somme de Montant total',
			by: 'par',
			group: 'Canal',
			visualize: 'Visualiser',
			save: 'Enregistrer',
		},
		sql: {
			title: 'Paniers et tickets',
			run: 'Exécuter',
			rows: '6 lignes · 412 ms',
			columns: ['Région', 'Panier moyen', 'Tickets', 'Satisfaction'],
		},
		copilot: {
			title: 'Copilot',
			ask: 'Quel canal a le meilleur panier moyen ce trimestre ?',
			steps: ['Recherche dans le schéma', 'Lecture de boutique.commandes', 'Écriture de la requête'],
			answer: 'Le canal <b>Mobile</b> a le panier moyen le plus élevé ce trimestre : <b>87,40 €</b>, devant le Web.',
			apply: 'Appliquer',
			placeholder: 'Posez une question sur vos données…',
		},
		dashboard: {
			title: 'Pilotage des ventes',
			filters: ['Ce trimestre', 'Toutes les régions'],
			refresh: 'Actualisé il y a 2 min',
			kpis: [
				{ label: 'Chiffre d’affaires', value: '1,28 M€', delta: '+12,4 %' },
				{ label: 'Commandes', value: '14 302', delta: '+8,1 %' },
				{ label: 'Panier moyen', value: '89,50 €', delta: '+3,9 %' },
				{ label: 'Satisfaction', value: '4,6 / 5', delta: '+0,2' },
			],
			trend: 'Chiffre d’affaires par semaine',
			channels: 'Par canal',
		},
		channels: ['Web', 'Mobile', 'Marketplace'],
		regions: ['Île-de-France', 'Auvergne-Rhône-Alpes', 'Occitanie', 'Bretagne', 'Nouvelle-Aquitaine', 'Hauts-de-France'],
	},

	/** One engine, every base: Trino. */
	engine: {
		kicker: 'Un seul moteur',
		title: 'Sept bases.',
		titleAccent: 'Une seule requête.',
		lede: 'Toute requête passe par Trino : l’éditeur visuel, le SQL, les cartes, le copilot, l’API et le MCP. Une table PostgreSQL et une collection MongoDB se joignent comme deux tables d’une même base.',
		hub: 'Trino',
		hubSub: 'moteur unique',
		result: 'Un résultat',
		resultSub: '6 lignes · 412 ms',
		points: [
			{ title: 'Un seul dialecte', text: 'Le SQL de Trino partout : dans l’éditeur, dans les questions, dans ce qu’écrit le copilot.' },
			{ title: 'Ajoutées à chaud', text: 'Une base connectée depuis l’écran devient un catalogue Trino, sans redémarrer quoi que ce soit.' },
			{ title: 'Secrets chiffrés', text: 'Les identifiants des sources sont chiffrés en AES-256-GCM ; Trino n’écrit rien sur disque.' },
		],
		link: 'Connecter une source',
	},

	/** The same query, two people. */
	rights: {
		kicker: 'Des droits qui tiennent',
		title: 'Même requête.',
		titleAccent: 'Chacun ses données.',
		lede: 'Avant chaque instruction, Trino demande à eodia insights ce que la personne peut lire. Les lignes des autres régions disparaissent, les e-mails se masquent — jusque dans le SQL libre.',
		people: {
			admin: { name: 'Alice Martin', role: 'Administratrice' },
			analyst: { name: 'Camille Durand', role: 'Analyste · Bretagne' },
		},
		viewAs: 'Voir en tant que',
		table: 'boutique.public.clients',
		columns: ['Client', 'E-mail', 'Ville', 'Région'],
		rows: [
			{ name: 'Léa Moreau', email: 'lea.moreau@exemple.fr', city: 'Rennes', region: 'Bretagne' },
			{ name: 'Hugo Petit', email: 'hugo.petit@exemple.fr', city: 'Lyon', region: 'Auvergne-Rhône-Alpes' },
			{ name: 'Inès Garcia', email: 'ines.garcia@exemple.fr', city: 'Brest', region: 'Bretagne' },
			{ name: 'Jules Roux', email: 'jules.roux@exemple.fr', city: 'Paris', region: 'Île-de-France' },
			{ name: 'Zoé Simon', email: 'zoe.simon@exemple.fr', city: 'Rennes', region: 'Bretagne' },
			{ name: 'Noah Vincent', email: 'noah.vincent@exemple.fr', city: 'Toulouse', region: 'Occitanie' },
		],
		rule: 'region = {{user.region}}',
		decisions: {
			admin: ['Accès à boutique.clients : autorisé', 'Aucun filtre de ligne', 'Aucun masque de colonne'],
			analyst: ['Accès à boutique.clients : autorisé', 'Filtre de ligne : region = ’Bretagne’', 'Masque : email'],
		},
		opa: 'Trino → eodia insights',
		count: { admin: '2 500 clients', analyst: '163 clients' },
		points: [
			{ title: 'Lignes', text: 'Des règles par groupe, fondées sur les attributs de la personne. Un attribut absent ferme l’accès, il ne l’ouvre jamais.' },
			{ title: 'Colonnes', text: 'Cachées, elles n’existent plus ; masquées, Trino remplace la valeur. Dans les questions, les exports, l’API.' },
			{ title: 'Partout', text: 'Éditeur, SQL libre, cartes, copilot, API, MCP : un seul point de décision, aucune porte dérobée.' },
		],
		link: 'Tout sur les droits',
	},

	/** The Copilot, at work. */
	copilot: {
		kicker: 'Copilot',
		title: 'Posez la question.',
		titleAccent: 'Lisez la réponse.',
		lede: 'Le copilot connaît votre schéma, vos descriptions et vos métriques. Il écrit la requête, choisit le graphique, construit un tableau de bord — en direct, et toujours sous vos droits.',
		ask: 'Montre-moi le délai de résolution des tickets par motif, pour les clients Premium.',
		thinking: [
			{ tool: 'search_schema', text: 'support.tickets, boutique.clients' },
			{ tool: 'describe_table', text: 'support.tickets — 8 colonnes' },
			{ tool: 'run_sql', text: '6 lignes · 238 ms' },
		],
		answer: 'Pour les clients Premium, les <b>remboursements</b> sont les plus longs à résoudre : <b>61 h</b> en moyenne, deux fois plus que les questions de compte.',
		bars: [
			{ label: 'Remboursement', value: 61 },
			{ label: 'Produit défectueux', value: 54 },
			{ label: 'Livraison', value: 47 },
			{ label: 'Facturation', value: 38 },
			{ label: 'Retour', value: 35 },
			{ label: 'Compte client', value: 29 },
		],
		unit: 'h',
		chartTitle: 'Délai moyen de résolution',
		apply: 'Enregistrer la question',
		providers: 'Anthropic, OpenAI, Mistral ou tout service compatible OpenAI.',
		link: 'Découvrir le copilot',
	},

	/** Dashboards. */
	dashboards: {
		kicker: 'Tableaux de bord',
		title: 'Le chiffre du jour,',
		titleAccent: 'à jour.',
		lede: 'Glissez des questions sur une grille, ajoutez des filtres qui pilotent toutes les cartes, des onglets, du texte. Le tableau se rafraîchit seul ; le cache le rend instantané.',
		points: [
			{ title: 'Filtres reliés', text: 'Une période, une région : chaque carte suit, quelle que soit sa source.' },
			{ title: 'Rafraîchi, en cache', text: 'Un rafraîchissement automatique, un cache de résultats, un préchauffage par le worker.' },
			{ title: 'Partagé', text: 'Un lien public, un lien réservé aux membres, ou une intégration signée dans votre produit.' },
		],
		link: 'Construire un tableau de bord',
		board: {
			title: 'Pilotage des ventes',
			tabs: ['Vue d’ensemble', 'Produits', 'Clients'],
			filters: ['Ce trimestre', 'Toutes les régions', 'Tous les canaux'],
			revenue: 'Chiffre d’affaires par semaine',
			current: 'Cette année',
			previous: 'Année précédente',
			map: 'Clients par ville',
			categories: 'Ventes par rayon',
			rayons: ['High-tech', 'Maison', 'Sport', 'Culture'],
			heat: 'Commandes par jour et par heure',
		},
	},

	/** Forecasts: the curve, prolonged. */
	forecast: {
		badge: 'Nouveau',
		kicker: 'Prévisions',
		title: 'Ce qui s’est passé.',
		titleAccent: 'Et ce qui vient.',
		lede: 'Un clic prolonge une courbe, une aire ou des barres de 3, 6 ou 12 périodes. eodia insights reconnaît la saison, dessine la tendance en pointillés verts et vous dit à quel point vous y fier.',
		chartTitle: 'Chiffre d’affaires mensuel',
		measured: 'Mesuré',
		forecast: 'Prévision',
		band: 'Intervalle 80 %',
		extend: 'Prolonger de',
		method: 'Automatique · saison de 12 mois reconnue',
		zone: 'Prévision',
		tip: 'prévision',
		range: 'intervalle 80 %',
		points: [
			{ title: 'La saison, reconnue', text: 'Holt-Winters dès que la série couvre deux saisons — 12 mois, 4 trimestres, 7 jours ; sinon une tendance lissée, ou une droite.' },
			{ title: 'Un intervalle honnête', text: 'La plage à 80 % s’élargit avec l’horizon : on voit d’un coup d’œil ce qui est probable, et ce qui est un pari.' },
			{ title: 'Partout où sont vos graphiques', text: 'Courbes, aires, barres et combinés, dans les questions et les tableaux de bord — et jusque dans Claude, par le serveur MCP.' },
		],
		link: 'Tout sur les prévisions',
	},

	/** What is new, in six cards. */
	news: {
		kicker: 'Nouveautés',
		title: 'Explorer,',
		titleAccent: 'à la vitesse d’un clic.',
		lede: 'Des filtres qui montrent ce qui reste possible, des couleurs lisibles par tous, des graphiques qui racontent quelque chose — jusque dans la conversation avec Claude.',
		more: 'En savoir plus',
		chosen: '2 valeurs choisies',
		values: ['Livrée', 'Remboursée', 'Annulée', 'Expédiée', 'Payée'],
		safe: 'Lisibles par les daltoniens',
		ask: 'Montre-moi les commandes par mois.',
		folders: ['Ventes', '2026', 'Service client'],
		drag: 'CA par mois',
		items: {
			associative: { title: 'Des filtres associatifs', text: 'Choisi en vert, possible en blanc, exclu en gris — comme dans Qlik. Chaque valeur dit sa part des lignes ; Maj + clic pour une plage, Ctrl + clic pour une seule.', href: '/fonctionnalites/tableaux-de-bord/#des-filtres-associatifs' },
			click: { title: 'Maj + clic sur un graphique', text: 'Sélectionnez plusieurs barres : tout le tableau de bord se filtre, et le graphique garde ses autres catégories, estompées, pour en ajouter.', href: '/fonctionnalites/tableaux-de-bord/#cliquer-sur-un-graphique-pour-filtrer' },
			palettes: { title: 'Des palettes pour tous', text: 'Six palettes et la vôtre, validées pour les daltoniens, en clair comme en sombre. Une couleur par valeur, reprise dans tous les graphiques.', href: '/fonctionnalites/visualisations/#les-couleurs' },
			radar: { title: 'Radar, top N, mise en avant', text: 'Faites ressortir le maximum, tracez la moyenne, gardez les dix premiers, comparez des profils en radar : le graphique dit quelque chose.', href: '/fonctionnalites/visualisations/' },
			mcp: { title: 'Vos graphiques dans Claude', text: 'Le serveur MCP dessine le graphique dans la conversation (MCP Apps), avec les couleurs, les formats et les droits d’eodia insights.', href: '/integrations/mcp/' },
			organize: { title: 'Ranger sans y penser', text: 'Sous-dossiers, glisser-déposer, questions créées dans le tableau de bord, cartes déplacées d’un onglet à l’autre ; pictos, emoji et images.', href: '/fonctionnalites/partage/' },
		},
	},

	/** Agents and developers. */
	agents: {
		kicker: 'API et MCP',
		title: 'Vos métriques,',
		titleAccent: 'dans Claude.',
		lede: 'Le serveur MCP donne à Claude, ou à tout agent, les outils pour explorer vos données : chercher dans le schéma, interroger une métrique, lancer une question. Le jeton porte les droits de son propriétaire, pas un de plus.',
		chat: {
			user: 'Combien de commandes la Bretagne a-t-elle passées en septembre, et comment ça se compare à août ?',
			tool: 'query_metric',
			toolArgs: 'commandes · région = Bretagne · par mois',
			answer: '<b>1 184 commandes</b> en septembre, contre 1 027 en août : <b>+15,3 %</b>. C’est le meilleur mois de l’année pour la région.',
		},
		tabs: { mcp: 'MCP', rest: 'REST', embed: 'Intégration' },
		tools: ['list_datasources', 'search_schema', 'describe_table', 'list_metrics', 'query_metric', 'list_questions', 'run_question', 'run_sql', 'get_dashboard', 'show_chart'],
		toolsLabel: 'Les outils du serveur MCP',
		link: 'Brancher Claude',
		linkApi: 'Explorer l’API',
	},

	/** Everything else, in tiles. */
	features: {
		title: 'Et tout ce qu’on attend d’une BI.',
		lede: 'Ce qui fait qu’une équipe l’adopte, et qu’un administrateur dort tranquille.',
		items: {
			engines: tile({ stat: '7', title: 'Moteurs', text: 'PostgreSQL, MySQL, SQL Server, Oracle, Snowflake, MongoDB et Trino.', href: '/fonctionnalites/sources/' }),
			structure: tile({ title: 'Écran Structure', text: 'Descriptions, types sémantiques, relations et valeurs : votre schéma, enfin lisible.', href: '/fonctionnalites/sources/' }),
			sso: tile({ title: 'Connexion unique', text: 'OpenID Connect ; les attributs et les groupes viennent de votre annuaire.', href: '/hebergement/sso/' }),
			metrics: tile({ code: 'CA = sum(montant_total)', title: 'Modèles et métriques', text: 'Définies une fois, réutilisées partout, interrogeables par l’API et le MCP.', href: '/fonctionnalites/modeles-et-metriques/' }),
			folders: tile({ title: 'Dossiers', text: 'Un dossier personnel pour chacun, des dossiers partagés avec des droits par groupe.', href: '/fonctionnalites/partage/' }),
			history: tile({ title: 'Historique', text: 'Chaque requête exécutée : qui, quoi, combien de temps, depuis où.', href: '/fonctionnalites/questions/' }),
			native: tile({ code: 'system.query(…)', title: 'SQL natif', text: 'Le dialecte de la base, réservé à qui n’a aucune restriction sur la source.', href: '/fonctionnalites/questions/' }),
			audit: tile({ title: 'Journal d’audit', text: 'Connexions, droits, sources, jetons, partages : tout est tracé.', href: '/fonctionnalites/droits/' }),
		},
	},

	/** Yours: self-hosted. */
	selfHost: {
		kicker: 'Chez vous',
		title: 'Vos données ne quittent',
		titleAccent: 'jamais votre serveur.',
		lede: 'Une image Docker, un fichier Compose : PostgreSQL pour le catalogue, Trino, l’application et Caddy pour le HTTPS. Le premier écran crée le compte administrateur.',
		points: ['HTTPS automatique avec Caddy', 'Une image, cinq rôles : api, web, worker, mcp, all', 'Migrations du catalogue scellées et rejouables'],
		cta: 'Guide d’installation',
	},

	faq: {
		title: 'Questions fréquentes',
		items: {
			metabase: question({
				q: 'En quoi est-ce différent de Metabase ?',
				a: 'L’esprit est le même : des questions, des modèles, des tableaux de bord. La différence est dessous : toute requête passe par Trino, qui joint vos bases entre elles et applique lui-même les droits sur les lignes et les colonnes — y compris pour le SQL libre.',
			}),
			trino: question({
				q: 'Faut-il savoir administrer Trino ?',
				a: 'Non. eodia insights crée et recrée lui-même les catalogues Trino à partir de vos sources ; Trino ne garde aucun état. Un seul conteneur suffit pour commencer.',
			}),
			sql: question({
				q: 'Le SQL libre peut-il contourner les droits ?',
				a: 'Non. Les droits ne sont pas appliqués par l’interface mais par Trino, qui consulte eodia insights avant chaque instruction : accès aux tables, filtres de ligne, masques de colonne. Le SQL natif, qui contournerait Trino, est réservé à qui n’a aucune restriction sur la source.',
			}),
			forecast: question({
				q: 'Peut-on se fier aux prévisions ?',
				a: 'Autant qu’à la série qu’elles prolongent. eodia insights choisit la méthode selon les données — Holt-Winters quand la série couvre deux saisons, une tendance lissée sinon —, et entoure la prévision d’un intervalle à 80 % qui s’élargit avec l’horizon. Elle ne devine pas ce que les données ne contiennent pas : une nouvelle offre, une crise.',
			}),
			mongo: question({
				q: 'MongoDB, vraiment ?',
				a: 'Oui : une collection se lit comme une table, et se joint à une table PostgreSQL ou Snowflake dans la même requête. Les sous-documents arrivent sous forme de structures.',
			}),
			ai: question({
				q: 'Mes données partent-elles chez un fournisseur d’IA ?',
				a: 'Seulement si vous activez le copilot, avec le fournisseur que vous choisissez — Anthropic, OpenAI, Mistral ou un service compatible OpenAI, y compris hébergé chez vous. Sans clé, il n’y a pas de copilot. Un quota par personne et par heure limite l’usage.',
			}),
			license: question({
				q: 'Est-ce vraiment gratuit ?',
				a: 'Oui, sous licence AGPL-3.0-or-later : vous l’installez, l’utilisez et le modifiez librement. Si vous le proposez comme service en ligne modifié, vous publiez vos modifications.',
			}),
		},
	},

	cta: {
		title: 'Branchez vos bases.',
		titleAccent: 'Posez vos questions.',
		text: 'Une commande pour démarrer, une démo intégrée pour essayer, et la documentation pour tout le reste.',
		primary: 'Installer eodia insights',
		secondary: 'Voir sur GitHub',
	},
};

export type Dict = typeof fr;
export default fr;
