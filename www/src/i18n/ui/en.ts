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

	demo: {
		short: 'Demo',
		cta: 'Try the demo',
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
							charts: { href: '/fonctionnalites/visualisations/', title: 'Visualizations', text: 'Twenty-two forms, palettes everyone can read.' },
							assistant: { href: '/fonctionnalites/assistant/', title: 'AI Assistant', text: 'Talk with your data, in charts.' },
						},
					},
					share: {
						title: 'Share',
						items: {
							dashboards: { href: '/fonctionnalites/tableaux-de-bord/', title: 'Dashboards', text: 'Filters, tabs, auto-refresh.' },
							sharing: { href: '/fonctionnalites/partage/', title: 'Folders and sharing', text: 'Public links, embedded in your pages.' },
							themes: { href: '/fonctionnalites/themes/', title: 'Themes and PDF', text: 'Your brand, inherited by folder, down to the PDF.' },
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
					tag: 'New',
					title: 'The AI assistant',
					text: 'Ask the question, read the answer in charts: it finds the tables, writes the SQL and runs it with your permissions.',
					cta: 'Discover the assistant',
					href: '/fonctionnalites/assistant/',
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
					{ href: '/fonctionnalites/assistant/', label: 'AI Assistant' },
					{ href: '/fonctionnalites/themes/', label: 'Themes and PDF' },
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
		announce: { tag: 'New', text: 'Forecasts: extend your curves, seasons included', href: '#previsions' },
		primary: 'Install eodia insights',
		secondary: 'Read the docs',
		watch: 'Watch the video',
		facts: ['Open source, AGPL-3.0', 'AI assistant and forecasts', 'Permissions enforced by Trino'],
	},

	film: {
		eyebrow: 'The demo',
		title: 'eodia insights,',
		tabs: { label: 'Choose the film', short: 'In one minute', full: 'The full tour' },
		short: {
			titleAccent: 'in one minute.',
			text: 'Questions, charts, SQL, the AI assistant, dashboards and permissions: the essentials, narrated and set to music.',
			duration: '1:00',
		},
		full: {
			titleAccent: 'in four minutes.',
			text: 'From the first question to the shared dashboard, and the same data seen by two people: the full guided tour.',
			duration: '4:06',
		},
		play: 'Play the video',
		chapters: 'Chapters',
		captions: 'English',
		inFrench: 'The films are narrated in French, with English subtitles.',
		list: [
			{ time: '0:12', title: 'All your databases' },
			{ time: '0:39', title: 'A question, without SQL' },
			{ time: '1:13', title: 'Charts that tell a story' },
			{ time: '1:32', title: 'SQL, for those who want it' },
			{ time: '1:53', title: 'The AI assistant' },
			{ time: '2:10', title: 'Dashboards' },
			{ time: '2:31', title: 'Sharing, in your colors' },
			{ time: '2:52', title: 'Permissions enforced by Trino' },
			{ time: '3:18', title: 'Same dashboard, each their own data' },
			{ time: '3:33', title: 'Spaces, API and MCP' },
		],
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
			assistant: {
				tab: 'AI assistant',
				title: 'Ask. It answers, chart in hand.',
				text: 'The assistant searches your schema, runs the query under your permissions and shows you the result — to keep as a question.',
			},
			dashboard: {
				tab: 'Dashboard',
				title: 'It all comes together on a dashboard.',
				text: 'Cards, filters that drive the whole page, auto-refresh — and a link to share.',
			},
			forecast: {
				tab: 'Forecasts',
				title: 'And what comes next.',
				text: 'A curve goes on in one click: the trend, the season and a margin of uncertainty, computed in your browser.',
			},
		},
	},

	stage: {
		url: 'insights.example.com',
		sources: 'All sources',
		nav: {
			home: 'Home',
			assistant: 'AI assistant',
			folders: 'Folders',
			sql: 'SQL editor',
			sources: 'Data sources',
			structure: 'Structure',
			history: 'History',
			admin: 'Administration',
			api: 'API and MCP',
		},
		badge: 'New',
		folderNames: ['My folder', 'Customer service', 'Sales'],
		user: { name: 'Alice Martin', role: 'Administrator' },
		newItem: 'New',
		search: 'Search…',
		crumbs: {
			builder: ['Questions', 'Revenue by channel'],
			sql: ['SQL editor'],
			assistant: ['AI assistant'],
			dashboard: ['Dashboards', 'Shop sales'],
			forecast: ['Questions', 'Revenue by month'],
		},
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
		assistant: {
			newChat: 'New conversation',
			search: 'Search conversations',
			today: 'Today',
			history: ['Average basket by channel', 'Loyal customers in 2026', 'Returns by region', 'Tickets opened this week'],
			ask: 'Which channel has the best average basket this quarter?',
			steps: ['Searching the schema', 'Reading the table', 'Running the query', 'Preparing the chart'],
			answer: 'The <b>Mobile</b> channel has the highest average basket this quarter: <b>€87.40</b>, ahead of Web (€82.10) and the Marketplace (€76.80).',
			chartTitle: 'Average basket by channel',
			chartSub: 'This quarter · delivered orders',
			rows: '3 rows',
			save: 'Save as a question',
			placeholder: 'Ask anything about your data…',
			sources: 'All sources',
			hint: 'Enter to send',
		},
		dashboard: {
			title: 'Shop sales',
			description: 'Revenue, orders and customers — filterable by period and channel.',
			filters: [{ label: 'Period', value: 'Last 12 months' }, { label: 'Channel' }, { label: 'Region' }],
			share: 'Share',
			edit: 'Edit',
			tabs: ['Sales', 'Customer service', 'Orders'],
			kpis: [
				{ label: 'Revenue', value: '€7.29M' },
				{ label: 'Orders', value: '12,944' },
				{ label: 'Average basket', value: '€704.50' },
				{ label: 'Orders per week', value: '150', delta: '−18.6%' },
			],
			trend: 'Revenue by month',
			channels: 'Orders by channel',
		},
		forecast: {
			title: 'Revenue by month',
			legend: ['Revenue', 'Forecast'],
			zone: 'Forecast',
			range: 'between',
			panel: 'Forecast',
			extend: 'Extend the trend by',
			periods: 'periods',
			method: 'Method',
			methods: ['Auto', 'Line', 'Smoothed', 'Season'],
			band: 'Confidence interval (80%)',
			note: 'The forecast part is drawn in green dashes: trend and season, carried on by Holt-Winters.',
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

	/** Themes and their PDF. */
	themes: {
		kicker: 'Themes and PDF',
		title: 'In your colors,',
		titleAccent: 'down to the PDF.',
		lede: 'Fonts, colors, cards, chart palette and logo: apply a theme to a folder and everything in it wears it — subfolders, questions, dashboards, shared links and their PDF prints.',
		pickLabel: 'Pick a theme',
		names: { eodia: 'Default', fluxen: 'Hatched violet', maison: 'Maison' },
		logo: ['eodia', 'Fluxen', 'Maison'],
		dashTitle: 'Quarterly sales',
		dashSub: 'The monthly review by channel and region',
		tabs: ['Overview', 'Detail'],
		kpis: [
			{ label: 'Active sales', value: '€24.5k', delta: '+5.8% vs September' },
			{ label: 'Revenue', value: '€15.2k', delta: '+6.1% vs September' },
			{ label: 'Conversion', value: '12.5%', delta: '−1.1% vs September' },
		],
		chartTitle: 'Sales by channel',
		channels: ['Web', 'Store', 'Marketplace', 'Phone', 'Trade shows'],
		donutTitle: 'Web share',
		pdf: { date: 'October 3, 2026', footer: 'Confidential — internal use' },
		points: [
			{ title: 'Applied to a folder', text: 'The folder, its subfolders, their questions and dashboards inherit it; a subfolder or a dashboard can wear its own.' },
			{ title: 'Your brand, in ten settings', text: 'About twenty fonts, the accent, backgrounds, card corners and shadow, solid, hatched or gradient bars, your logo.' },
			{ title: 'Down to the PDF', text: 'Export to PDF lays the dashboard out on A4 pages in its colors: cover page, applied filters, vector charts, footer and page numbers.' },
		],
		link: 'All about themes',
	},

	/** The AI assistant, at work. */
	assistant: {
		kicker: 'AI Assistant',
		title: 'Talk to your data.',
		titleAccent: 'It answers in charts.',
		lede: 'A screen to talk with your data: the assistant finds the tables, writes the SQL, runs it with your permissions and shows you the answer as interactive charts. Every conversation is kept, for you alone.',
		model: 'claude-sonnet-5-5',
		newChat: 'New conversation',
		today: 'Today',
		yesterday: 'Yesterday',
		history: ['Premium resolution time', 'Monthly revenue', 'Top customers 2026'],
		older: ['Delays by carrier', 'Tickets by channel'],
		ask: 'What is the ticket resolution time by reason, for Premium customers?',
		thinking: 'Thinking…',
		steps: [
			{ label: 'Searching the schema', detail: '2 tables' },
			{ label: 'Reading the table', detail: 'Tickets' },
			{ label: 'Running the query', detail: '6 rows' },
			{ label: 'Preparing the chart', detail: '' },
		],
		chartTitle: 'Average resolution time',
		chartSub: 'Premium customers · last 90 days',
		bars: [
			{ label: 'Refund', value: 61 },
			{ label: 'Defective product', value: 54 },
			{ label: 'Delivery', value: 47 },
			{ label: 'Billing', value: 38 },
			{ label: 'Return', value: 35 },
			{ label: 'Customer account', value: 29 },
		],
		unit: 'h',
		rows: '6 rows · with your permissions',
		save: 'Save as question',
		answer: '<b>Refunds</b> take the longest to resolve: <b>61 h</b> on average, twice as long as account questions. Shall I compare with Standard customers?',
		placeholder: 'Ask anything about your data…',
		sources: 'Customer support',
		points: [
			{ title: 'Charts, not walls of text', text: 'Every answer with figures comes as an interactive chart: switch its type in one click, see its SQL, save it as a question.' },
			{ title: 'Your sources, your permissions', text: 'Pick the sources in the input; Trino applies your permissions, masked columns and row rules included.' },
			{ title: 'A history of your own', text: 'Conversations are kept, grouped by date, searched, renamed. And a copilot stays in every screen.' },
		],
		providers: 'Anthropic, OpenAI, Mistral or any OpenAI-compatible service — including one you host.',
		link: 'Discover the assistant',
		linkCopilot: 'And the copilot',
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
		tools: ['list_datasources', 'search_schema', 'describe_table', 'list_metrics', 'query_metric', 'list_questions', 'run_question', 'run_sql', 'get_dashboard', 'show_chart'],
		toolsLabel: 'The MCP server’s tools',
		link: 'Connect Claude',
		linkApi: 'Explore the API',
	},

	features: {
		title: 'And everything you expect from a BI tool.',
		lede: 'What gets a team to adopt it — and lets an admin sleep at night.',
		items: {
			engines: { stat: '7', title: 'Engines', text: 'PostgreSQL, MySQL, SQL Server, Oracle, Snowflake, MongoDB and Trino.', href: '/fonctionnalites/sources/' },
			structure: { title: 'Data sources', text: 'Connection, descriptions, semantic types, relationships and values: your schema, readable at last.', href: '/fonctionnalites/sources/' },
			metrics: { code: 'CA = sum(montant_total)', title: 'Models and metrics', text: 'Defined once, reused everywhere, queryable through the API and MCP.', href: '/fonctionnalites/modeles-et-metriques/' },
			sso: { title: 'Single sign-on', text: 'OpenID Connect; attributes and groups come from your directory.', href: '/hebergement/sso/' },
			folders: { title: 'Folders', text: 'A personal folder for everyone, shared folders with per-group permissions.', href: '/fonctionnalites/partage/' },
			history: { title: 'History', text: 'Every query run: who, what, how long, from where.', href: '/fonctionnalites/questions/' },
			native: { code: 'system.query(…)', title: 'Native SQL', text: 'The database’s own dialect, reserved for those with no restriction on the source.', href: '/fonctionnalites/questions/' },
			audit: { title: 'Audit log', text: 'Sign-ins, permissions, sources, tokens, shares: everything is logged.', href: '/fonctionnalites/droits/' },
			assistant: { title: 'AI Assistant', text: 'Talk with your data: written answers, interactive charts, a history kept for you.', href: '/fonctionnalites/assistant/' },
			themes: { title: 'Themes and PDF', text: 'Your brand applied to a folder, inherited by everything in it, down to the PDF export.', href: '/fonctionnalites/themes/' },
			languages: { code: 'fr · en · es', title: 'Three languages', text: 'The interface and API messages in the browser’s language, or the one you choose.', href: '/guides/introduction/' },
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

	forecast: {
		badge: 'New',
		kicker: 'Forecasts',
		title: 'What happened.',
		titleAccent: 'And what’s next.',
		lede: 'One click extends a line, an area or bars by 3, 6 or 12 periods. eodia insights recognises the season, draws the trend in green dashes and tells you how far to trust it.',
		chartTitle: 'Monthly revenue',
		measured: 'Measured',
		forecast: 'Forecast',
		band: '80 % interval',
		extend: 'Extend by',
		method: 'Automatic · 12-month season found',
		zone: 'Forecast',
		tip: 'forecast',
		range: '80 % interval',
		points: [
			{ title: 'The season, recognised', text: 'Holt-Winters as soon as the series covers two seasons — 12 months, 4 quarters, 7 days; otherwise a smoothed trend, or a straight line.' },
			{ title: 'An honest interval', text: 'The 80 % range widens with the horizon: you see at a glance what is likely, and what is a bet.' },
			{ title: 'Wherever your charts are', text: 'Lines, areas, bars and combos, in questions and dashboards — and all the way into Claude, through the MCP server.' },
		],
		link: 'All about forecasts',
	},

	news: {
		kicker: 'What’s new',
		title: 'Charts',
		titleAccent: 'that tell you something.',
		lede: 'Races to replay time, bubbles and treemaps for shares of shares, a calendar, key figures with their sparkline — in an interface that speaks your language and updates before your eyes.',
		more: 'Learn more',
		periods: ['Jan 2026', 'May 2026', 'Sep 2026'],
		kpis: [
			{ label: 'Active sales', value: '24.5k', delta: '+5.8%' },
			{ label: 'Conversion', value: '12.5%', delta: '−1.1%' },
		],
		say: ['Nouvelle question', 'New question', 'Nueva pregunta'],
		every: 'Every minute',
		items: {
			races: { title: 'Bar and line races', text: 'Replay history period by period: bars overtake each other, lines draw themselves, the date is written large.', href: '/fonctionnalites/visualisations/#races' },
			bubbles: { title: 'Bubbles and treemaps', text: 'Bubbles on two axes or packed, nested rectangles, a pie on several rings: shares of shares, readable at last.', href: '/fonctionnalites/visualisations/#shares-on-several-levels' },
			calendar: { title: 'The calendar', text: 'One value per day, as dots or colored squares: weekdays, seasons and gaps jump out.', href: '/fonctionnalites/visualisations/#calendar' },
			sparks: { title: 'Key figures and sparklines', text: 'The figure, its small curve — green when it goes the right way, red otherwise — and its change from the previous period.', href: '/fonctionnalites/visualisations/#bubbles-trends-funnel-as-columns' },
			languages: { title: 'French, English, Spanish', text: 'The interface takes the browser’s language, or the one chosen in the account menu; API messages follow.', href: '/guides/introduction/' },
			live: { title: 'Refreshed live', text: 'On refresh or a filter change, cards stay on screen and their marks slide to the new values.', href: '/fonctionnalites/tableaux-de-bord/#refresh-and-display' },
		},
	},

	faq: {
		title: 'Frequently asked questions',
		items: {
			forecast: {
				q: 'Can I trust the forecasts?',
				a: 'As much as the series they extend. eodia insights picks the method from the data — Holt-Winters when the series covers two seasons, a smoothed trend otherwise — and surrounds the forecast with an 80 % interval that widens with the horizon. It does not guess what the data does not hold: a new offer, a crisis.',
			},
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
				a: 'Only if you enable AI, with the provider you choose — Anthropic, OpenAI, Mistral or an OpenAI-compatible service, including one you host. Without a key, there is no assistant and no copilot. What the model reads — schema, descriptions, query results — goes through your permissions; a quota per person per hour limits usage.',
			},
			assistant: {
				q: 'Can the AI assistant see or change more than I can?',
				a: 'No. Every query it writes runs in Trino under your identity: your tables, your masked columns, your row rules. It changes nothing — it suggests, you save. Its conversations are kept for you alone, and you can delete them.',
			},
			brand: {
				q: 'Can I use my company’s brand?',
				a: 'Yes. An administrator creates a theme — fonts, colors, cards, chart palette, logo, PDF layout — and applies it to a folder: subfolders, questions, dashboards, shared links and PDF exports wear it. A dashboard can have its own.',
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
