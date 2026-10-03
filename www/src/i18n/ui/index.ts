/**
 * The dictionaries of the landing pages: French (`fr.ts`) is complete, every other
 * language (`<code>.ts`, `en.ts`, `pt-br.ts`…) overrides what it translates. A file added
 * here is picked up by itself — nothing to declare.
 */
import { type Locale, DEFAULT_LOCALE, isLocale } from '../locales';
import fr, { type Dict } from './fr';

export type { Dict };

/**
 * What a translation may hold: any part of the French dictionary. A list (the bullets of
 * a block, the items of a changelog entry) is given whole; a record (the questions of the
 * FAQ, the entries of the changelog) key by key.
 *
 * ```ts
 * import type { DeepPartial, Dict } from './index';
 * export default { hero: { badge: '…' } } satisfies DeepPartial<Dict>;
 * ```
 */
export type DeepPartial<T> = T extends readonly unknown[]
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;

const files = import.meta.glob<{ default: DeepPartial<Dict> }>(['./*.ts', '!./index.ts', '!./fr.ts'], {
	eager: true,
});

const overrides = new Map<Locale, DeepPartial<Dict>>();
for (const [path, module] of Object.entries(files)) {
	const code = path.replace(/^\.\//, '').replace(/\.ts$/, '');
	if (isLocale(code) && code !== DEFAULT_LOCALE) overrides.set(code, module.default);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** French, with a translation laid over it: records merged key by key, lists and texts replaced. */
function merge(base: unknown, over: unknown): unknown {
	if (over === undefined || over === null) return base;
	if (!isRecord(base) || !isRecord(over)) return over;
	const out: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(over)) out[key] = merge(base[key], value);
	return out;
}

const cache = new Map<Locale, Dict>();

/** The texts of a language; what it does not translate stays French. */
export function getDict(locale: Locale): Dict {
	let dict = cache.get(locale);
	if (dict === undefined) {
		const over = overrides.get(locale);
		dict = over === undefined ? fr : (merge(fr, over) as Dict);
		cache.set(locale, dict);
	}
	return dict;
}

/** Only what a language translates itself — `undefined` for French, or a language without its file. */
export function getOverrides(locale: Locale): DeepPartial<Dict> | undefined {
	return overrides.get(locale);
}
