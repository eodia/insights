// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { languageScript } from './src/i18n/detect.ts';
import { starlightLocales } from './src/i18n/locales.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://eodia.github.io',
	base: '/insights',
	integrations: [
		starlight({
			title: 'eodia insights',
			logo: {
				light: './src/assets/logo.svg',
				dark: './src/assets/logo-light.svg',
				alt: '',
			},
			favicon: '/favicon.svg',
			head: [
				// Takes a reader to their language, and keeps the choice made in the language select
				// (src/i18n/detect.ts).
				{ tag: 'script', content: languageScript('/insights') },
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/insights/apple-touch-icon.png' } },
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#0f2a1c' } },
				{ tag: 'meta', attrs: { name: 'author', content: 'Eodia' } },
				{ tag: 'link', attrs: { rel: 'author', href: 'https://eodia.com/fr/' } },
			],
			description: 'La BI open source où chaque requête passe par Trino, et chaque droit avec elle.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/eodia/insights' }],
			editLink: { baseUrl: 'https://github.com/eodia/insights/edit/main/www/' },
			components: { Footer: './src/components/DocsFooter.astro' },
			customCss: ['./src/styles/starlight-custom.css'],
			defaultLocale: 'root',
			// French at the root, every other language under its own directory (src/i18n/locales.ts).
			locales: starlightLocales(),
			sidebar: [
				{
					label: 'Pour commencer',
					translations: { en: 'Getting started' },
					items: [
						{ slug: 'guides/introduction' },
						{ slug: 'guides/installation' },
						{ slug: 'guides/premiers-pas' },
					],
				},
				{
					label: 'Fonctionnalités',
					translations: { en: 'Features' },
					items: [
						{ slug: 'fonctionnalites/sources' },
						{ slug: 'fonctionnalites/questions' },
						{ slug: 'fonctionnalites/modeles-et-metriques' },
						{ slug: 'fonctionnalites/tableaux-de-bord' },
						{ slug: 'fonctionnalites/copilot' },
						{ slug: 'fonctionnalites/partage' },
						{ slug: 'fonctionnalites/droits' },
					],
				},
				{
					label: 'Intégrations',
					translations: { en: 'Integrations' },
					items: [
						{ slug: 'integrations/api-rest' },
						{ slug: 'integrations/mcp' },
						{ slug: 'integrations/integration-signee' },
					],
				},
				{
					label: 'Hébergement',
					translations: { en: 'Hosting' },
					items: [
						{ slug: 'hebergement/docker' },
						{ slug: 'hebergement/variables' },
						{ slug: 'hebergement/sso' },
					],
				},
				{
					label: 'Architecture',
					translations: { en: 'Architecture' },
					items: [{ slug: 'architecture/principes' }],
				},
			],
		}),
	],
});
