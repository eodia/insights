/**
 * The English texts of the landing page, laid over the French ones (`fr.ts`).
 *
 * See `../README.md`.
 */
import type { DeepPartial, Dict } from './index';

export default {
	meta: {
		title: 'eodia insights — the open source BI where Trino enforces your permissions',
		description:
			'No-code or SQL questions, dashboards, an AI copilot, an API and an MCP server — across PostgreSQL, MySQL, SQL Server, Oracle, Snowflake and MongoDB at once, with row- and column-level permissions enforced by Trino itself. Self-hosted, AGPL-3.0.',
	},

	eodia: {
		home: 'https://eodia.com/en/',
	},

	nav: {
		aria: 'Main navigation',
		home: 'eodia insights, home',
		github: 'eodia insights on GitHub',
		install: 'Install',
		docs: 'Docs',
		menu: {
			open: 'Open menu',
			close: 'Close menu',
			product: {
				label: 'Product',
				groups: {
					explore: {
						title: 'Explore',
						items: {
							sources: { href: '/fonctionnalites/sources/', title: 'Sources', text: 'Seven engines, one schema, synced and described.' },
							questions: { href: '/fonctionnalites/questions/', title: 'Questions', text: 'No-code, in Trino SQL or in native SQL.' },
							models: { href: '/fonctionnalites/modeles-et-metriques/', title: 'Models and metrics', text: 'One definition, the same answer everywhere.' },
						},
					},
					share: {
						title: 'Share',
						items: {
							dashboards: { href: '/fonctionnalites/tableaux-de-bord/', title: 'Dashboards', text: 'Filters, tabs, auto-refresh.' },
							sharing: { href: '/fonctionnalites/partage/', title: 'Folders and sharing', text: 'Public links, embedded in your pages.' },
							copilot: { href: '/fonctionnalites/copilot/', title: 'Copilot', text: 'It writes the query. You stay in control.' },
						},
					},
					govern: {
						title: 'Govern',
						items: {
							rights: { href: '/fonctionnalites/droits/', title: 'Permissions', text: 'Rows and columns, enforced by Trino.' },
							sso: { href: '/hebergement/sso/', title: 'Single sign-on', text: 'OpenID Connect, attributes and groups.' },
							principles: { href: '/architecture/principes/', title: 'Architecture', text: 'What happens on every query.' },
						},
					},
				},
				feature: {
					tag: 'The core',
					title: 'Trino decides, not the interface',
					text: 'Every query asks eodia insights what the person is allowed to read.',
					cta: 'How it works',
					href: '/architecture/principes/',
				},
			},
			developers: {
				label: 'Developers',
				groups: {
					integrate: {
						title: 'Integrate',
						items: {
							api: { href: '/integrations/api-rest/', title: 'REST API', text: 'OpenAPI 3.1, tokens with scoped surfaces.' },
							mcp: { href: '/integrations/mcp/', title: 'MCP server', text: 'Claude queries your metrics, under your permissions.' },
							embed: { href: '/integrations/integration-signee/', title: 'Signed embedding', text: 'A dashboard inside your product.' },
						},
					},
					host: {
						title: 'Host',
						items: {
							docker: { href: '/hebergement/docker/', title: 'Docker', text: 'One image, five roles, automatic HTTPS.' },
							env: { href: '/hebergement/variables/', title: 'Variables', text: 'Every setting, in one place.' },
							install: { href: '/guides/installation/', title: 'Installation', text: 'From zero to your first dashboard.' },
						},
					},
				},
				feature: {
					title: 'One stack, one command',
					text: 'PostgreSQL, Trino, the app and Caddy: everything starts together.',
					cta: 'Install',
					href: '/guides/installation/',
				},
			},
			resources: {
				label: 'Resources',
				groups: {
					learn: {
						title: 'Learn',
						items: {
							docs: { href: '/guides/introduction/', title: 'Documentation', text: 'All of eodia insights, page by page.' },
							start: { href: '/guides/premiers-pas/', title: 'Getting started', text: 'The demo, in ten minutes.' },
						},
					},
					project: {
						title: 'The project',
						items: {
							github: { href: 'https://github.com/eodia/insights', title: 'GitHub', text: 'The code, the issues, the releases.' },
							eodia: { href: 'https://eodia.com/en/', title: 'Eodia', text: 'The studio behind eodia insights.' },
						},
					},
				},
				feature: {
					tag: 'AGPL-3.0',
					title: 'Truly open source',
					text: 'All the code is public. Run it on your own servers, read it, make it better.',
					cta: 'See the code',
					href: 'https://github.com/eodia/insights',
				},
			},
		},
	},

	language: {
		label: 'Language',
		current: 'Language: {name}',
	},

	footer: {
		tagline: 'The open source BI where every query goes through Trino — and every permission with it.',
		madeBy: 'Free software by <a class="eodia" href="https://eodia.com/en/">Eodia</a>.',
		columns: {
			product: {
				title: 'Product',
				links: [
					{ href: '/fonctionnalites/questions/', label: 'Questions' },
					{ href: '/fonctionnalites/tableaux-de-bord/', label: 'Dashboards' },
					{ href: '/fonctionnalites/copilot/', label: 'Copilot' },
					{ href: '/fonctionnalites/droits/', label: 'Permissions' },
				],
			},
			developers: {
				title: 'Developers',
				links: [
					{ href: '/integrations/api-rest/', label: 'REST API' },
					{ href: '/integrations/mcp/', label: 'MCP server' },
					{ href: '/integrations/integration-signee/', label: 'Signed embedding' },
					{ href: '/architecture/principes/', label: 'Architecture' },
				],
			},
			hosting: {
				title: 'Hosting',
				links: [
					{ href: '/guides/installation/', label: 'Installation' },
					{ href: '/hebergement/docker/', label: 'Docker' },
					{ href: '/hebergement/variables/', label: 'Variables' },
					{ href: '/hebergement/sso/', label: 'Single sign-on' },
				],
			},
			project: {
				title: 'Project',
				links: [
					{ href: 'https://github.com/eodia/insights', label: 'GitHub' },
					{ href: 'https://github.com/eodia/insights/blob/main/LICENSE', label: 'AGPL-3.0 license' },
					{ href: 'https://eodia.com/en/', label: 'Eodia' },
				],
			},
		},
		copyright: '© {year} <a href="https://eodia.com/en/">Eodia</a> — eodia insights is released under the AGPL-3.0-or-later license.',
		builtWith: 'Made in France, with Trino, PostgreSQL and a lot of coffee.',
	},

	docsFooter: {
		madeBy: 'eodia insights is free software by <a href="https://eodia.com/en/">Eodia</a>.',
	},

	hero: {
		eyebrow: 'eodia insights',
		title: 'All your databases.',
		titleAccent: 'One source of truth.',
		lead: 'Ask PostgreSQL, MongoDB and Snowflake a question in a single query. Everyone sees only what they’re allowed to see — even in free-form SQL.',
		primary: 'Install eodia insights',
		secondary: 'Read the docs',
		facts: ['Open source, AGPL-3.0', 'Seven engines, one query', 'Permissions enforced by Trino'],
	},

	story: {
		aria: 'The steps of the demo',
		steps: {
			builder: {
				tab: 'No code',
				title: 'A question, without a line of SQL.',
				text: 'Pick a table, filter, summarize: the chart draws itself as you click.',
			},
			sql: {
				tab: 'SQL',
				title: 'Or all the SQL you want.',
				text: 'A Trino editor with autocomplete, variables and formatting. Join two databases like two tables.',
			},
			copilot: {
				tab: 'Copilot',
				title: 'Just ask. It writes the query.',
				text: 'The copilot reads your schema, suggests the query and the chart. You review, you apply.',
			},
			dashboard: {
				tab: 'Dashboard',
				title: 'It all comes together on a dashboard.',
				text: 'Cards, filters that drive the whole page, auto-refresh — and a link to share.',
			},
		},
	},

	stage: {
		url: 'insights.example.com',
		workspace: 'Shop',
		workspaceSub: 'eodia insights',
		nav: {
			home: 'Home',
			browse: 'Browse',
			sql: 'SQL editor',
			data: 'Data',
			history: 'History',
		},
		folders: 'Folders',
		folderNames: ['My folder', 'Sales', 'Customer service', 'Management'],
		breadcrumb: 'Sales',
		builder: {
			title: 'Revenue by channel',
			data: 'Data',
			table: 'Orders',
			filter: 'Filter',
			filterValue: 'Status is delivered',
			summarize: 'Summarize',
			metric: 'Sum of Total amount',
			by: 'by',
			group: 'Channel',
			visualize: 'Visualize',
			save: 'Save',
		},
		sql: {
			title: 'Baskets and tickets',
			run: 'Run',
			rows: '6 rows · 412 ms',
			columns: ['Region', 'Average basket', 'Tickets', 'Satisfaction'],
		},
		copilot: {
			title: 'Copilot',
			ask: 'Which channel has the best average basket this quarter?',
			steps: ['Searching the schema', 'Reading boutique.commandes', 'Writing the query'],
			answer: 'The <b>Mobile</b> channel has the highest average basket this quarter: <b>€87.40</b>, ahead of Web.',
			apply: 'Apply',
			placeholder: 'Ask a question about your data…',
		},
		dashboard: {
			title: 'Sales overview',
			filters: ['This quarter', 'All regions'],
			refresh: 'Refreshed 2 min ago',
			kpis: [
				{ label: 'Revenue', value: '€1.28M', delta: '+12.4%' },
				{ label: 'Orders', value: '14,302', delta: '+8.1%' },
				{ label: 'Average basket', value: '€89.50', delta: '+3.9%' },
				{ label: 'Satisfaction', value: '4.6 / 5', delta: '+0.2' },
			],
			trend: 'Revenue by week',
			channels: 'By channel',
		},
		channels: ['Web', 'Mobile', 'Marketplace'],
		regions: ['Île-de-France', 'Auvergne-Rhône-Alpes', 'Occitanie', 'Bretagne', 'Nouvelle-Aquitaine', 'Hauts-de-France'],
	},

	engine: {
		kicker: 'One engine',
		title: 'Seven databases.',
		titleAccent: 'One query.',
		lede: 'Every query goes through Trino: the visual editor, SQL, cards, the copilot, the API and MCP. A PostgreSQL table and a MongoDB collection join like two tables in the same database.',
		hub: 'Trino',
		hubSub: 'single engine',
		result: 'One result',
		resultSub: '6 rows · 412 ms',
		points: [
			{ title: 'One dialect', text: 'Trino SQL everywhere: in the editor, in questions, in what the copilot writes.' },
			{ title: 'Added on the fly', text: 'A database connected from the UI becomes a Trino catalog — no restart, nothing.' },
			{ title: 'Encrypted secrets', text: 'Source credentials are encrypted with AES-256-GCM; Trino writes nothing to disk.' },
		],
		link: 'Connect a source',
	},

	rights: {
		kicker: 'Permissions that hold',
		title: 'Same query.',
		titleAccent: 'Everyone their own data.',
		lede: 'Before every statement, Trino asks eodia insights what the person can read. Rows from other regions vanish, emails get masked — even in free-form SQL.',
		people: {
			admin: { name: 'Alice Martin', role: 'Administrator' },
			analyst: { name: 'Camille Durand', role: 'Analyst · Bretagne' },
		},
		viewAs: 'View as',
		table: 'boutique.public.clients',
		columns: ['Customer', 'Email', 'City', 'Region'],
		rows: [
			{ name: 'Léa Moreau', email: 'lea.moreau@example.com', city: 'Rennes', region: 'Bretagne' },
			{ name: 'Hugo Petit', email: 'hugo.petit@example.com', city: 'Lyon', region: 'Auvergne-Rhône-Alpes' },
			{ name: 'Inès Garcia', email: 'ines.garcia@example.com', city: 'Brest', region: 'Bretagne' },
			{ name: 'Jules Roux', email: 'jules.roux@example.com', city: 'Paris', region: 'Île-de-France' },
			{ name: 'Zoé Simon', email: 'zoe.simon@example.com', city: 'Rennes', region: 'Bretagne' },
			{ name: 'Noah Vincent', email: 'noah.vincent@example.com', city: 'Toulouse', region: 'Occitanie' },
		],
		rule: 'region = {{user.region}}',
		decisions: {
			admin: ['Access to boutique.clients: allowed', 'No row filter', 'No column mask'],
			analyst: ['Access to boutique.clients: allowed', 'Row filter: region = ’Bretagne’', 'Mask: email'],
		},
		opa: 'Trino → eodia insights',
		count: { admin: '2,500 customers', analyst: '163 customers' },
		points: [
			{ title: 'Rows', text: 'Per-group rules, based on the person’s attributes. A missing attribute closes access — it never opens it.' },
			{ title: 'Columns', text: 'Hidden, they no longer exist; masked, Trino replaces the value. In questions, exports, the API.' },
			{ title: 'Everywhere', text: 'Editor, free-form SQL, cards, copilot, API, MCP: one decision point, no back door.' },
		],
		link: 'All about permissions',
	},

	copilot: {
		kicker: 'Copilot',
		title: 'Ask the question.',
		titleAccent: 'Read the answer.',
		lede: 'The copilot knows your schema, your descriptions and your metrics. It writes the query, picks the chart, builds a dashboard — live, and always under your permissions.',
		ask: 'Show me ticket resolution time by reason, for Premium customers.',
		thinking: [
			{ tool: 'search_schema', text: 'support.tickets, boutique.clients' },
			{ tool: 'describe_table', text: 'support.tickets — 8 columns' },
			{ tool: 'run_sql', text: '6 rows · 238 ms' },
		],
		answer: 'For Premium customers, <b>refunds</b> take the longest to resolve: <b>61 h</b> on average, twice as long as account questions.',
		bars: [
			{ label: 'Refund', value: 61 },
			{ label: 'Defective product', value: 54 },
			{ label: 'Delivery', value: 47 },
			{ label: 'Billing', value: 38 },
			{ label: 'Return', value: 35 },
			{ label: 'Customer account', value: 29 },
		],
		unit: 'h',
		chartTitle: 'Average resolution time',
		apply: 'Save the question',
		providers: 'Anthropic, OpenAI, Mistral or any OpenAI-compatible service.',
		link: 'Discover the copilot',
	},

	dashboards: {
		kicker: 'Dashboards',
		title: 'Today’s numbers,',
		titleAccent: 'up to date.',
		lede: 'Drag questions onto a grid, add filters that drive every card, tabs, text. The dashboard refreshes itself; the cache makes it instant.',
		points: [
			{ title: 'Linked filters', text: 'One period, one region: every card follows, whatever its source.' },
			{ title: 'Refreshed, cached', text: 'Auto-refresh, a result cache, and warm-up by the worker.' },
			{ title: 'Shared', text: 'A public link, a members-only link, or a signed embed in your product.' },
		],
		link: 'Build a dashboard',
		board: {
			title: 'Sales overview',
			tabs: ['Overview', 'Products', 'Customers'],
			filters: ['This quarter', 'All regions', 'All channels'],
			revenue: 'Revenue by week',
			current: 'This year',
			previous: 'Last year',
			map: 'Customers by city',
			categories: 'Sales by department',
			rayons: ['Tech', 'Home', 'Sports', 'Culture'],
			heat: 'Orders by day and hour',
		},
	},

	agents: {
		kicker: 'API and MCP',
		title: 'Your metrics,',
		titleAccent: 'in Claude.',
		lede: 'The MCP server gives Claude — or any agent — the tools to explore your data: search the schema, query a metric, run a question. The token carries its owner’s permissions, not one more.',
		chat: {
			user: 'How many orders did Bretagne place in September, and how does that compare to August?',
			tool: 'query_metric',
			toolArgs: 'orders · region = Bretagne · by month',
			answer: '<b>1,184 orders</b> in September, versus 1,027 in August: <b>+15.3%</b>. The region’s best month of the year.',
		},
		tabs: { mcp: 'MCP', rest: 'REST', embed: 'Embedding' },
		tools: ['list_datasources', 'search_schema', 'describe_table', 'list_metrics', 'query_metric', 'list_questions', 'run_question', 'run_sql', 'get_dashboard'],
		toolsLabel: 'The MCP server’s tools',
		link: 'Connect Claude',
		linkApi: 'Explore the API',
	},

	features: {
		title: 'And everything you expect from a BI tool.',
		lede: 'What gets a team to adopt it — and lets an admin sleep at night.',
		items: {
			engines: { stat: '7', title: 'Engines', text: 'PostgreSQL, MySQL, SQL Server, Oracle, Snowflake, MongoDB and Trino.', href: '/fonctionnalites/sources/' },
			structure: { title: 'Structure screen', text: 'Descriptions, semantic types, relationships and values: your schema, readable at last.', href: '/fonctionnalites/sources/' },
			metrics: { code: 'CA = sum(montant_total)', title: 'Models and metrics', text: 'Defined once, reused everywhere, queryable through the API and MCP.', href: '/fonctionnalites/modeles-et-metriques/' },
			sso: { title: 'Single sign-on', text: 'OpenID Connect; attributes and groups come from your directory.', href: '/hebergement/sso/' },
			folders: { title: 'Folders', text: 'A personal folder for everyone, shared folders with per-group permissions.', href: '/fonctionnalites/partage/' },
			history: { title: 'History', text: 'Every query run: who, what, how long, from where.', href: '/fonctionnalites/questions/' },
			native: { code: 'system.query(…)', title: 'Native SQL', text: 'The database’s own dialect, reserved for those with no restriction on the source.', href: '/fonctionnalites/questions/' },
			audit: { title: 'Audit log', text: 'Sign-ins, permissions, sources, tokens, shares: everything is logged.', href: '/fonctionnalites/droits/' },
		},
	},

	selfHost: {
		kicker: 'On your servers',
		title: 'Your data never leaves',
		titleAccent: 'your server.',
		lede: 'One Docker image, one Compose file: PostgreSQL for the catalog, Trino, the app, and Caddy for HTTPS. The first screen creates the admin account.',
		points: ['Automatic HTTPS with Caddy', 'One image, five roles: api, web, worker, mcp, all', 'Sealed, replayable catalog migrations'],
		cta: 'Installation guide',
	},

	faq: {
		title: 'Frequently asked questions',
		items: {
			metabase: {
				q: 'How is it different from Metabase?',
				a: 'The spirit is the same: questions, models, dashboards. The difference is underneath: every query goes through Trino, which joins your databases together and enforces row and column permissions itself — free-form SQL included.',
			},
			trino: {
				q: 'Do I need to know how to run Trino?',
				a: 'No. eodia insights creates and recreates the Trino catalogs from your sources on its own; Trino keeps no state. A single container is enough to get started.',
			},
			sql: {
				q: 'Can free-form SQL bypass permissions?',
				a: 'No. Permissions aren’t enforced by the interface but by Trino, which checks with eodia insights before every statement: table access, row filters, column masks. Native SQL, which would bypass Trino, is reserved for those with no restriction on the source.',
			},
			mongo: {
				q: 'MongoDB, really?',
				a: 'Yes: a collection reads like a table, and joins a PostgreSQL or Snowflake table in the same query. Subdocuments come through as structs.',
			},
			ai: {
				q: 'Does my data go to an AI provider?',
				a: 'Only if you turn on the copilot, with the provider you choose — Anthropic, OpenAI, Mistral or an OpenAI-compatible service, including one you host yourself. No key, no copilot. A per-person, per-hour quota caps usage.',
			},
			license: {
				q: 'Is it really free?',
				a: 'Yes, under the AGPL-3.0-or-later license: install it, use it and modify it freely. If you offer a modified version as an online service, you publish your changes.',
			},
		},
	},

	cta: {
		title: 'Plug in your databases.',
		titleAccent: 'Ask your questions.',
		text: 'One command to get started, a built-in demo to try it out, and the docs for everything else.',
		primary: 'Install eodia insights',
		secondary: 'View on GitHub',
	},
} satisfies DeepPartial<Dict>;
