/**
 * The site's languages. French is the source and lives at the root URLs (`/insights/…`);
 * every other language has its own directory (`/insights/en/…`), under the same paths.
 * A language is added here, then translated in `ui/<code>.ts` (see `README.md`). This module is also read by
 * `astro.config.mjs`: it imports nothing from Astro.
 */

export const LOCALES = [
	{ code: 'fr', lang: 'fr', label: 'Français', og: 'fr_FR' },
	{ code: 'en', lang: 'en', label: 'English', og: 'en_US' },
] as const;

/** A language of the site, by its code: its URL directory, or `fr` for the root. */
export type Locale = (typeof LOCALES)[number]['code'];
export type LocaleInfo = (typeof LOCALES)[number];

/** The source language, served at the root. */
export const DEFAULT_LOCALE: Locale = 'fr';
/** The language of a browser that asks for none of ours. */
export const FALLBACK_LOCALE: Locale = 'en';

/** The languages served under their own directory. */
export const PREFIXED_LOCALES = LOCALES.filter((l) => l.code !== DEFAULT_LOCALE);

const CODES: readonly string[] = LOCALES.map((l) => l.code);

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && CODES.includes(value);
}

export function localeInfo(locale: Locale): LocaleInfo {
	return LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
}

/** Starlight's name for a language: `root` for French, its directory otherwise. */
export function starlightKey(locale: Locale): string {
	return locale === DEFAULT_LOCALE ? 'root' : locale;
}

/** The locales as Starlight declares them. */
export function starlightLocales(): Record<string, { label: string; lang: string }> {
	return Object.fromEntries(LOCALES.map((l) => [starlightKey(l.code), { label: l.label, lang: l.lang }]));
}

/** The site's base path, without its trailing slash: `/insights`. */
const BASE = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/insights/').replace(/\/$/, '');

/** The language of a URL path (with or without the base): its first directory, French otherwise. */
export function localeFromPath(pathname: string): Locale {
	const rest = pathname.startsWith(`${BASE}/`) || pathname === BASE ? pathname.slice(BASE.length) : pathname;
	const first = (rest.split('/')[1] ?? '').toLowerCase();
	return isLocale(first) && first !== DEFAULT_LOCALE ? first : DEFAULT_LOCALE;
}

/**
 * A path as the French site writes it — `/fonctionnalites/droits/`, without the base or a
 * language —, whatever language and base the given path carries.
 */
export function stripLocale(pathname: string): string {
	let rest = pathname.startsWith(`${BASE}/`) || pathname === BASE ? pathname.slice(BASE.length) : pathname;
	const locale = localeFromPath(rest);
	if (locale !== DEFAULT_LOCALE) rest = rest.slice(locale.length + 1);
	return rest.startsWith('/') ? rest : `/${rest}`;
}

/**
 * The address of a page of the site in a language. `path` is written as on the French
 * site, from the root and without the base: `localizedPath('en', '/fonctionnalites/droits/')`
 * gives `/insights/en/fonctionnalites/droits/`, and French keeps `/insights/fonctionnalites/droits/`.
 * External addresses and anchors pass through; files exist once, at the root, and are never
 * prefixed.
 */
export function localizedPath(locale: Locale, path: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('#') || path.startsWith('//')) return path;
	const site = stripLocale(path);
	const [pathname = '/'] = site.split(/[?#]/);
	const isFile = /\.[a-z0-9]+$/i.test(pathname);
	const dir = locale === DEFAULT_LOCALE || isFile ? '' : `/${locale}`;
	return `${BASE}${dir}${site}`;
}

/** A language whose every form reads one of the site's, once the site speaks it. */
export const ALIASES: Record<string, string> = { pt: 'pt-br', zh: 'zh-cn', no: 'nb', nn: 'nb' };

/**
 * The language a tag asks for, if the site speaks it: the exact tag first, then its
 * language alone, through `ALIASES` (`pt-PT` would read Brazilian Portuguese).
 */
export function localeOfTag(tag: string): Locale | null {
	const clean = tag.trim().toLowerCase().replace(/_/g, '-');
	if (clean === '') return null;
	if (isLocale(clean)) return clean;
	const language = clean.split('-')[0] ?? '';
	const alias = ALIASES[language] ?? language;
	return isLocale(alias) ? alias : null;
}

/** The first language of a browser's list the site speaks, and English otherwise. */
export function matchLocale(tags: readonly string[]): Locale {
	for (const tag of tags) {
		const found = localeOfTag(tag);
		if (found !== null) return found;
	}
	return FALLBACK_LOCALE;
}
