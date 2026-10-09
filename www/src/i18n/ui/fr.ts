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

	/** The words that lead to the public demo (`DEMO_URL`, `lib/demo.ts`). */
	demo: {
		/** In the bar, beside GitHub. */
		short: 'Démo',
		/** A button: the first screen of the home page, the menu on a phone. */
		cta: 'Essayer la démo',
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
							charts: { href: '/fonctionnalites/visualisations/', title: 'Visualisations', text: 'Vingt-deux formes, des palettes lisibles par tous.' },
							assistant: { href: '/fonctionnalites/assistant/', title: 'Assistant IA', text: 'Conversez avec vos données, en graphiques.' },
						},
					},
					share: {
						title: 'Partager',
						items: {
							dashboards: { href: '/fonctionnalites/tableaux-de-bord/', title: 'Tableaux de bord', text: 'Filtres, onglets, rafraîchissement automatique.' },
							sharing: { href: '/fonctionnalites/partage/', title: 'Dossiers et partage', text: 'Liens publics, intégration dans vos pages.' },
							themes: { href: '/fonctionnalites/themes/', title: 'Thèmes et PDF', text: 'Votre charte, héritée par dossier, jusqu’au PDF.' },
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
					title: 'L’assistant IA',
					text: 'Posez la question, lisez la réponse en graphiques : il cherche les tables, écrit le SQL et l’exécute sous vos droits.',
					cta: 'Découvrir l’assistant',
					href: '/fonctionnalites/assistant/',
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
					link({ href: '/fonctionnalites/assistant/', label: 'Assistant IA' }),
					link({ href: '/fonctionnalites/themes/', label: 'Thèmes et PDF' }),
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
		/** A link to the films of « La démo », which starts the one shown. */
		watch: 'Regarder la vidéo',
		facts: ['Open source, AGPL-3.0', 'Assistant IA et prévisions', 'Droits appliqués par Trino'],
		/** The ribbon above the title: what is new. */
		announce: { tag: 'Nouveau', text: 'Les prévisions : prolongez vos courbes, saison comprise', href: '#previsions' },
	},

	/**
	 * The films, after the story: the short one (a minute, titles, the real screens, a voice and
	 * music) and the full tour with its chapters — `time`, in minutes and seconds, is where each
	 * chapter starts in the tour. Both films are in French; every other page shows them with
	 * subtitles in its language.
	 */
	film: {
		eyebrow: 'La démo',
		title: 'eodia insights,',
		tabs: { label: 'Choisir le film', short: 'En une minute', full: 'La visite complète' },
		short: {
			titleAccent: 'en une minute.',
			text: 'Questions, graphiques, SQL, assistant IA, tableaux de bord et droits : l’essentiel, commenté et en musique.',
			duration: '1 min',
		},
		full: {
			titleAccent: 'en quatre minutes.',
			text: 'De la première question au tableau de bord partagé, et les mêmes données vues par deux personnes : la visite complète, commentée.',
			duration: '4 min 06',
		},
		play: 'Lire la vidéo',
		chapters: 'Chapitres',
		/** The label of the subtitles, in the player. */
		captions: 'Français',
		/** Said on every page but the French one: the films are in French. */
		inFrench: '',
		list: [
			{ time: '0:12', title: 'Toutes vos bases' },
			{ time: '0:39', title: 'Une question, sans SQL' },
			{ time: '1:13', title: 'Des graphiques qui racontent' },
			{ time: '1:32', title: 'Le SQL, pour qui le veut' },
			{ time: '1:53', title: 'L’assistant IA' },
			{ time: '2:10', title: 'Tableaux de bord' },
			{ time: '2:31', title: 'Partager, à vos couleurs' },
			{ time: '2:52', title: 'Des droits appliqués par Trino' },
			{ time: '3:18', title: 'Même tableau, chacun ses données' },
			{ time: '3:33', title: 'Espaces, API et MCP' },
		],
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
			assistant: {
				tab: 'Assistant IA',
				title: 'Demandez. Il répond, graphique à l’appui.',
				text: 'L’assistant cherche dans votre schéma, exécute la requête sous vos droits et vous montre le résultat — à garder comme question.',
			},
			dashboard: {
				tab: 'Tableau de bord',
				title: 'Tout se retrouve sur un tableau de bord.',
				text: 'Des cartes, des filtres qui pilotent toute la page, un rafraîchissement automatique — et un lien à partager.',
			},
			forecast: {
				tab: 'Prévisions',
				title: 'Et ce qui vient ensuite.',
				text: 'Une courbe se prolonge d’un clic : la tendance, la saison et une marge d’incertitude, calculées dans votre navigateur.',
			},
		},
	},

	/** The window of the story: the application, drawn. */
	stage: {
		url: 'insights.exemple.fr',
		product: 'eodia insights',
		sources: 'Toutes les sources',
		nav: {
			home: 'Accueil',
			assistant: 'Assistant IA',
			folders: 'Dossiers',
			sql: 'Éditeur SQL',
			sources: 'Sources de données',
			structure: 'Structure',
			history: 'Historique',
			admin: 'Administration',
			api: 'API et MCP',
		},
		badge: 'Nouveau',
		folderNames: ['Mon dossier', 'Service client', 'Ventes'],
		user: { name: 'Alice Martin', role: 'Administratrice' },
		newItem: 'Nouveau',
		search: 'Rechercher…',
		crumbs: {
			builder: ['Questions', 'Chiffre d’affaires par canal'],
			sql: ['Éditeur SQL'],
			assistant: ['Assistant IA'],
			dashboard: ['Tableaux de bord', 'Ventes de la boutique'],
			forecast: ['Questions', 'Chiffre d’affaires par mois'],
		},
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
		assistant: {
			newChat: 'Nouvelle conversation',
			search: 'Rechercher une conversation',
			today: 'Aujourd’hui',
			history: ['Panier moyen par canal', 'Clients fidèles en 2026', 'Retours par région', 'Tickets ouverts cette semaine'],
			ask: 'Quel canal a le meilleur panier moyen ce trimestre ?',
			steps: ['Recherche dans le schéma', 'Lecture de la table', 'Exécution de la requête', 'Préparation du graphique'],
			answer: 'Le canal <b>Mobile</b> a le panier moyen le plus élevé ce trimestre : <b>87,40 €</b>, devant le Web (82,10 €) et la Marketplace (76,80 €).',
			chartTitle: 'Panier moyen par canal',
			chartSub: 'Ce trimestre · commandes livrées',
			rows: '3 lignes',
			save: 'Enregistrer comme question',
			placeholder: 'Demandez n’importe quoi sur vos données…',
			sources: 'Toutes les sources',
			hint: 'Entrée pour envoyer',
		},
		dashboard: {
			title: 'Ventes de la boutique',
			description: 'Chiffre d’affaires, commandes et clients — filtrable par période et canal.',
			filters: [{ label: 'Période', value: '12 derniers mois' }, { label: 'Canal' }, { label: 'Région' }] as { label: string; value?: string }[],
			share: 'Partager',
			edit: 'Modifier',
			tabs: ['Ventes', 'Service client', 'Commandes'],
			kpis: [
				{ label: 'Chiffre d’affaires', value: '7,29 M€' },
				{ label: 'Commandes', value: '12 944' },
				{ label: 'Panier moyen', value: '704,50 €' },
				{ label: 'Commandes par semaine', value: '150', delta: '−18,6 %' },
			] as { label: string; value: string; delta?: string }[],
			trend: 'Chiffre d’affaires par mois',
			channels: 'Commandes par canal',
		},
		forecast: {
			title: 'Chiffre d’affaires par mois',
			legend: ['Chiffre d’affaires', 'Prévision'],
			zone: 'Prévision',
			range: 'entre',
			panel: 'Prévision',
			extend: 'Prolonger la tendance de',
			periods: 'périodes',
			method: 'Méthode',
			methods: ['Auto', 'Droite', 'Lissée', 'Saison'],
			band: 'Intervalle de confiance (80 %)',
			note: 'La partie prévue est dessinée en pointillés verts : tendance et saison, prolongées par Holt-Winters.',
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

	/** Themes and their PDF. */
	themes: {
		kicker: 'Thèmes et PDF',
		title: 'À vos couleurs,',
		titleAccent: 'jusqu’au PDF.',
		lede: 'Polices, couleurs, cartes, palette des graphiques et logo : posez un thème sur un dossier, et tout ce qu’il contient le porte — sous-dossiers, questions, tableaux de bord, liens partagés et leurs impressions en PDF.',
		pickLabel: 'Choisir un thème',
		names: { eodia: 'Par défaut', fluxen: 'Violet hachuré', maison: 'Maison' },
		logo: ['eodia', 'Fluxen', 'Maison'],
		dashTitle: 'Ventes du trimestre',
		dashSub: 'Le point mensuel par canal et par région',
		tabs: ['Vue d’ensemble', 'Détail'],
		kpis: [
			{ label: 'Ventes actives', value: '24,5 k€', delta: '+5,8 % vs septembre' },
			{ label: 'Chiffre d’affaires', value: '15,2 k€', delta: '+6,1 % vs septembre' },
			{ label: 'Conversion', value: '12,5 %', delta: '−1,1 % vs septembre' },
		],
		chartTitle: 'Ventes par canal',
		channels: ['Web', 'Magasin', 'Marketplace', 'Téléphone', 'Salons'],
		donutTitle: 'Part du Web',
		pdf: { date: '3 octobre 2026', footer: 'Confidentiel — usage interne' },
		points: [
			{ title: 'Posé sur un dossier', text: 'Le dossier, ses sous-dossiers, leurs questions et leurs tableaux de bord en héritent ; un sous-dossier ou un tableau peut porter le sien.' },
			{ title: 'Votre charte, en dix réglages', text: 'Une vingtaine de polices, l’accent, les fonds, l’arrondi et l’ombre des cartes, des barres pleines, hachurées ou en dégradé, votre logo.' },
			{ title: 'Jusqu’au PDF', text: 'Exporter en PDF met le tableau en pages A4 à ses couleurs : page de garde, filtres appliqués, graphiques vectoriels, pied de page et pagination.' },
		],
		link: 'Tout sur les thèmes',
	},

	/** The AI assistant, at work. */
	assistant: {
		kicker: 'Assistant IA',
		title: 'Parlez à vos données.',
		titleAccent: 'Elles répondent en graphiques.',
		lede: 'Un écran pour converser avec vos données : l’assistant cherche les tables, écrit le SQL, l’exécute sous vos droits et vous montre la réponse en graphiques interactifs. Chaque conversation est gardée, pour vous seul.',
		model: 'claude-sonnet-5-5',
		newChat: 'Nouvelle conversation',
		today: 'Aujourd’hui',
		yesterday: 'Hier',
		history: ['Délai de résolution Premium', 'Chiffre d’affaires mensuel', 'Top clients 2026'],
		older: ['Retards par transporteur', 'Tickets par canal'],
		ask: 'Quel est le délai de résolution des tickets par motif, pour les clients Premium ?',
		thinking: 'Réflexion…',
		steps: [
			{ label: 'Recherche dans le schéma', detail: '2 tables' },
			{ label: 'Lecture de la table', detail: 'Tickets' },
			{ label: 'Exécution de la requête', detail: '6 lignes' },
			{ label: 'Préparation du graphique', detail: '' },
		],
		chartTitle: 'Délai moyen de résolution',
		chartSub: 'Clients Premium · 90 derniers jours',
		bars: [
			{ label: 'Remboursement', value: 61 },
			{ label: 'Produit défectueux', value: 54 },
			{ label: 'Livraison', value: 47 },
			{ label: 'Facturation', value: 38 },
			{ label: 'Retour', value: 35 },
			{ label: 'Compte client', value: 29 },
		],
		unit: 'h',
		rows: '6 lignes · sous vos droits',
		save: 'Enregistrer comme question',
		answer: 'Les <b>remboursements</b> sont les plus longs à résoudre : <b>61 h</b> en moyenne, deux fois plus que les questions de compte. Voulez-vous comparer avec les clients Standard ?',
		placeholder: 'Demandez n’importe quoi sur vos données…',
		sources: 'Support client',
		points: [
			{ title: 'Des graphiques, pas des pavés', text: 'Chaque réponse chiffrée arrive en graphique interactif : changez sa forme d’un clic, voyez son SQL, enregistrez-le comme question.' },
			{ title: 'Vos sources, vos droits', text: 'Choisissez les sources dans la saisie ; Trino applique vos permissions, colonnes masquées et règles de lignes comprises.' },
			{ title: 'Un historique à vous', text: 'Les conversations sont gardées, rangées par date, cherchées, renommées. Et un copilot reste dans chaque écran.' },
		],
		providers: 'Anthropic, OpenAI, Mistral ou tout service compatible OpenAI — y compris hébergé chez vous.',
		link: 'Découvrir l’assistant',
		linkCopilot: 'Et le copilot',
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
		title: 'Des graphiques',
		titleAccent: 'qui racontent quelque chose.',
		lede: 'Des courses pour rejouer le temps, des bulles et des cartes proportionnelles pour les parts de parts, un calendrier, des chiffres clés avec leur courbe — dans une interface qui parle votre langue et se met à jour sous vos yeux.',
		more: 'En savoir plus',
		periods: ['jan. 2026', 'mai 2026', 'sept. 2026'],
		kpis: [
			{ label: 'Ventes actives', value: '24,5 k', delta: '+5,8 %' },
			{ label: 'Conversion', value: '12,5 %', delta: '−1,1 %' },
		],
		say: ['Nouvelle question', 'New question', 'Nueva pregunta'],
		every: 'Toutes les minutes',
		items: {
			races: { title: 'Courses de barres et de courbes', text: 'Rejouez l’histoire période après période : les barres se doublent, les courbes se tracent, la date s’écrit en grand.', href: '/fonctionnalites/visualisations/#les-courses' },
			bubbles: { title: 'Bulles et carte proportionnelle', text: 'Des bulles sur deux axes ou en grappe, des rectangles imbriqués, un camembert à plusieurs anneaux : les parts de parts, enfin lisibles.', href: '/fonctionnalites/visualisations/#des-parts-sur-plusieurs-niveaux' },
			calendar: { title: 'Le calendrier', text: 'Une valeur par jour, en points ou en cases colorées : les jours de la semaine, les saisons et les trous sautent aux yeux.', href: '/fonctionnalites/visualisations/#le-calendrier' },
			sparks: { title: 'Chiffres clés et courbe miniature', text: 'Le chiffre, sa petite courbe — verte quand ça va dans le bon sens, rouge sinon — et sa variation sur la période précédente.', href: '/fonctionnalites/visualisations/#bulles-tendances-entonnoir-en-colonnes' },
			languages: { title: 'Français, anglais, espagnol', text: 'L’interface prend la langue du navigateur, ou celle choisie dans le menu du compte ; les messages de l’API suivent.', href: '/guides/introduction/' },
			live: { title: 'Rafraîchi en direct', text: 'Au rafraîchissement ou au changement de filtre, les cartes restent à l’écran et leurs marques glissent vers les nouvelles valeurs.', href: '/fonctionnalites/tableaux-de-bord/#rafraîchissement-et-affichage' },
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
			structure: tile({ title: 'Sources de données', text: 'Connexion, descriptions, types sémantiques, relations et valeurs : votre schéma, enfin lisible.', href: '/fonctionnalites/sources/' }),
			sso: tile({ title: 'Connexion unique', text: 'OpenID Connect ; les attributs et les groupes viennent de votre annuaire.', href: '/hebergement/sso/' }),
			metrics: tile({ code: 'CA = sum(montant_total)', title: 'Modèles et métriques', text: 'Définies une fois, réutilisées partout, interrogeables par l’API et le MCP.', href: '/fonctionnalites/modeles-et-metriques/' }),
			folders: tile({ title: 'Dossiers', text: 'Un dossier personnel pour chacun, des dossiers partagés avec des droits par groupe.', href: '/fonctionnalites/partage/' }),
			history: tile({ title: 'Historique', text: 'Chaque requête exécutée : qui, quoi, combien de temps, depuis où.', href: '/fonctionnalites/questions/' }),
			native: tile({ code: 'system.query(…)', title: 'SQL natif', text: 'Le dialecte de la base, réservé à qui n’a aucune restriction sur la source.', href: '/fonctionnalites/questions/' }),
			audit: tile({ title: 'Journal d’audit', text: 'Connexions, droits, sources, jetons, partages : tout est tracé.', href: '/fonctionnalites/droits/' }),
			assistant: tile({ title: 'Assistant IA', text: 'Conversez avec vos données : réponses rédigées, graphiques interactifs, historique gardé pour vous.', href: '/fonctionnalites/assistant/' }),
			themes: tile({ title: 'Thèmes et PDF', text: 'Votre charte posée sur un dossier, héritée par tout ce qu’il contient, jusqu’à l’export en PDF.', href: '/fonctionnalites/themes/' }),
			languages: tile({ code: 'fr · en · es', title: 'Trois langues', text: 'L’interface et les messages de l’API dans la langue du navigateur, ou celle que vous choisissez.', href: '/guides/introduction/' }),
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
				a: 'Seulement si vous activez l’IA, avec le fournisseur que vous choisissez — Anthropic, OpenAI, Mistral ou un service compatible OpenAI, y compris hébergé chez vous. Sans clé, ni assistant ni copilot. Ce que le modèle lit — schéma, descriptions, résultats de requêtes — passe par vos droits ; un quota par personne et par heure limite l’usage.',
			}),
			assistant: question({
				q: 'L’assistant IA peut-il voir ou modifier plus que moi ?',
				a: 'Non. Chaque requête qu’il écrit s’exécute dans Trino sous votre identité : vos tables, vos colonnes masquées, vos règles de lignes. Il ne modifie rien — il propose, vous enregistrez. Ses conversations sont gardées pour vous seul, et vous pouvez les supprimer.',
			}),
			brand: question({
				q: 'Puis-je mettre la charte de mon entreprise ?',
				a: 'Oui. Un administrateur crée un thème — polices, couleurs, cartes, palette des graphiques, logo, mise en page du PDF — et le pose sur un dossier : sous-dossiers, questions, tableaux de bord, liens partagés et exports PDF le portent. Un tableau de bord peut avoir le sien.',
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
