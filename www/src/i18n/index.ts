/**
 * What a landing page needs to speak its reader's language: the texts, and the tools to
 * fill them in — see `README.md`.
 */
import { type Locale, localeInfo, localizedPath } from './locales';
import type { Plural } from './types';
import { getDict } from './ui';

export * from './locales';
export type { Plural } from './types';
export { type DeepPartial, type Dict, getDict, getOverrides } from './ui';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Fills `{name}` in a text. Unknown names stay as they are — `{{user.region}}` is not one. */
export function fill(text: string, values: Record<string, string | number>, escape = false): string {
	return text.replace(/\{(\w+)\}/g, (whole, name: string, offset: number) => {
		// `{{user.region}}`: a variable of eodia insights shown as such, not a value of the page.
		if (text[offset - 1] === '{' || text[offset + whole.length] === '}') return whole;
		const value = values[name];
		if (value === undefined) return whole;
		return escape ? escapeHtml(String(value)) : String(value);
	});
}

/**
 * Gives the reader's language to the site's links of an HTML text: every `href="/…"`
 * (an address written as on the French site) goes through `localizedPath`.
 */
export function localizeHtml(locale: Locale, html: string): string {
	return html.replace(/href="(\/[^"]*)"/g, (_, path: string) => `href="${localizedPath(locale, path)}"`);
}

/** Everything a page or a component in a language needs. */
export function i18n(locale: Locale) {
	const { lang } = localeInfo(locale);
	const numbers = new Intl.NumberFormat(lang);
	const rules = new Intl.PluralRules(lang);
	return {
		locale,
		lang,
		t: getDict(locale),
		/** An address of the site, in this language. */
		href: (path: string) => localizedPath(locale, path),
		/** An HTML text of the dictionary, its links in this language. */
		html: (text: string) => localizeHtml(locale, text),
		fill,
		/** A number, as this language writes it. */
		number: (n: number, options?: Intl.NumberFormatOptions) =>
			options === undefined ? numbers.format(n) : new Intl.NumberFormat(lang, options).format(n),
		/** `{n} table` or `{n} tables`, as this language counts. */
		plural: (forms: Plural, n: number) => {
			const form = forms[rules.select(n) as keyof Plural] ?? forms.other;
			return fill(form, { n: numbers.format(n) });
		},
		/** A day, `YYYY-MM-DD`, written out: « 27 septembre 2026 », "September 27, 2026". */
		date: (day: string) =>
			new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
				new Date(`${day}T00:00:00Z`),
			),
	};
}

export type I18n = ReturnType<typeof i18n>;

/** The two parts of a title: before, between {braces} (the accent hand), after. */
export function accentParts(title: string): [string, string, string] {
	const [before = '', accent = '', after = ''] = title.split(/[{}]/);
	return [before, accent, after];
}
