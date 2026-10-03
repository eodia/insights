import { ALIASES, DEFAULT_LOCALE, FALLBACK_LOCALE, PREFIXED_LOCALES } from './locales';

/** Where a reader's choice of language is kept, in their browser. */
export const LANGUAGE_KEY = 'insights-lang';

/**
 * The inline script, in the `<head>` of every page — the landing pages' and Starlight's —
 * that takes a reader to their language:
 *
 * - a choice kept in `localStorage` wins: a page in another language is replaced by the
 *   same page in the chosen one, query and anchor kept;
 * - with no choice, only a French (root) page moves, to the first language of the browser
 *   the site speaks — the same rules as `matchLocale` in `locales.ts`;
 * - a page asked for in a given language (`/insights/en/…`) never moves without a choice;
 * - nothing happens for robots, or when `localStorage` cannot be read.
 *
 * It also keeps the choice: a click on a link of the language picker (`data-bd-lang`),
 * or a change of Starlight's language select. The page it lands on then matches the
 * choice, and nothing moves again: the script cannot loop.
 */
export function languageScript(base: string): string {
	const codes = JSON.stringify(PREFIXED_LOCALES.map((l) => l.code));
	const b = JSON.stringify(base.replace(/\/$/, ''));
	return `(function(){var K=${JSON.stringify(LANGUAGE_KEY)},A=${JSON.stringify(ALIASES)},B=${b},L=${codes},D=${JSON.stringify(DEFAULT_LOCALE)},s;
try{s=window.localStorage;s.getItem(K)}catch(e){return}
function ok(c){return c===D||L.indexOf(c)>=0}
function loc(p){var c=(p.slice(B.length).split('/')[1]||'').toLowerCase();return L.indexOf(c)>=0?c:D}
function keep(c){try{if(ok(c))s.setItem(K,c)}catch(e){}}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[data-bd-lang]');if(a)keep(a.getAttribute('data-bd-lang'))},true);
document.addEventListener('change',function(e){var t=e.target;if(t&&t.closest&&t.closest('starlight-lang-select'))keep(loc(t.value))},true);
if(/bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent))return;
var p=location.pathname;if(p.indexOf(B)!==0)return;
var here=loc(p),want=s.getItem(K);
function match(tags){for(var i=0;i<tags.length;i++){var t=String(tags[i]).toLowerCase().replace(/_/g,'-'),l=t.split('-')[0];
if(ok(t))return t;var a=A[l]||l;if(ok(a))return a}
return ${JSON.stringify(FALLBACK_LOCALE)}}
function go(to){var rest=here===D?p.slice(B.length):p.slice(B.length+1+here.length);
location.replace(B+(to===D?'':'/'+to)+(rest||'/')+location.search+location.hash)}
if(ok(want)){if(want!==here)go(want)}
else if(here===D){var m=match(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']);if(m!==D)go(m)}
})();`;
}
