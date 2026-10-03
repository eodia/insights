/**
 * The shapes the dictionaries share. The French dictionary (`ui/fr.ts`) is built with
 * them; a translation only ever overrides texts.
 */

/**
 * A text that depends on a number, `{n}` standing for it. The forms are those of
 * `Intl.PluralRules`; `other` is the one used when a form is missing.
 */
export interface Plural {
	zero?: string;
	one?: string;
	two?: string;
	few?: string;
	many?: string;
	other: string;
}

/**
 * A link. An address of the site is written as on the French site, from the root and
 * without `/insights` — `/fonctionnalites/droits/` —: the page gives it the reader's language.
 */
export interface Link {
	href: string;
	label: string;
}

/** A question of the FAQ. */
export interface Question {
	q: string;
	a: string;
}

/** A tile of the home page's features: a sentence, and what the tile shows large. */
export interface Tile {
	/** A figure, shown large: `7`. */
	stat?: string;
	/** A formula, shown as code. */
	code?: string;
	title: string;
	text: string;
	href: string;
}
