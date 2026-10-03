# eodia insights — le site

Le site public d’eodia insights, logiciel libre d’[Eodia](https://eodia.com/fr/) : la page
d’accueil et la documentation. [Astro](https://astro.build) et
[Starlight](https://starlight.astro.build), en français d’abord et en anglais (voir
`src/i18n/`). Publié sur GitHub Pages sous `https://eodia.github.io/insights/`.

Ce dossier est un projet à part : il n’appartient pas à l’espace de travail pnpm du dépôt et
s’installe avec npm.

```bash
cd www
npm install
npm run dev       # http://localhost:4321/insights/
npm run build     # le site statique dans dist/
npm run check     # vérification des types
```

## Où est quoi

| Chemin | Contenu |
|---|---|
| `src/views/Home.astro` | la page d’accueil, écrite une fois pour toutes les langues, assemblée à partir de `src/components/home/` |
| `src/components/home/` | ses scènes : le récit au défilement (`Story` + `Stage`, la fenêtre de l’application), le moteur unique (`Engine`), les droits (`Rights`), le copilot, le tableau de bord qui s’assemble, l’API et le MCP, les tuiles, l’auto-hébergement |
| `src/components/landing/` | la barre de navigation, le pied de page, le sélecteur de langue, le logo, les icônes |
| `src/pages/` | les adresses : le français à la racine, les autres langues sous `[locale]/` |
| `src/i18n/` | les langues (`locales.ts`), les textes de l’accueil (`ui/fr.ts`, puis `ui/en.ts`), la détection de la langue (`detect.ts`) |
| `src/content/docs/` | la documentation (Markdown), une page par fichier ; ses traductions sous `src/content/docs/<langue>/` |
| `src/styles/` | les jetons de couleur et de typographie (`landing.css`), ce que partagent les sections de l’accueil (`home.css`), le thème de la documentation (`starlight-custom.css`) |
| `src/lib/motion.ts` | ce que partagent les animations : progression d’une section dans l’écran, dessin mis à l’échelle, animation qui ne tourne qu’à l’écran |
| `astro.config.mjs` | l’adresse du site et la barre latérale de la documentation |

## Les textes et les langues

Tous les textes de l’accueil sont dans `src/i18n/ui/fr.ts` ; une langue les traduit dans
`src/i18n/ui/<code>.ts`, ce qui manque reste en français. Ajouter une langue : la déclarer
dans `LOCALES` (`src/i18n/locales.ts`), écrire son dictionnaire, traduire les groupes de la
barre latérale (`translations` dans `astro.config.mjs`). Les liens du site s’écrivent comme
sur le site français, sans `/insights` : la page les donne dans la langue du lecteur.

Les chiffres des maquettes reprennent la démonstration (`docker/demo/`) : la boutique en
ligne sur PostgreSQL et le support client sur MongoDB.

## Les animations

Chaque scène se lit sans JavaScript (tout est affiché) et respecte
`prefers-reduced-motion`. Les maquettes sont dessinées à taille fixe (1080 px de large) et
mises à l’échelle de leur cadre (`fit`).

## Publier

Le workflow `.github/workflows/deploy-www.yml` construit et publie le site sur GitHub Pages,
à la main (« Run workflow ») ou en poussant une étiquette `www-v*`.
