# Audit UX/UI & plan de modernisation — front `kexamanager`

> **Nature du document** : audit d'analyse pure (aucun fichier de code modifié). Livrable destiné à un agent de développement qui n'a pas le contexte de l'audit.
> **Base de lecture** : dépôt `C:\Users\user\Code\kexamanager`, commit `e748035` (`Supprimer l'importation inutile de React dans SystemHealth`, 2025-12-09) + 3 modifications non commitées d'un agent parallèle (voir §0.4).
> **Périmètre** : `front/src/**` (React 19.1 + TypeScript 5.8 + MUI 7.3 + Vite 7 + i18next 25 + recharts 3 + monaco).
> **Cible technique imposée** : MUI **9**, i18next 26, Vite 8 (migration menée en parallèle). Toutes les recommandations sont écrites pour MUI 9 ; les points sensibles à la migration sont explicitement marqués **[dépend de la migration MUI 9]**.

---

## 0. Méthode, périmètre, chiffres de référence

### 0.1 Ce qui a été lu (lecture intégrale)

| Zone | Fichiers |
|---|---|
| Bootstrap | `front/src/main.tsx`, `front/src/App.tsx`, `front/index.html`, `front/vite.config.ts`, `front/package.json` |
| Thème & contexte | `front/src/theme/index.ts`, `front/src/contexts/SettingsContext.tsx` |
| Layout | `front/src/layouts/DashboardLayout.tsx`, `front/src/components/layout/Sidebar.tsx`, `front/src/components/layout/Header.tsx`, `front/src/components/Navigation.tsx` |
| Écrans | `pages/Login.tsx`, `pages/dashboard/{Projects,Buckets,S3Browser,ClusterLayout,ApplicationsKeys,AdminTokens,Nodes,Blocks,Workers,UserManager,PreviewPage}.tsx` |
| Sous-composants | `pages/dashboard/components/{BucketsList,ObjectsList,S3Breadcrumbs,CreateBucketDialog,CopyObjectDialog,CreateFileDialog,PreviewDialog,ActivityLogs,MetricPaper,RawCollapse}.tsx` |
| Composants partagés | `components/{PageHeader,LoadingState,ErrorState,ConfirmDialog,ResponsiveLayout,S3ConfigSelector}.tsx`, `components/dashboard/{StatCard,TrafficChart,SystemHealth,RecentDeployments}.tsx` |
| i18n | `front/src/i18n.ts`, `locales/fr/translation.json`, `locales/en/translation.json` |
| Utilitaires | `utils/{adminClient,apiWrapper,previewSession}.ts`, `auth/tokenAuth.ts` |

### 0.2 Chiffres mesurés (reproductibles — voir annexe A)

| Mesure | Valeur |
|---|---|
| Lignes `.tsx` (hors `types/openapi.ts`) | **8 154** |
| Occurrences de `sx={{` | **303** |
| Tables MUI (`<Table `) | **16**, réparties dans **10 fichiers**, aucune mutualisée |
| Occurrences de `CircularProgress` | **37** dans **17 fichiers** ; **0** `Skeleton` affiché à l'utilisateur |
| Clés de traduction FR / EN | 257 / 254 ; **21 clés identiques FR≡EN** (non traduites), **5 clés FR absentes de EN**, **2 clés EN absentes de FR** |
| Erreurs ESLint (`npx eslint src`) | **6** dont **2 `react-hooks/rules-of-hooks`** bloquantes, 1 `exhaustive-deps`, 2 `no-explicit-any`, 1 `react-refresh/only-export-components` |
| Code mort identifié | **≈ 1 100 lignes** dans 15 fichiers jamais importés (§1.3) |
| `console.log` laissés en production | **21** (`S3Browser.tsx` ×10, `PreviewDialog.tsx` ×11) |
| Couleurs hexadécimales codées en dur | **14** occurrences dans 4 fichiers |
| Styles `style={{...}}` inline sur composants MUI | **23** occurrences |

### 0.3 Ce que fait l'application (reconstitué depuis le code)

Console d'administration multi-projets pour du stockage S3-compatible **Garage** :

- **Authentification** par `username`/`password` → JWT stocké en `localStorage` (`auth/tokenAuth.ts:27-49`).
- **Multi-projets** : une liste de « S3 configs » (`/api/s3-configs`), chacune de type `garage` (avec API admin) ou `s3` (sans API admin). Le projet courant est un état global dans `App.tsx:35`, persisté en `localStorage["kexamanager:selectedProject"]` et injecté dans l'URL des appels via `adminClient.setCurrentProjectId` (`App.tsx:96`, `utils/adminClient.ts:26-32,126-149`).
- 11 routes protégées + login + redirection fallback.

### 0.4 Contexte parallèle : état de la migration MUI 9

`git status` au moment de l'audit montre 3 fichiers modifiés non commités (par l'agent de migration, **pas** par cet audit) :

```
front/src/pages/dashboard/ClusterLayout.tsx            | 2 +-   (typage formatter recharts)
front/src/pages/dashboard/PreviewPage.tsx              | 2 +-   (typage lang monaco)
front/src/pages/dashboard/components/PreviewDialog.tsx | 2 +-   (typage lang monaco)
front/bun.lockb (modifié) ; .dockerignore (non suivi)
```

Au moment de la lecture (puis vérification pendant la rédaction), le chantier de migration avait déjà avancé sur les **outils** mais **pas sur les dépendances d'exécution** :

- `dependencies` (`package.json:14-29`) : **inchangées** → MUI `^7.3.2`, i18next `^25.5.2`, react-router `^7.10.1`, recharts `^3.2.1`.
- `devDependencies` : déjà migrées (diff non commité) → `vite ^8.3.0`, `@vitejs/plugin-react ^6.1.1`, `eslint ^10`, `typescript 6.0.3`, `typescript-eslint ^8.70.0`, `globals ^17`, `openapi-typescript ^7.13.0`.

**Conséquence pour ce plan** : rien de ce qui est recommandé ici n'est bloqué par la migration en cours, mais **T1-1 (thème à variables CSS, §4.1) doit atterrir après le passage à MUI 9**, et les 4 API dépréciées listées en §4.8 doivent être corrigées dans le même commit que la montée de version. Les numéros de ligne cités correspondent à l'état de lecture (commit `e748035` + 3 retouches de typage) ; un décalage de ±3 lignes est possible dans `ClusterLayout.tsx`, `PreviewPage.tsx`, `PreviewDialog.tsx`.

---

## 1. Inventaire écran par écran

### 1.1 Carte des routes (`App.tsx:113-169`)

| Route | Composant | Garde | Ligne |
|---|---|---|---|
| `/` | `DashboardLayout` + `Outlet` | authentifié (`App.tsx:108`) | `App.tsx:114-116` |
| `/` (index) | redirige `/projects` | — | `App.tsx:118` |
| `/overview` | **désactivé** (import commenté) | — | `App.tsx:13`, `App.tsx:119` |
| `/projects` | `Projects` | — | `App.tsx:121-127` |
| `/buckets` | `Buckets` | `type==='s3'` → `/s3` | `App.tsx:130-133` |
| `/apps` | `ApplicationsKeys` | `type==='s3'` → `/s3` | `App.tsx:134-137` |
| `/manager` | `UserManager` | `type==='s3'` → `/s3` | `App.tsx:138-141` |
| `/s3` | `S3Browser` | — | `App.tsx:142` |
| `/adminTokens` | `AdminTokens` | `type==='s3'` → `/s3` | `App.tsx:143-146` |
| `/nodes` | `Nodes` | `type==='s3'` → `/s3` | `App.tsx:147-150` |
| `/blocks` | `Blocks` | `type==='s3'` → `/s3` | `App.tsx:151-154` |
| `/workers` | `Workers` | `type==='s3'` → `/s3` | `App.tsx:155-158` |
| `/cluster` | `ClusterLayout` (6 sous-onglets par `?tab=`) | `type==='s3'` → `/s3` | `App.tsx:159-162`, `ClusterLayout.tsx:119` |
| `/preview` | `PreviewPage` | — (jamais atteinte, §2 P1-6) | `App.tsx:163` |
| `*` | redirige silencieusement `/projects` | — | `App.tsx:166` |

**Aucune route n'est gardée par « un projet est sélectionné »** : seuls les items de navigation sont masqués (`Sidebar.tsx:48-49`). Un accès direct à `/buckets` sans projet affiche `Buckets` avec « No project selected » (`Buckets.tsx:330`).

### 1.2 Fiches écran

#### E1 — Login — `front/src/pages/Login.tsx` (162 l.)
- **Rôle** : authentification `username`/`password` → `authenticateWithCredentials` (`Login.tsx:32`).
- **Structure** : `Box` plein écran (`:41-51`) > `Paper` 400px (`:52-63`) > pastille icône `PersonIcon` (`:64-77`) > titres (`:79-85`) > `Alert` erreur (`:88-92`) > 2 `TextField` (`:94-117`) > bouton primaire avec spinner positionné en absolu (`:119-144`) > bouton texte « Effacer » (`:146-158`).
- **États** : erreur = `Alert` inline ; chargement = spinner superposé au bouton + champs `disabled` (`:102,114`). Pas d'état « succès », pas d'état de session expirée.
- **Responsive** : centré, `maxWidth: 400`, `minHeight: 100vh` (`:44`). Correct à partir de 360 px.
- **MUI utilisé** : `Box, Paper, Typography, TextField, Button, Alert, CircularProgress`.
- **Dette visible** :
  - **L'écran est rendu HORS de tout `ThemeProvider`** : `SettingsProvider` (qui porte `ThemeProvider`, `SettingsContext.tsx:72`) est monté *après* le retour anticipé du login (`App.tsx:108` vs `App.tsx:110-111`). Le login utilise donc le thème **MUI par défaut, clair, Roboto**, alors que l'application est sombre : `bgcolor: "background.default"` (`Login.tsx:48`) donne du blanc, `primary.main` donne du `#1976d2` par défaut au lieu de `#0EA5E9` (`theme/index.ts:7`).
  - Pas de sélecteur de langue ni de thème (impossible sans le provider), alors que `Sidebar.tsx:191-201` les propose ailleurs.
  - Pas de bouton afficher/masquer le mot de passe, pas de mapping des erreurs API (`Login.tsx:35` affiche `err.message` brut).
  - `login.title` vaut « Connexion » en FR (`locales/fr/translation.json:3`) et est utilisé comme nom produit (`Login.tsx:80`) → titre « Connexion » au lieu de « KexaManager ».
  - Bouton « Effacer » (`:146-158`) et libellé « Se connecter »/« Effacer » en plus du submit : affordance redondante.

#### E2 — Shell applicatif — `layouts/DashboardLayout.tsx` (24 l.) + `components/layout/Sidebar.tsx` (234 l.)
- **Rôle** : cadre persistant. `DashboardLayout` = `Box` flex `height: 100vh, overflow: hidden` (`:13`) + `Sidebar` + `<main>` scrollable (`:15-19`). **Pas de barre supérieure** : aucun titre de page, aucun fil d'Ariane, aucun point d'accroche d'actions globales.
- **Sidebar** : logo carré « K » (`:81-95`), navigation (`navItems` `:21-27`, `systemItems` `:29-46`), titres de section, `Collapse` pour le groupe Cluster (`:155-178`), pied avec `Select` de langue (`:191-201`), bascule thème (`:202-206`), bouton de repli (`:208-210`), bloc utilisateur **fictif** « Admin User / admin@kexa.io / JD » (`:216-222`), bouton logout (`:223-227`).
- **États** : sélection par `isSelected` comparant `pathname + search` (`:51-56`) ; pas d'état chargé/vide/erreur ; repli persisté (`SettingsContext.tsx:55-62`).
- **Responsive** : **aucune**. Largeur fixe `400 → 260|80` (`Sidebar.tsx:69`) sans `useMediaQuery` ni `Drawer` mobile (le seul `useMediaQuery` du dépôt est dans `Buckets.tsx:100`). Sur un écran de 375 px, la sidebar occupe 69 % de la largeur.
- **Dette visible** :
  - **Violation des Rules of Hooks** : `useSettings()` appelé 6 fois, dont **une fois de façon conditionnelle** (`Sidebar.tsx:192`, dans `{!sidebarCollapsed && (...)}`) et **une fois dans un callback** (`Sidebar.tsx:193`, `onChange`). ESLint le confirme : *« React Hook "useSettings" is called conditionally »* (`:192:36`) et *« React Hook "useSettings" cannot be called inside a callback »* (`:193:46`). Le nombre d'appels de hooks change donc entre l'état replié et déplié → **erreur React « Rendered fewer hooks than expected » au clic sur le bouton de repli (`:208`)**.
  - **Aucun sélecteur de projet global** : la sidebar ne montre ni ne permet de changer le projet courant. Le sélecteur existait mais dans le composant **mort** `components/Navigation.tsx:201-216`. Seul chemin pour changer de projet : retourner sur `/projects` et cliquer « Open Project » (`Projects.tsx:289-296`).
  - Six items sur dix n'ont pas de couleur porteuse d'information, `Tooltip title=""` quand la sidebar est dépliée (`:101,135`), boutons icône sans `aria-label` (`:208,224`).
  - Icônes mélangées : `lucide-react` ici (`:2`), `@mui/icons-material` dans `AdminTokens`/`Nodes`/`ObjectsList` → deux familles visuelles et un coût de bundle (`vite.config.ts:35-43`).
  - Identité utilisateur codée en dur alors que `getCurrentUser()` existe (`auth/tokenAuth.ts:63-72`) et que l'utilisateur réel est stocké à la connexion (`tokenAuth.ts:40`).
  - `height: 100vh` (`:70`, `DashboardLayout.tsx:13`) → rognage sous la barre d'URL des navigateurs mobiles (devrait être `100dvh`).

#### E3 — Projets / sélection de contexte — `pages/dashboard/Projects.tsx` (406 l.)
- **Rôle** : CRUD des S3-configs et **seul point de sélection du projet courant** (`Projects.tsx:293` → `App.tsx:124`).
- **États** :
  - chargement : **spinner plein écran qui remplace tout le contenu** (`:177-183`) → saut de layout à chaque rafraîchissement.
  - erreur : `Alert` en tête (`:225-229`) + `Alert` dans la modale (`:307-311`) ; messages **non traduits** (`:80,134,141,159,173`).
  - vide : `configs.map` sur un tableau vide (`:232-300`) → la grille reste vide, **aucun empty state**.
  - « projet ouvert » : bloc placeholder « Project workspace - configure and manage your S3/Garage environment » (`:186-209`) jamais atteignable en pratique car la sidebar masque l'écran dès qu'un projet est sélectionné (`Sidebar.tsx:48`).
- **MUI** : `Box, Button, Dialog*, TextField, Select, Card*, Alert, CircularProgress, Switch, IconButton`.
- **Dette visible** :
  - Suppression via **`window.confirm` natif, non traduit** (`:166`) alors qu'un `ConfirmDialog` thématisé existe (`components/ConfirmDialog.tsx`).
  - Grille en `gridTemplateColumns: repeat(auto-fill, minmax(350px, 1fr))` (`:231`) → 350 px minimum, premier palier de casse sous 400 px de contenu utile.
  - Badge de type avec fond codé en dur `rgba(255,255,255,0.05)` (`:252`) et URL en `rgba(0,0,0,0.2)` (`:270`) → **invisibles en thème clair**.
  - Boutons de carte incohérents : « Edit » (`:281-288`, variante `outlined color="inherit"`) vs « Open Project » (`:289-296`, `contained`), textes non i18n.
  - Spinner dans le bouton sans largeur réservée (`:400`) → décalage du bouton.

#### E4 — Buckets — `pages/dashboard/Buckets.tsx` (739 l.)
- **Rôle** : CRUD buckets via l'API admin Garage (quotas, aliases, site web, affectation de clés).
- **États** : `loading` en ligne dans le tableau (`:345-351`), vide en ligne (`:352-358`), **aucun état d'erreur** ; modale de détail avec `fullScreen` sous `sm` (`:507`, `isSmall` `:99-100` — seule logique responsive du dépôt).
- **MUI** : 20 composants dont `Autocomplete`, `Chip`, `Tooltip`, `Table*`, `Switch`.
- **Dette visible** :
  - **7 `catch` vides qui avalent les erreurs** : `:148-152`, `:162-164`, `:174-178`, `:195-197`, `:223-225`, `:258-262`, `:274-276`, `:295-297` (`// ignore for now`). Échec de suppression/édition = **aucun retour utilisateur**, l'écran peut afficher un état périmé.
  - « Aucun bucket » (`:355`) est affiché **aussi bien pour une liste vide que pour un échec de chargement** (`fetchBuckets` `:155-167` met `buckets` à `[]` en cas d'erreur) → message mensonger.
  - En-tête redondant : titre `h6` « Buckets » (`:314`) surmonté d'une seconde ligne « Project: X » en `h6` (`:329-331`), et le nom du produit tient dans `dashboard.buckets` au lieu d'un titre d'écran.
  - Dialog de détail de **210 lignes** (`:499-709`) contenant 4 sections, 3 modes (lecture/édition/alias), sans séparation en composants.
  - `<input type="checkbox">` et `<label>` HTML natifs (`:468-471`) au lieu de `Checkbox`/`FormControlLabel` → non thématisés, non accessibles au clavier de façon consistante.
  - Octets bruts affichés sans unité (`:537`) et `getBestUnit` (`:102-112`) duplique `formatBytes` de `ClusterLayout.tsx:56-63`.
  - Dates en `toLocaleString()` du navigateur (`:389`), pas de la langue i18n → incohérence FR/EN.

#### E5 — S3 Browser — `pages/dashboard/S3Browser.tsx` (751 l.) + `components/{BucketsList,ObjectsList,S3Breadcrumbs}.tsx` (97/290/59 l.)
- **Rôle** : navigation objet par objet, upload/upload répertoire, création de dossier, aperçu, téléchargement, suppression unitaire/groupée.
- **États** :
  - session S3 absente : texte d'aide sans CTA (`S3Browser.tsx:630-639`).
  - liste buckets : `BucketsList.tsx` — spinner en ligne (`:64-70`), vide en ligne (`:71-77`).
  - objets : `ObjectsList.tsx` — spinner en ligne (`:222-228`), vide en ligne (`:229-235`), pagination « Load more » (`:276-284`), progression d'upload (`:194-202`).
  - erreur : **`Chip color="error"` collé en bas de page** (`S3Browser.tsx:694-698`), sans contexte ni action.
- **MUI** : 30+ composants, `XHR` brut pour l'upload (`:320-360`) et pour la sauvegarde du preview (`PreviewDialog.tsx:125-158`).
- **Dette visible** :
  - **10 `console.log`** oubliés (`:185,196,217,225,228,234,367,368,371,372`).
  - **87 lignes de `switch` MIME → langage** (`:481-567`) dupliquées **à l'identique trois fois** (`PreviewDialog.tsx:178-261`, `PreviewPage.tsx:191-274`) puis **encore** pour l'inverse extension → langage (`PreviewDialog.tsx:263-366`, `PreviewPage.tsx:276-379`).
  - Codes MIME codés à la main au lieu d'un utilitaire partagé ; pas de `contentType` renvoyé par l'API utilisé en priorité.
  - Barre d'outils de `ObjectsList` : `TextField placeholder="New folder"` (`:144`) + bouton icône sans libellé (`:149-156`) collés à gauche, boutons d'action à droite, sans hiérarchie ; menu d'upload avec libellés anglais en dur (`:186-187`) ; en-têtes de colonnes `Key/Size/LastModified/Actions` en dur (`:215-218`).
  - Quota : messages d'avertissement anglais en dur (`:377,393`) et dialogue `Quota Warning/Cancel/Continue Upload` (`:721,726,728`) non i18n ; logique de quota dupliquée deux fois (`:369-401`).
  - **`CopyObjectDialog` branché sur un no-op** : `onCopy={() => { }}` (`:714`) et `copyDialog.open` jamais mis à `true` (`:111`) → dialogue mort embarqué, fonctionnalité affichée mais inexistante.
  - Pas de tri, pas de filtre, pas de recherche, pas de sélection multiple sur des buckets autres que les objets ; le compteur d'objets sélectionnés n'est affiché nulle part.
  - `Taille` brute non formatée (`ObjectsList.tsx:259`).

#### E6 — Cluster (6 onglets) — `pages/dashboard/ClusterLayout.tsx` (822 l.)
- **Rôle** : statut cluster, santé, nœuds, partitions, édition/applications/revert de la disposition, historique, skip dead nodes, plus les onglets `S3 Browser` et `Logs` réutilisant d'autres écrans (`:775,784`).
- **Navigation interne** : onglet actif lu depuis le **query param** `?tab=` (`:119`) — donc unique onglet sans composant `Tabs`, sans URL dédiée par onglet, avec un titre fabriqué par intermédiation i18n (`:286`).
- **États** : `refreshAll` agrège 4 appels en `Promise.allSettled` (`:122-143`) et **jette les erreurs partielles non détaillées** : seul le premier `rejected` produit un message générique (`:131-136`) ; la page n'a **aucun état de chargement** (le spinner est remplacé par le libellé du bouton « Loading… » `:296`), **aucun état vide** ; erreurs via `Snackbar` (`:810-819`).
- **Dette visible** :
  - 51 blocs `sx` + 5 tableaux + un graphique recharts : **le plus gros fichier fonctionnel du dépôt** (51 552 octets).
  - Couleurs recharts codées en dur (`:357-366`) dont le contraste des axes `#94a3b8` sur fond clair.
  - En-têtes de tableaux en anglais en dur (`:404-412`, `:455-458`, `:617`, `:686`, `:730-731`).
  - Chaînes utilisateur en dur (`:597` « Node ID required », `:632` « Yes »/« No », `:635` « Remove »).
  - « Capacité (Bytes) », « Tags (virgule) », « Node ID » en saisie libre : l'utilisateur doit connaître les octets (`:570-576`) et la syntaxe des tags (`:580-585`).
  - Dialogue de confirmation d'application (`:792-808`) sans résumé du diff à appliquer ; bouton `color="success"` pour une action à risque (`:649`, `:804`).
  - 5 tableaux sans tri/filtre ni densité cohérente.

#### E7 — Applications Keys — `pages/dashboard/ApplicationsKeys.tsx` (580 l.)
- **Rôle** : clés S3 (création, import, édition, suppression) + **impersonation** (stockage de la clé en `sessionStorage`/`localStorage` puis redirection dure).
- **États** : erreur en `Typography color="error"` en tête (`:257-261`), chargement en `Text` « Loading... » dans la modale (`:505`), vide en ligne (`:308-314`).
- **Dette visible** :
  - `window.location.href = '/cluster?tab=S3%20Browser'` (`:193`, `:249`) → **rechargement complet de l'application** au lieu d'une navigation `react-router`.
  - **Bug visuel** : `style={{ color: "error.main" }}` (`:330`) — `"error.main"` n'est pas une couleur CSS, l'action de suppression n'est donc jamais rouge.
  - `<input type="checkbox">` natifs (`:354-364`, `:489-500`) ; `InputLabelProps={{ shrink: true }}` (`:352`, `:486`) → API dépréciée **[dépend de la migration MUI 9]**.
  - Libellés non i18n : « Impersonate » (`:327`), « Impersonate key (session) » / « (local) » (`:463,466`).
  - Le secret est affiché **en clair dans la modale de détail** via `<code>` (`:447`) sans ré-authentification ni compte à rebours, et le dialogue « clé créée » (`:535-564`) n'a pas de garde-fou « copié avant fermeture ».
  - Confusion entre « clé » et « utilisateur » : `dashboard.apps` = « Clés d'application » (`locales/fr/translation.json:29`) mais la sidebar groupe `Users` sous `Shield` (`Sidebar.tsx:45`).

#### E8 — Admin Tokens — `pages/dashboard/AdminTokens.tsx` (387 l.)
- **Rôle** : CRUD des jetons d'administration Garage.
- **États** : chargement `<div><CircularProgress/></div>` (`:204-208`), **erreur en `<div style={{color:"red"}}>`** (`:209`), vide en ligne (`:226-232`), snackbars succès/erreur (`:380-384`).
- **Dette visible** :
  - **Seul écran entièrement en HTML brut** : `<div>`, `<h3>`, `<p>` (`:191-202`), `<div style={{color:"red"}}>` (`:209`), `<div style={{whiteSpace:"pre-wrap"}}>` avec `<br/>` pour la fiche détail (`:317-327`). Aucun `PageHeader`, titre en `h3` hors échelle typographique.
  - Tableau sans `size="small"` ni `stickyHeader` (`:213`) contrairement à `Buckets.tsx:335`/`ObjectsList.tsx:205`.
  - Colonne `#` en dur (`:216`) ; « From config » (`:236-239`) comme valeur de repli sur trois colonnes, sémantique opaque.
  - Le formulaire accepte la portée (`scope`) en texte libre séparé par des virgules (`:281-287`) sans autocomplétion ni validation.
  - `MUI Checkbox` correctement utilisé ici (`:288-291`) — incohérence avec `Buckets`/`ApplicationsKeys`.

#### E9 — Nodes — `pages/dashboard/Nodes.tsx` (190 l.)
- **Rôle** : infos statiques + statistiques par nœud (appels multi-nœuds).
- **États** : chargement `<div>` + spinner + texte (`:88-93`), erreur `Alert` (`:95`), vide `Alert severity="info"` (`:99-100`) — **le seul écran avec un vrai état vide**.
- **Dette visible** : racine `<div>` brute (`:82`), titre `h5` (échelle différente des autres écrans), statistiques affichées en `<pre>{n.stats?.freeform}</pre>` (`:174`) — **JSON brut non formaté** ; `TableHead` avec `position: sticky` en `sx` (`:104`) alors que `stickyHeader` existe ; en-tête de table en `sx` sans tri.

#### E10 — Blocks — `pages/dashboard/Blocks.tsx` (257 l.)
- **Rôle** : erreurs de blocs par nœud, purge, resynchronisation.
- **États** : chargement (`:122-127`), erreur `Alert` (`:129`), vide `Alert info` (`:133-134`), confirmations en dialogues dédiés (`:225-254`).
- **Dette visible** : racine `<div>` (`:116`), titre `h5` (`:117`), détail en `JSON.stringify` dans `<pre>` (`:217`), actions « Détails » et « Actualiser » **répétées sur chaque ligne** (`:160-165`) au lieu d'un rafraîchissement global, colonne `Actions` en dur (`:143`).

#### E11 — Workers — `pages/dashboard/Workers.tsx` (181 l.)
- **Rôle** : liste des workers par nœud.
- **États** : identiques à Blocks (`:88-95`, `:99-100`), détail JSON dans un `<Dialog>` (`:170-178`).
- **Dette visible** : même duplication `div`/`h5`/`pre` que Blocks (`:82,83,173`) ; `w.freeform.join("\n")` dans une cellule (`:148`) sans mise en forme ; aucun tri/filtre.

#### E12 — User Manager — `pages/dashboard/UserManager.tsx` (319 l.)
- **Rôle** : CRUD des utilisateurs de l'application (`/auth/users`).
- **États** : **spinner plein écran** (`:161-167`), erreur `Alert` (`:184-188`), **aucun empty state** (tableau vide silencieux `:200-249`).
- **Dette visible** :
  - Suppression via `window.confirm` (`:148`) alors que `ConfirmDialog` existe.
  - Tableau **sans** `size="small"`, sans `stickyHeader`, lignes sans `hover` (`:191,202`) → densité et affordance incohérentes avec les 9 autres tableaux.
  - `Box sx={{ p: 3 }}` (`:170`) : padding de page différent de `ClusterLayout` (`p: 3` aussi mais avec bandeau), de `Nodes` (aucun padding), de `S3Browser` (`p: 2`).
  - Protection « root » dispersée (`:143-146`, `:206-212`, `:226`, `:270`, `:297`).
  - Colonne de date en `toLocaleDateString()` navigateur (`:223`), sans heure ni fuseau.

#### E13 — Preview (page pleine) — `pages/dashboard/PreviewPage.tsx` (489 l.)
- **Rôle** : prévisualisation/édition plein écran d'un objet (image, vidéo, texte + Monaco).
- **Dette visible** :
  - **Écran orphelin** : rien n'écrit les clés `kexamanager:preview:*` (seul `clearPreviewSession` est appelé, `:386`), et aucune navigation vers `/preview` n'existe (`App.tsx:163` est la seule occurrence de la route). `setPreviewSession` (`utils/previewSession.ts:1-10`) n'est appelé nulle part.
  - Retour arrière cassé : `window.location.hash = 's3'` (`:386`) alors que l'application utilise `BrowserRouter` (pas de routage par hash) → le clic ne change pas de page.
  - Thème **codé en dur en sombre** (`bgcolor: '#121212'` `:384`, `#1e1e1e`/`#f8f8f2` `:449-450`) → écran noir en thème clair.
  - ~100 lignes de mapping langage/extension (`:191-379`) dupliquées.
  - `height: '100vh'` (`:384`) et `calc(100vh - 120px)` (`:426,445`) → incorrect sur mobile.

#### E14 — Preview (modale) — `pages/dashboard/components/PreviewDialog.tsx` (469 l.)
- **Rôle** : même fonction dans une `Dialog maxWidth="xl"`, utilisée par `S3Browser.tsx:14,742-748` — c'est l'implémentation **vivante**.
- **Dette visible** : 11 `console.log` (`:50,51,58,59,60,68,73,74,151,159,166`), fond `#121212` en dur (`:385`), `pre` codé en dur (`:419-433`), pas de bouton « télécharger en un clic » hors nouvel onglet (`:462`), `downloading` du fichier binaire non géré.

### 1.3 Composants partagés : vivants vs morts

Vérification par recherche des imports réels (`grep` sur les `from "…/NomFichier"`) :

| Fichier | Lignes | Importé par | Verdict |
|---|---|---|---|
| `components/ConfirmDialog.tsx` | 47 | `S3Browser.tsx:13,732` | **vivant (1 seul usage)** |
| `components/dashboard/StatCard.tsx` | 53 | `ClusterLayout.tsx:7,308` | **vivant (1 seul usage)** |
| `pages/dashboard/components/*` | 1 036 | `S3Browser.tsx:12,14` | **vivants** |
| `components/Navigation.tsx` | **302** | **personne** | **mort** (contient la seule navigation mobile + le seul sélecteur de projet) |
| `components/layout/Header.tsx` | **58** | **personne** | **mort** |
| `components/PageHeader.tsx` | **55** | seulement le barrel | **mort** |
| `components/LoadingState.tsx` | **54** | seulement le barrel | **mort** (supporte le mode `skeleton` :25-33) |
| `components/ErrorState.tsx` | **84** | seulement le barrel | **mort** (variante centrée avec `onRetry` :26-66) |
| `components/ResponsiveLayout.tsx` | **52** | seulement le barrel | **mort** |
| `components/S3ConfigSelector.tsx` | **90** | **personne** | **mort** |
| `components/index.ts` | 4 | **personne** | **mort** (barrel jamais consommé) |
| `components/dashboard/SystemHealth.tsx` | **58** | **personne** | **mort** |
| `components/dashboard/TrafficChart.tsx` | **63** | **personne** | **mort** |
| `components/dashboard/RecentDeployments.tsx` | **0** | **personne** | **mort (fichier vide)** |
| `pages/dashboard/components/MetricPaper.tsx` | **140** | **personne** | **mort** (buggé en clair : `rgba(127,0,255,.15)` :39, fond icône `#ffffff`/`#000000` :75-87) |
| `pages/dashboard/components/RawCollapse.tsx` | **52** | **personne** | **mort** |
| `pages/dashboard/components/CreateFileDialog.tsx` | **87** | seulement le barrel | **mort** |
| `pages/AdminPage.tsx` | **12** | **personne** | **mort** (`<div>`+`<h2>`+styles inline) |
| `pages/UserPage.tsx` | **12** | **personne** | **mort** (`<div>`+`<h2>`+styles inline) |

**Total : ≈ 1 100 lignes mortes sur 8 154 (13,5 %)**, dont un « squelette de design system » (PageHeader + LoadingState + ErrorState + ResponsiveLayout) prêt à l'emploi mais jamais branché.

### 1.4 Thème et contexte

| Élément | Constat | Ligne |
|---|---|---|
| Palette | Palette « Sovrabase » codée dans `theme/index.ts` (fond `#080b13`, primaire `#0EA5E9`) | `theme/index.ts:4-15` |
| Typographie | Inter déclarée mais **jamais chargée** (aucun `@fontsource`, aucun `<link>` dans `index.html:1-29`) → repli système | `theme/index.ts:19`, `index.html` |
| `h6` | Défini à **0,875 rem MAJUSCULES** (`textTransform: "uppercase"`) et utilisé comme titre de page sur 5 écrans | `theme/index.ts:25` vs `Buckets.tsx:314`, `S3Browser.tsx:644`, `ApplicationsKeys.tsx:272`, `ClusterLayout.tsx:284`, `ActivityLogs.tsx:77` |
| Radius | `shape.borderRadius: 8` mais `MuiButton` force `6px` | `theme/index.ts:31,56` |
| Composants restylés | 5 seulement (`CssBaseline`, `Button`, `Paper`, `Card`) → tables, champs, dialogues, chips restent aux valeurs MUI par défaut | `theme/index.ts:33-87` |
| Thème clair | Ne définit ni `success`/`warning`/`error` ni `divider` ; de nombreux fonds codés en dur pour le sombre restent visibles | `theme/index.ts:117-131` |
| Bascule | Deux thèmes créés statiquement + `useState` local, **pas de theme à variables CSS** ; le contexte ne peut pas être lu hors provider (d'où le login hors thème) | `SettingsContext.tsx:36-41,72`, `App.tsx:108-111` |
| Densité | Aucune notion de densité : `p: 2`, `p: 3`, `mb: 2`, `mb: 4`, `margin="dense"`, `margin="normal"`, `size="small"` cohabitent sans règle | `Projects.tsx:213` (`p:3`), `UserManager.tsx:170` (`p:3`), `S3Browser.tsx:643` (`p:2`), `Nodes.tsx:82`/`Blocks.tsx:116`/`Workers.tsx:82` (aucun padding), `Buckets.tsx:414` (`margin="dense"`), `UserManager.tsx:268` (`margin="normal"`), `Buckets.tsx:335` vs `UserManager.tsx:191` (`size="small"` absent) |

---

## 2. Diagnostic des problèmes UX/UI, hiérarchisé

Impact = effet réel sur l'utilisateur (administrateur d'infrastructure), pas une généralité.

### P0 — Bloquants (cassent l'usage ou mentent à l'utilisateur)

| # | Problème | Preuve | Impact utilisateur |
|---|---|---|---|
| **P0-1** | **Le repli de la sidebar plante le rendu** : `useSettings()` est appelé de façon conditionnelle et dans un callback → nombre de hooks variable entre les deux états. | `Sidebar.tsx:192` (`useSettings()` dans `{!sidebarCollapsed && …}`), `Sidebar.tsx:193` (dans `onChange`), confirmé par ESLint : `192:36 react-hooks/rules-of-hooks` + `193:46 react-hooks/rules-of-hooks` | Clic sur le bouton de repli (`Sidebar.tsx:208`) → erreur React, arbre démonté. Perte de la page en cours, perte de confiance immédiate. |
| **P0-2** | **Aucun sélecteur de projet global** : changer de projet exige de revenir à `/projects`. | Le seul `onSelectProject` est câblé sur `Projects` (`App.tsx:121-127`) ; la sidebar n'affiche pas le projet (`Sidebar.tsx:21-46`, `:197-228`) ; le sélecteur n'existe que dans le composant mort `Navigation.tsx:201-216` ; 8 écrans sont pourtant projet-dépendants (`adminClient.ts:126-149`) | Un admin qui compare deux environnements fait un aller-retour `/cluster` → `/projects` → « Open Project » → retour à l'écran voulu à chaque changement de contexte. Risque réel d'agir sur le mauvais projet (6 écrans n'affichent jamais quel projet est actif : `Nodes`, `Blocks`, `Workers`, `AdminTokens`, `ApplicationsKeys`, `UserManager`). |
| **P0-3** | **Échecs silencieux sur les opérations destructives** : 7 `catch` vides dans l'écran Buckets (plus `fetchBuckets`). | `Buckets.tsx:148-152, 162-164, 174-178, 195-197, 223-225, 258-262, 274-276, 295-297` | L'utilisateur supprime/édite un bucket et **rien ne se passe visuellement** ; s'il ne recharge pas la page, il croit l'opération réussie. Sur des quotas et des alias de stockage, c'est un risque de configuration fantôme. |
| **P0-4** | **Le login est rendu hors du thème de l'application** (thème MUI clair par défaut, Roboto, bleu MUI) | `App.tsx:108` (retour anticipé) vs `App.tsx:110-111` (`SettingsProvider` = porteur du `ThemeProvider`, `SettingsContext.tsx:72`) ; `Login.tsx:48` utilise `background.default` | Rupture visuelle totale dès le premier écran, bascule clair→sombre brutale après connexion, impossibilité de choisir la langue avant de se connecter. |

### P1 — Majeurs (font perdre du temps ou induisent en erreur à chaque session)

| # | Problème | Preuve | Impact utilisateur |
|---|---|---|---|
| **P1-1** | **Aucune barre supérieure, aucun titre de page, aucun fil d'Ariane** : seule la sidebar indique où l'on est. | `DashboardLayout.tsx:13-19` n'a que `Sidebar` + `Outlet` ; `components/Header.tsx` (mort) contenait un titre ; pas de `Breadcrumbs` hors S3 (`S3Breadcrumbs.tsx:16`) | Sur 11 écrans, l'utilisateur n'a pas de repère « Projet / Écran / Ressource » ni de zone d'actions de page. Les actions principales flottent dans le contenu (parfois à droite, parfois à gauche : `ObjectsList.tsx:132-192`). |
| **P1-2** | **Aucun tri, filtre, recherche ni pagination** sur 16 tableaux. | 16 `<Table `, 0 occurrence de `TableSortLabel`, 0 champ de recherche de liste ; seul `ObjectsList.tsx:276-284` propose « Load more » | Sur un cluster réel (des centaines de buckets, des milliers d'objets, des milliers de logs), trouver « le bucket × » ou « la clé × » se fait à l'œil. `ActivityLogs.tsx:114-131` charge tout sans pagination ni filtre par action/statut. |
| **P1-3** | **États vides et états d'erreur non actionnables et incohérents (5 styles différents)**. | Vide = texte nu dans une cellule : `Buckets.tsx:352-358`, `ObjectsList.tsx:229-235`, `BucketsList.tsx:71-77`, `AdminTokens.tsx:226-232`, `ActivityLogs.tsx:107-112` ; erreurs : `Chip` (`S3Browser.tsx:694-698`, `ActivityLogs.tsx:83-87`), `Typography color="error"` (`ApplicationsKeys.tsx:257-261`), `div style color:red` (`AdminTokens.tsx:209`), `Alert` (`Nodes.tsx:95`, `Blocks.tsx:129`, `Workers.tsx:95`), `Snackbar` (`ClusterLayout.tsx:810-819`) | Un utilisateur découvre un stockage « vide » sans savoir s'il l'est vraiment, et reçoit une erreur sans bouton « Réessayer », sans contexte (numéro de requête, projet concerné). |
| **P1-4** | **Chargement par spinner plein écran qui détruit le layout**. | `Projects.tsx:177-183`, `UserManager.tsx:161-167` (retour anticipé) ; `Buckets.tsx:345-351` et `ObjectsList.tsx:222-228` (spinner dans une ligne) ; **0 `Skeleton` affiché** alors que `LoadingState.tsx:25-33` sait le faire | Flash de page blanche + saut de layout à chaque rafraîchissement ; perte du contexte visuel (filtres, sélection) pendant le chargement. |
| **P1-5** | **Aucun support mobile/tablette** alors que la seule navigation responsive est dans un composant mort. | `Sidebar.tsx:69` (largeur fixe 260 px, aucun `Drawer`, aucun `useMediaQuery` — seul usage du dépôt : `Buckets.tsx:100`) vs `Navigation.tsx:98-178` (Drawer mobile) et `:49-96` (AppBar) morts | Sur tablette ou en fenêtre réduite, la sidebar mange 60-70 % de la largeur. Inutilisable en astreinte depuis un mobile. |
| **P1-6** | **Fonctionnalités présentées mais mortes ou cassées.** | « Copy object » branché sur `() => { }` (`S3Browser.tsx:714`, `:111`) ; `CreateFileDialog` jamais utilisé ; `PreviewPage` atteignable seulement par URL directe et son bouton retour ne navigue pas (`PreviewPage.tsx:386`, `BrowserRouter`) ; colonne « Delete » de `ApplicationsKeys` jamais rouge (`:330`, `"error.main"` invalide en CSS) | L'utilisateur clique « Copier » et rien ne se passe, sans message. Le bouton de retour de l'aperçu plein écran ne fait rien. |
| **P1-7** | **Fuite de contexte dans les dialogues et actions de masse** : aucune confirmation ne nomme la ressource ni le projet ; les confirmations natives subsistent. | `window.confirm` non traduit (`Projects.tsx:166`), non thématisé (`UserManager.tsx:148`) ; `Buckets.tsx:726-736` confirme la suppression d'un bucket sans afficher son identifiant ; `S3Browser.tsx:424-452` supprime N objets sans lister les clés | Un admin ne peut pas vérifier ce qu'il détruit au moment où il le détruit. |
| **P1-8** | **Densité, typographie et padding incohérents d'un écran à l'autre.** | Titres de page : `h4` (`Projects.tsx:215`, `UserManager.tsx:172`), `h5` (`Nodes.tsx:83`, `Blocks.tsx:117`, `Workers.tsx:83`), `h6` qui rend en majuscules 14 px (`Buckets.tsx:314`, `S3Browser.tsx:644`, `ApplicationsKeys.tsx:272`, `ClusterLayout.tsx:284`), `h3` HTML brut (`AdminTokens.tsx:194`) ; tables `size="small"` (`Buckets.tsx:335`, `ObjectsList.tsx:205`, `AdminTokens.tsx:213`, `ClusterLayout.tsx:401`) vs densité par défaut (`UserManager.tsx:191`, `Blocks.tsx:137`, `Workers.tsx:103`) ; racine `p: 3` (`Projects.tsx:213`) vs `p: 2` (`S3Browser.tsx:643`) vs **aucun padding** (`Nodes.tsx:82`, `Blocks.tsx:116`, `Workers.tsx:82`) | L'application paraît être 4 applications différentes. Le contenu colle aux bords sur Nodes/Blocks/Workers, et les titres sont plus petits que le corps de texte ailleurs. |

### P2 — Modérés (dégradent la perception et la maintenabilité visible)

| # | Problème | Preuve | Impact utilisateur |
|---|---|---|---|
| **P2-1** | **i18n incomplet** : 21 clés identiques FR≡EN, 5 clés FR absentes en EN, 2 en EN absentes en FR, en-têtes de tables et messages en dur. | Mesure §0.2 ; en-têtes en dur `ClusterLayout.tsx:404-412,455-458,617,686,730-731`, `ObjectsList.tsx:215-218`, `ActivityLogs.tsx:93-96`, `AdminTokens.tsx:216` ; messages en dur `Projects.tsx:80,134,141,159,166,197,200,205,215,269,275,295`, `S3Browser.tsx:377,393,721,726,728`, `ObjectsList.tsx:140,144,152,171,186,187`, `ClusterLayout.tsx:597,632,635`, `ApplicationsKeys.tsx:327,463,466`, `Buckets.tsx:330` | Un utilisateur anglophone voit des écrans à moitié traduits ; un francophone voit « Impersonate key (local) », « Quota Warning », « Continue Upload ». `dashboard.cluster_update_success` (FR) n'existe pas en EN → message en français dans l'UI anglaise. |
| **P2-2** | **Dates, tailles et nombres non localisés / non formatés**. | `toLocaleString()` navigateur : `Buckets.tsx:389`, `ObjectsList.tsx:260`, `ApplicationsKeys.tsx:319`, `AdminTokens.tsx:237`, `ActivityLogs.tsx:116` ; octets bruts : `Buckets.tsx:537`, `ObjectsList.tsx:259` ; deux implémentations concurrentes : `ClusterLayout.tsx:56-63` et `Buckets.tsx:102-112` | Un utilisateur FR avec navigateur EN lit des dates US et des tailles en octets (`1048576`) au lieu de `1 Mio`. |
| **P2-3** | **Codes dupliqués qui garantissent des divergences futures**. | Mapping MIME→langage ×3 (`S3Browser.tsx:481-567`, `PreviewDialog.tsx:178-261`, `PreviewPage.tsx:191-274`) ; extension→langage ×2 (`PreviewDialog.tsx:263-366`, `PreviewPage.tsx:276-379`) ; logique quota ×2 (`S3Browser.tsx:369-401`) ; `formatBytes` ×2 (P2-2) ; Snackbar recréé dans 2 écrans (`ClusterLayout.tsx:810-819`, `AdminTokens.tsx:380-384`) | Chaque correction doit être appliquée 3 fois ; toute divergence produit un comportement différent pour le même fichier. |
| **P2-4** | **Thème clair dégradé par des couleurs codées en dur pour le sombre**. | `PreviewDialog.tsx:385,426-427,430`, `PreviewPage.tsx:384,449-450,453`, `Projects.tsx:252` (`rgba(255,255,255,.05)`), `StatCard.tsx:20` (`rgba(255,255,255,.03)`), `MetricPaper.tsx:39,75-87`, `ClusterLayout.tsx:357-366` (axes recharts `#94a3b8`) | Texte blanc sur fond blanc dans l'aperçu (invisible), badges et puces d'icônes invisibles, graphique illisible. |
| **P2-5** | **Accessibilité insuffisante**. | 4 `aria-label` pour ~25 `IconButton` icône-seule ; exemples sans libellé : `Sidebar.tsx:208,224`, `ObjectsList.tsx:149-156,243,269`, `ApplicationsKeys.tsx:329`, `Buckets.tsx:261` ; `Tooltip title=""` quand déplié (`Sidebar.tsx:101,135`) ; `<label><input type="checkbox"/></label>` sans `id` (`Buckets.tsx:468-471`, `ApplicationsKeys.tsx:354-364,489-500`) ; `Tooltip` non lié (`AdminTokens.tsx:244-264`) | Navigation clavier et lecteur d'écran non fiables : impossible de savoir ce que fait un bouton icône. |
| **P2-6** | **Chargement/erreur du contexte projet non communiqués**. | Échec de `loadProjects` seulement `console.error` (`App.tsx:54-56`) ; projet absent du `localStorage` → nettoyage silencieux (`App.tsx:79-87`) ; `/buckets` sans projet affiche « No project selected » (`Buckets.tsx:330`) au lieu de rediriger | L'utilisateur peut voir un écran vide sans comprendre que son projet a été désélectionné ou que l'API a échoué. |
| **P2-7** | **Onglets du cluster par `?tab=` sans composant `Tabs`**. | `ClusterLayout.tsx:119` lit `searchParams` ; navigation uniquement via la sidebar (`Sidebar.tsx:36-40`, `:155-178`) ; titre fabriqué par interpolation (`ClusterLayout.tsx:286`) ; duplication d'entrée : « Logs » existe en item de premier niveau (`Sidebar.tsx:24`) et le même onglet est rendu deux fois (`ClusterLayout.tsx:784`) | Pas d'onglets visibles dans la page, donc aucun moyen de comprendre qu'il existe 6 vues ni de basculer sans la sidebar (qui masque tout le sous-menu sur mobile et en mode replié). |
| **P2-8** | **Détails techniques bruts présentés comme interface**. | `Nodes.tsx:174` (`<pre>` de `freeform`), `Blocks.tsx:217` et `Workers.tsx:173` (JSON brut), `ClusterLayout.tsx:435,722` (bouton « Copier le JSON »), logique `isS3Only` qui vide des routes (`App.tsx:130-162`) | L'admin doit lire du JSON non structuré pour diagnostiquer ; conforme à l'existant mais pas à une console moderne. |

### P3 — Dette visible / hygiène

| # | Problème | Preuve |
|---|---|---|
| P3-1 | `console.log` en production (21) | `S3Browser.tsx` ×10, `PreviewDialog.tsx` ×11 |
| P3-2 | Code mort ≈1 100 lignes, 19 fichiers | §1.3 |
| P3-3 | Fichier vide versionné | `components/dashboard/RecentDeployments.tsx` (0 octet) |
| P3-4 | Deux bibliothèques d'icônes | `lucide-react` (`Sidebar.tsx:2`, `ClusterLayout.tsx:5`, `StatCard.tsx:2`) vs `@mui/icons-material` (16 fichiers) |
| P3-5 | 303 `sx={{}}` + 23 `style={{}}` inline, dont `fontSize: "0.75rem"` / `minWidth: 120` en dur pour le responsive (`Buckets.tsx:369,386`) | `Buckets.tsx:364-389`, `ObjectsList.tsx:398` |
| P3-6 | `useSettings()` appelé 6 fois par rendu de la sidebar au lieu de 1 déstructuration | `Sidebar.tsx:16,192,193,202,203,204` |
| P3-7 | `catch (err: any)` + `any` implicite (ESLint) | `SystemHealth.tsx:21`, `Sidebar.tsx:58` |
| P3-8 | `lng: "fr"` en dur dans i18n + fallback EN, langue non détectée du navigateur | `i18n.ts:12-13`, `SettingsContext.tsx:33` |

---

## 3. Plan de modernisation par tiers

**Ordre imposé : le meilleur rapport impact/effort d'abord.** Chaque item est autonome, testable, et peut être commité séparément.

### Vue d'ensemble

| Tier | Contenu | Effort total estimé | Impact cumulé |
|---|---|---|---|
| **T0 — Gains rapides** | 14 items, chacun < 1 h | **≈ 8 h** (1 journée) | Supprime les P0 et la moitié des P1 perçus ; l'application redevient « une seule » application |
| **T1 — Socle design system** | 9 chantiers, chacun 0,5–2 j | **≈ 9 jours** (2 semaines à temps partiel) | Supprime P1-2, P1-3, P1-4, P2-1 à P2-5 de façon structurelle |
| **T2 — Refontes lourdes** | 6 chantiers, 1 j à 1 sem. chacun | **≈ 3 semaines** | Navigation, dashboards, flux d'upload, écran Cluster |

---

### TIER 0 — Gains rapides (< 1 h chacun, fort impact visuel)

> **Règle d'exécution** : traiter T0-1 à T0-5 avant tout le reste. Ils sont les seuls à corriger des bugs bloquants.

| # | Item | Fichiers (à toucher) | Ce qui change | Effort | Impact | Critère de succès vérifiable |
|---|---|---|---|---|---|---|
| **T0-1** | Corriger la violation des Rules of Hooks de la sidebar | `components/layout/Sidebar.tsx` | Destructurer `useSettings()` une seule fois en haut du composant (`const { lang, setLang, themeMode, toggleTheme, sidebarCollapsed, toggleSidebar } = useSettings()`) et remplacer les 6 appels `:16, :192, :193, :202, :203, :204`. Le `Select` de langue reste rendu conditionnellement mais **sans** appel de hook à l'intérieur. | 20 min | **P0** | `npx eslint src/components/layout/Sidebar.tsx` → 0 erreur `react-hooks/rules-of-hooks` ; cliquer sur le bouton de repli (`:208`) ne produit plus aucune erreur console et la page reste affichée. |
| **T0-2** | Sortir le login du trou noir de thème : monter `SettingsProvider` au-dessus du retour anticipé | `App.tsx` (déplacer `SettingsProvider` avant `if (!authed)`, ou mieux : envelopper dans `main.tsx:3-4`) | `Login.tsx` hérite du thème sombre/clair, de la palette et la typographie de l'application ; le sélecteur de langue devient possible sur le login. | 25 min | **P0** | Connexion : `getComputedStyle(document.body).backgroundColor` = `#080b13` (sombre) et non `rgb(255,255,255)` ; le bouton primaire du login a `background-color: rgb(14,165,233)`. |
| **T0-3** | Remplacer les deux `window.confirm` par `ConfirmDialog` | `Projects.tsx:166`, `UserManager.tsx:148` (`components/ConfirmDialog.tsx` existe déjà) | Confirmation thématisée, traduite, avec identifiant de la ressource dans le message. | 30 min / écran | Majeur | `grep -rn "window.confirm\|[^.]confirm(" src --include=*.tsx` dans les pages → 0 résultat ; la suppression d'un projet/utilisateur ouvre une `Dialog` MUI contenant le nom de la ressource. |
| **T0-4** | Rendre visibles les échecs silencieux de `Buckets.tsx` | `pages/dashboard/Buckets.tsx:148-152,162-164,174-178,195-197,223-225,258-262,274-276,295-297` | Ajouter un état `error` local et l'afficher via un `Alert severity="error"` en tête ; supprimer les `catch {}` vides (a minima `catch (e) { setError(...) }`). | 40 min | **P0** | Couper l'API (`docker stop` du conteneur 8080) puis supprimer un bucket : un message d'erreur explicite apparaît (avant : aucun retour). |
| **T0-5** | Distinguer « liste vide » et « échec de chargement » sur les tableaux | `Buckets.tsx:155-167,352-358`, `BucketsList.tsx:64-77`, `ObjectsList.tsx:229-235`, `AdminTokens.tsx:226-232`, `ActivityLogs.tsx:107-112` | Ajouter un booléen `error` et afficher « Impossible de charger … » + bouton « Réessayer » au lieu de « Aucun bucket ». | 45 min | **P0/P1** | Avec l'API en panne, la ligne affichée contient le mot « Réessayer » ; avec l'API saine et 0 bucket, la ligne affiche l'empty state. |
| **T0-6** | Corriger la couleur de suppression de `ApplicationsKeys` | `pages/dashboard/ApplicationsKeys.tsx:329-331` | `style={{color:"error.main"}}` (CSS invalide) → `IconButton color="error"` avec `DeleteIcon`, comme partout ailleurs. | 10 min | Majeur | Le bouton de suppression de la ligne est rouge (`color` calculé = `rgb(239,68,68)`), et `grep -rn '"error.main"' src` → 0 résultat dans un attribut `style`. |
| **T0-7** | Charger la police Inter (le thème la déclare, rien ne la fournit) | `front/package.json` + `main.tsx` | `npm i @fontsource-variable/inter` puis `import "@fontsource-variable/inter"` dans `main.tsx` (auto-hébergé, aucune requête externe — cohérent avec un outil d'infra on-prem). | 20 min | Fort (visuel) | `document.fonts.check('16px Inter') === true` ; l'onglet Réseau ne contient aucune requête vers `fonts.googleapis.com`. |
| **T0-8** | Corriger les statuts de densité/size sur les tableaux qui n'en ont pas | `UserManager.tsx:191`, `AdminTokens.tsx:213`, `Blocks.tsx:137`, `Workers.tsx:103`, `Nodes.tsx:103`, `ClusterLayout.tsx:401` | Ajouter `size="small" stickyHeader` + `hover` sur les lignes (`UserManager.tsx:202`). | 30 min | Moyen | Sur les 11 écrans, toutes les tables ont `size="small"` et `stickyHeader` : `grep -c 'stickyHeader'` = nombre de tables affichées. |
| **T0-9** | Supprimer les `console.log` de production | `S3Browser.tsx:185,196,217,225,228,234,367,368,371,372`, `PreviewDialog.tsx:50,51,58,59,60,68,73,74,151,159,166` | Suppression sèche (garder les `console.error` du module `adminClient`). | 20 min | Moyen (perf/propreté) | `grep -rc "console.log" src --include=*.tsx` → 0. |
| **T0-10** | Titres de page : passer de 4 variantes à une seule | `Projects.tsx:215`, `UserManager.tsx:172`, `Nodes.tsx:83`, `Blocks.tsx:117`, `Workers.tsx:83`, `Buckets.tsx:314`, `S3Browser.tsx:644`, `ApplicationsKeys.tsx:272`, `ClusterLayout.tsx:284`, `AdminTokens.tsx:194` | Utiliser systématiquement le composant `PageHeader` (déjà écrit dans `components/PageHeader.tsx`) avec `title` + `subtitle` + badge projet + `action` (bouton principal de page). | 45 min | **Fort visuel** | Les 10 écrans affichent `PageHeader` ; `grep -rn 'variant="h5"\|<h3>' src/pages` → 0 ; le titre de page est de la même taille partout (capture d'écran côte à côte). |
| **T0-11** | Comble les trous i18n les plus visibles | `locales/fr/translation.json`, `locales/en/translation.json`, `ObjectsList.tsx:215-218,186-187,144,152,171`, `ActivityLogs.tsx:93-96`, `AdminTokens.tsx:216`, `ApplicationsKeys.tsx:327,463,466`, `S3Browser.tsx:721,726,728` | Ajouter les clés manquantes (`dashboard.cluster_*_success` en EN, `common.edit` dans EN, `keys.import_title` en FR, `dashboard.current_layout` en FR), traduire les en-têtes et libellés listés. | 1 h | Moyen/Fort | Script de contrôle (annexe A.2) : `diff` des clés FR/EN = vide **et** aucune chaîne anglaise littérale dans les fichiers listés (`grep` dédié 0 résultat). |
| **T0-12** | Supprimer le fichier vide et le code mort le moins risqué | `components/dashboard/RecentDeployments.tsx`, `pages/AdminPage.tsx`, `pages/UserPage.tsx`, `components/dashboard/{SystemHealth,TrafficChart}.tsx`, `components/S3ConfigSelector.tsx`, `pages/dashboard/components/{MetricPaper,RawCollapse,CreateFileDialog}.tsx` | Suppression des fichiers **sans aucun import** (vérifié §1.3) + nettoyage des exports correspondants. Ne **pas** supprimer `Navigation.tsx`, `Header.tsx`, `PageHeader`, `LoadingState`, `ErrorState`, `ResponsiveLayout` : ils servent au Tier 1 (voir T1-1/T1-2). | 30 min | Moyen | `npx tsc -b` et `npm run build` passent ; `npx eslint src` sans nouvelle erreur. |
| **T0-13** | Formatage unifié des tailles et des dates | nouveau `src/utils/format.ts` + `Buckets.tsx:537,389`, `ObjectsList.tsx:259,260`, `ApplicationsKeys.tsx:319`, `AdminTokens.tsx:237`, `ActivityLogs.tsx:116`, `ClusterLayout.tsx:56-63` | Extraire `formatBytes(n)` (réutiliser la meilleure implémentation : `ClusterLayout.tsx:56-63`) et `formatDateTime(value, i18n.language)` basé sur `Intl.DateTimeFormat` ; remplacer `toLocaleString()` du navigateur. | 50 min | Moyen | Dans un navigateur `en-US` avec l'UI en FR : une date s'affiche au format FR (`01/02/2026 14:03`) ; une taille de 1 048 576 octets s'affiche `1 Mio` (jamais `1048576`). |
| **T0-14** | Dockeriser le contexte projet dans l'en-tête S3 Browser + Buckets (correctif minimal, avant la refonte T2-1) | `Buckets.tsx:329-331`, `S3Browser.tsx:643-647` | Remplacer les titres `h6` « Project: X » par un `Chip` avec `label={project.name}` + `type` (garage/s3), aligné à droite de l'en-tête de page. | 30 min | Moyen | Le projet courant apparaît une seule fois par écran, sous forme de `Chip` identique sur les deux écrans. |

**Total Tier 0 : ≈ 8 h.**

---

### TIER 1 — Socle design system (structure, états, i18n, responsive)

> À faire **après** T0 (les items T1 dépendent des composants de T0-10 et T0-12).

| # | Item | Fichiers (créer/modifier) | Ce qui change | Effort | Impact | Critère de succès vérifiable |
|---|---|---|---|---|---|---|
| **T1-1** | **Thème MUI 9 unique à variables CSS** (`cssVariables: true` + `colorSchemes.light/dark`) | `theme/index.ts` (réécrit), `contexts/SettingsContext.tsx:36-41,72` | Un seul `createTheme` avec les deux schémas ; bascule par `useColorScheme()` ; tokens centralisés (voir §4.1) ; suppression des deux objets `lightTheme`/`darkTheme` statiques. **[dépend de la migration MUI 9]** : l'API `colorSchemes`/`cssVariables` est disponible à partir de la v6 et conservée en v9 ; vérifier au moment de l'implémentation que `ThemeProvider` accepte encore `defaultMode`/`InitColorSchemeScript` dans la version cible. | 1 j | Fort | `document.documentElement` porte une classe/attribut de mode ; basculer le thème change la valeur de `--kexa-palette-background-default` ; aucun écran ne reste en clair. |
| **T1-2** | **Shell applicatif : AppBar + Drawer responsive + fil d'Ariane** | `layouts/DashboardLayout.tsx` (réécrit), `components/layout/{AppBar,PageContainer}.tsx` (créés), `components/layout/Sidebar.tsx` (adapté en `Drawer`), réutilisation de `Navigation.tsx:49-178` | Barre supérieure 56 px (fil d'Ariane, sélecteur de projet, aide, thème, langue, menu utilisateur réel) ; sidebar en `Drawer permanent` ≥ `md`, `temporary` en dessous ; fin de la largeur fixe non responsive. | 2 j | **Très fort** | À 375 px : la sidebar est fermée par défaut, un bouton hamburger ouvre un `Drawer` ; à 1440 px : sidebar visible. Aucun `height: 100vh` (utiliser `100dvh`) : `grep -rn "100vh" src` → 0 excepté la preview. |
| **T1-3** | **Sélecteur de projet global + garde de route** | `components/layout/ProjectSwitcher.tsx` (créé), `App.tsx:116-166` | Sélecteur dans la barre supérieure (rappel du projet actif + bascule + « Gérer les projets »), badge de type ; route protégée : si `selectedProject === null` et route projet-dépendante → `Navigate` vers `/projects` + message explicatif ; route `*` → page 404 explicite. | 0,5 j | **Très fort** (P0-2) | Depuis `/cluster`, on bascule de projet en 2 clics sans quitter l'écran ; accéder à `/buckets` sans projet redirige vers `/projects` avec un message. |
| **T1-4** | **`DataTable<T>` : tri, recherche, pagination, sélection, états** | `components/data/DataTable.tsx` (créé), puis migration des 16 tables | Composant unique : `columns`, `rows`, `loading` (skeletons), `error` (+ retry), `emptyState`, tri client (`TableSortLabel`), recherche (`TextField` `Search`), pagination (`TablePagination` 25/50/100), colonne de sélection optionnelle, alignement numérique, `density`, `stickyHeader`. | 2 j | **Très fort** (P1-2) | Sur chaque liste : trier par date décroissante et filtrer « foo » en < 2 s ; aucune occurrence de `<Table` hors du composant `DataTable` et de `ClusterLayout` (§T2-4). |
| **T1-5** | **Snackbar + Confirm globaux** | `contexts/FeedbackContext.tsx` (créé), `App.tsx` (montage), remplace `ClusterLayout.tsx:810-819`, `AdminTokens.tsx:380-384`, `Snackbar` locaux | `notify({severity, message})` et `confirm({title, description, resourceName, tone})` : une seule pile de snackbars, une seule apparence de confirmation, plus aucun état local de type `snack`. | 0,5 j | Fort | `grep -rn "<Snackbar" src/pages` → 0 ; les 12 confirmations existantes passent par `confirm()` (recensement : `Buckets.tsx:712,725`, `ApplicationsKeys.tsx:566`, `AdminTokens.tsx:336`, `Blocks.tsx:225,241`, `ClusterLayout.tsx:792`, `S3Browser.tsx:717`). |
| **T1-6** | **États vide/chargement/erreur normalisés** | Réutiliser `components/LoadingState.tsx:25-33`, `components/ErrorState.tsx:18-84`, créer `components/EmptyState.tsx` | `EmptyState` (icône, titre, description, CTA primaire, lien secondaire) branché sur les 6 tableaux + `Projects` ; `LoadingState type="skeleton"` pour les tables et les cartes ; `ErrorState variant="centered" onRetry` pour les échecs de page. | 1 j | Fort (P1-3, P1-4) | Plus aucun spinner plein écran : `grep -rn "minHeight=\"200px\"" src` → 0 (`UserManager.tsx:163`, `Projects.tsx:179`) ; chaque liste vide montre un titre + un bouton d'action. |
| **T1-7** | **i18n complet + locales dates/nombres** | `locales/{fr,en}/translation.json`, `i18n.ts:12-13`, tous les fichiers listés en P2-1 | Exhaustivité des clés, `intl` configuré sur `i18n.language`, plus aucune chaîne utilisateur littérale. | 1 j | Fort | `grep -rn "defaultValue:" src --include=*.tsx` → 0 ; `locales/fr` et `locales/en` ont **exactement** le même jeu de clés (script annexe A.2) ; sélecteur de langue présent sur le login. |
| **T1-8** | **Formulaires normalisés (plus d'input HTML natif)** | `Buckets.tsx:468-471`, `ApplicationsKeys.tsx:354-364,489-500`, `AdminTokens.tsx:288-291` (référence correcte) ; `InputLabelProps` → `slotProps` dans `ApplicationsKeys.tsx:352,486`, `AdminTokens.tsx:298` | Un `FormDialog` (titre, contenu, `DialogActions` avec état `busy`, `Alert` d'erreur, validation champ par champ, soumission au clavier) ; `Checkbox`/`FormControlLabel`/`Switch` MUI partout. **[dépend de la migration MUI 9]** : `InputLabelProps` est déprécié depuis la v5.5 et retiré des versions récentes — utiliser `slotProps={{ inputLabel: { shrink: true } }}`. | 1 j | Fort | `grep -rn "<input type=\"checkbox\"" src` → 0 ; `grep -rn "InputLabelProps" src` → 0 ; tous les dialogues ont un bouton de validation désactivé pendant l'envoi, sans spinner qui décale le bouton. |
| **T1-9** | **Accessibilité de base** | `Sidebar.tsx:208,224`, `ObjectsList.tsx:149-156,243,269`, `ApplicationsKeys.tsx:329`, `Buckets.tsx:261`, `AdminTokens.tsx:244-264` | `aria-label` sur **tous** les `IconButton` icône-seule, `Tooltip` non vide (ou suppression du `Tooltip` quand le libellé est visible), `id`/`htmlFor` sur les cases, contraste vérifié. | 1 j | Moyen | Parcours clavier complet du login → buckets → upload sans souris ; script axe/Lighthouse : 0 violation « buttons must have discernible text ». |

**Total Tier 1 : ≈ 9,5 j.**

---

### TIER 2 — Refontes lourdes

| # | Item | Fichiers | Ce qui change | Effort | Impact | Critère de succès vérifiable |
|---|---|---|---|---|---|---|
| **T2-1** | **Refonte de la navigation par tâches** | `Sidebar.tsx:21-46`, `Navigation.tsx` (à supprimer après absorption), `App.tsx:113-169` | Regroupement par intention : *Plateforme* (Projets, Utilisateurs) / *Données* (Buckets, S3 Browser, Applications & clés) / *Cluster* (Vue d'ensemble, Nœuds, Partitions, Workers, Blocs, Configuration, Journaux) / *Sécurité* (Jetons admin) ; un onglet actif par route (fin des `?tab=` pour la navigation) ; compteurs d'alerte (blocs en erreur, nœuds down) ; état replié persisté. | 1 sem. | **Très fort** | Chaque écran a une URL propre (`/cluster/nodes`) ; le lien actif est surligné après un rechargement direct ; aucune entrée de navigation morte. |
| **T2-2** | **Écran Cluster découpé + vrais onglets** | `ClusterLayout.tsx` (822 l.) → `pages/cluster/{Overview,Nodes,Partitions,Workers,Blocks,Config,Logs}.tsx` + `pages/cluster/ClusterTabs.tsx` | 6 pages routées, onglets `Tabs` visibles, chargement par page (fin du `Promise.allSettled` global `:122-143`), extraction de `formatBytes`/`calculateClusterStorage` (`:56-97`) dans `utils`. | 1 sem. | **Très fort** | `ClusterLayout.tsx` supprimé ; aucun fichier de page > 300 lignes ; un onglet en erreur n'empêche plus les 5 autres de s'afficher. |
| **T2-3** | **Tableau de bord « Vue d'ensemble »** (remplace le code commenté `App.tsx:13,119`) | `pages/Overview.tsx` (créé), réutilisation de `components/dashboard/{StatCard}.tsx` et `TrafficChart.tsx` (ressuscité, à dé-câbler du clair) | 4–6 KPI (nœuds up, capacité/utilisation, buckets, objets, clés expirées, blocs en erreur), un graphe capacité/usage, une liste « actions attendues » (blocs en erreur, clés expirant sous 7 j, nœuds down), 1 clic vers l'écran concerné. | 1 sem. | Fort | L'écran est la page par défaut après sélection d'un projet ; chaque KPI est cliquable et mène au détail **filtré** (ex. « 2 blocs en erreur » → `/cluster/blocks?node=node-02`) ; les données viennent d'appels réels (`GetClusterStatus`, `GetClusterHealth`, `ListBuckets`, `ListKeys`). |
| **T2-4** | **Refonte du flux d'upload / objets** | `S3Browser.tsx:320-422,602-624`, `ObjectsList.tsx:132-287` | File d'upload (n fichiers, progression par fichier, annulation, reprise, séquentialisation), `Stack` de toasts de progression, glisser-déposer sur la table, filtre/tri via `DataTable`, sélection multiple avec barre d'actions flottante (« Supprimer 12 objets », « Télécharger », « Déplacer »), recherche par préfixe. | 1 sem. | **Très fort** | Upload de 20 fichiers en une fois avec 20 barres de progression indépendantes et un résumé final ; `Blob`/`XHR` remplacés par un client unique (`utils/s3Client.ts`) partagé avec la preview. |
| **T2-5** | **Unifier la prévisualisation (fin de la triple duplication MIME)** | `S3Browser.tsx:472-580`, `PreviewDialog.tsx`, `PreviewPage.tsx` (supprimer), `utils/mime.ts` (créé) | Une seule implémentation : détection type→langage par table de données (Map), thème Monaco aligné sur le mode clair/sombre, reader PDF/audio/office, plein écran dans une route `/s3/:bucket/*` au lieu d'un écran séparé et d'un dialogue. | 3–4 j | Fort | `grep -c "case 'text/x-"` sur `src` → 0 ; `PreviewPage.tsx` supprimé ; la preview respecte le thème clair. |
| **T2-6** | **Palette de commandes / recherche globale (facultatif mais excellent ratio)** | `components/CommandPalette.tsx` (créé), `App.tsx` | `Ctrl/Cmd+K` : recherche de projet, de bucket, de clé, de nœud ; navigation directe ; actions rapides (« Créer un bucket », « Basculer de projet »). | 3 j | Moyen/Fort | `Ctrl+K` ouvre la palette depuis n'importe quel écran ; taper 3 caractères d'un nom de bucket affiche le résultat et navigue en une frappe. |

**Total Tier 2 : ≈ 4 semaines.**

### Séquencement conseillé

```
Jour 1        : T0-1 … T0-14 (toute la journée)          → l'app arrête de planter et parle d'une seule voix
Jours 2-3     : T1-1, T1-2, T1-3                        → thème + shell + projet global (débloque tout le reste)
Jours 4-5     : T1-4 (DataTable)                        → migrer d'abord Buckets, puis ApplicationsKeys, AdminTokens
Jours 6-7     : T1-5, T1-6, T1-9                        → feedback, états, accessibilité
Jour 8        : T1-7, T1-8                              → i18n exhaustif + formulaires
Semaines 2-4  : T2-1 → T2-2 → T2-3 → T2-4 → T2-5       → navigation, cluster, dashboard, uploads, preview
Optionnel     : T2-6 (palette de commandes)
```

**Ce qu'il ne faut pas faire** : refaire l'écran Cluster (T2-2) avant T1-2/T1-3 ; migrer les 16 tables vers `DataTable` avant que le thème (T1-1) soit en place ; supprimer `Navigation.tsx` avant T1-2 (il contient la seule référence de Drawer mobile et de sélecteur de projet, utile pour ne rien oublier).

---

## 4. Design system cible (MUI 9)

### 4.1 Tokens du thème

**Fichier cible** : `front/src/theme/index.ts` (réécrit), plus `front/src/theme/tokens.ts` (valeurs brutes) et `front/src/theme/typography.ts` si l'on veut séparer.

```ts
// theme/tokens.ts
export const radius = { none: 0, sm: 6, md: 8, lg: 12, xl: 16, full: 999 } as const
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const
export const layout = { appBar: 56, sidebar: 264, sidebarRail: 72, contentMax: 1560 } as const
export const density = {
  compact:   { row: 32, control: 32, padding: 8 },
  standard:  { row: 40, control: 36, padding: 12 },
  comfortable: { row: 52, control: 44, padding: 16 },
} as const

export const palette = {
  dark: {
    bgDefault: '#0B0F17', bgPaper: '#121826', bgElevated: '#171F31',
    bgHover:   'rgba(148,163,184,0.08)',
    primary: '#0EA5E9', primaryHover: '#38BDF8', primaryPressed: '#0284C7',
    success: '#10B981', warning: '#F59E0B', error: '#EF4444', info: '#38BDF8',
    textPrimary: '#E6EDF7', textSecondary: '#94A3B8', textDisabled: '#64748B',
    divider: '#1E293B', focusRing: '#38BDF8',
  },
  light: {
    bgDefault: '#F6F8FB', bgPaper: '#FFFFFF', bgElevated: '#FFFFFF',
    bgHover:   'rgba(15,23,42,0.04)',
    primary: '#0284C7', primaryHover: '#0369A1', primaryPressed: '#075985',
    success: '#047857', warning: '#B45309', error: '#DC2626', info: '#0369A1',
    textPrimary: '#0F172A', textSecondary: '#475569', textDisabled: '#94A3B8',
    divider: '#E2E8F0', focusRing: '#0284C7',
  },
} as const
```

Reprise de la marque : `primary` sombre `#0EA5E9` **conservé** de `theme/index.ts:7` (continuité), `success/warning/error` conservés de `theme/index.ts:9-11`. Les variantes claires sont assombries pour respecter 4,5:1 sur fond blanc.

```ts
// theme/index.ts
import { createTheme } from '@mui/material/styles'
import { palette, radius, layout, density } from './tokens'

const fontFamily =
  'Inter Variable, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

export const theme = createTheme({
  cssVariables: { cssVarPrefix: 'kexa' },   // <- une seule source de vérité, thème clair/sombre par variables
  colorSchemes: {
    dark: {
      palette: {
        mode: 'dark',
        background: { default: palette.dark.bgDefault, paper: palette.dark.bgPaper },
        primary:  { main: palette.dark.primary, dark: palette.dark.primaryPressed, light: palette.dark.primaryHover, contrastText: '#04121C' },
        secondary:{ main: '#64748B' },
        success:  { main: palette.dark.success },
        warning:  { main: palette.dark.warning },
        error:    { main: palette.dark.error },
        info:     { main: palette.dark.info },
        text:     { primary: palette.dark.textPrimary, secondary: palette.dark.textSecondary, disabled: palette.dark.textDisabled },
        divider:  palette.dark.divider,
        action:   { hover: palette.dark.bgHover },
      },
    },
    light: { /* mêmes clés avec palette.light */ },
  },
  shape: { borderRadius: radius.md },
  spacing: 4,
  typography: {
    fontFamily,
    h1: { fontSize: '2rem',    fontWeight: 700, letterSpacing: '-0.02em' },   // écrans marketing vides
    h2: { fontSize: '1.5rem',  fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h4: { fontSize: '1.125rem',fontWeight: 600 },
    h5: { fontSize: '1rem',    fontWeight: 600 },                            // titre de section
    h6: { fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' }, // <- fini les majuscules 14px utilisées comme titre de page
    subtitle1: { fontSize: '0.875rem', fontWeight: 600 },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 600, color: 'inherit' },
    body1: { fontSize: '0.875rem', lineHeight: 1.6 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem',  lineHeight: 1.4 },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem' },
    overline: { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { body: {
      '&::-webkit-scrollbar': { width: 10, height: 10 },
      '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--kexa-palette-divider)', borderRadius: 8, backgroundClip: 'padding-box', border: '2px solid transparent' },
    } } },
    MuiPaper:  { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard:   { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid var(--kexa-palette-divider)', borderRadius: radius.lg } } },
    MuiButton:{ defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: radius.sm, paddingInline: 14, minHeight: 34 } } },
    MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
    MuiSelect:    { defaultProps: { size: 'small' } },
    MuiTableCell:{ styleOverrides: { head: { fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--kexa-palette-text-secondary)', backgroundColor: 'var(--kexa-palette-background-paper)', position: 'sticky', top: 0, zIndex: 2 }, body: { borderBottom: '1px solid var(--kexa-palette-divider)' } } },
    MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: 'var(--kexa-palette-action-hover)' } } } },
    MuiDialog:   { defaultProps: { fullWidth: true, maxWidth: 'sm' }, styleOverrides: { paper: { borderRadius: radius.lg, border: '1px solid var(--kexa-palette-divider)' } } },
    MuiTooltip:  { defaultProps: { arrow: true, enterDelay: 300 } },
    MuiChip:     { styleOverrides: { sizeSmall: { height: 22, fontSize: '0.75rem' } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: radius.sm, minHeight: 38 } } },
    MuiSkeleton: { defaultProps: { animation: 'wave' } },
    // variants nommées (voir ci-dessous)
    MuiTypography: { variants: [
      { props: { variant: 'pageTitle' }, style: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em' } },
      { props: { variant: 'metric'    }, style: { fontSize: '1.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } },
      { props: { variant: 'code'      }, style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem' } },
    ] },
  },
  // tokens maison exposés aux composants
  kexa: { layout, density, radius, space },
})

// Typage des tokens maison (declaration merging) :
declare module '@mui/material/styles' {
  interface Theme { kexa: { layout: typeof layout; density: typeof density; radius: typeof radius; space: typeof space } }
  interface ThemeOptions { kexa?: Theme['kexa'] }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides { pageTitle: true; metric: true; code: true }
}
```

**Bascules utilisateur (à conserver telles quelles ou presque)** :

| Réglage | Stockage actuel | Cible |
|---|---|---|
| Langue | `localStorage["kexamanager:lang"]` (`SettingsContext.tsx:33,46`) | inchangé, + détection `navigator.language` au premier lancement |
| Mode clair/sombre | `localStorage["kexamanager:theme"]` (`SettingsContext.tsx:37,51`) | migré vers les variables CSS MUI (`useColorScheme`), clé conservée pour ne pas perdre la préférence |
| Sidebar repliée | `localStorage["kexamanager:sidebarCollapsed"]` (`SettingsContext.tsx:56,61`) | inchangé |
| Densité (nouveau) | — | `localStorage["kexamanager:density"]`, 3 modes (`compact/standard/comfortable`), exposée dans le menu utilisateur |

### 4.2 Navigation & layout

**Structure cible** (voir maquette §5.2) :

```
┌ AppBar 56px ─────────────────────────────────────────────────────────────┐
│ [⟨/⟩] Projet ▸ Buckets ▸ mon-bucket     [⌘K Rechercher] [Projet ▾] [🔔] [☾] [FR] [👤▾] │
└──────────────────────────────────────────────────────────────────────────┘
┌ Drawer 264px ─┬─ PageContainer (max 1560, p 24) ─────────────────────────┐
│ PLATEFORME    │  PageHeader: titre + sous-titre + badge + action        │
│  ▸ Projets    │  Breadcrumbs (optionnel si AppBar les porte)            │
│  ▸ Utilisateurs│ ────────────────────────────────────────────────────── │
│ DONNÉES       │  contenu (DataTable | Cards | Form)                    │
│  ▸ Buckets    │                                                         │
│  ▸ Navigateur S3                                                        │
│  ▸ Applications                                                         │
│ CLUSTER                                                                 │
│  ▸ Vue d'ensemble  (1 alerte)                                           │
│  ▸ Nœuds                                                                │
│  ▸ Partitions                                                           │
│  ▸ Workers                                                              │
│  ▸ Blocs           (3 alertes)                                          │
│  ▸ Configuration                                                        │
│  ▸ Journaux                                                             │
│ SÉCURITÉ                                                                │
│  ▸ Jetons admin                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ [👤 Administrateur ▾]              [⟨ replier —] [☾] [FR]                │
└──────────────────────────────────────────────────────────────────────────┘
```

Règles :

1. **Un seul `Drawer`** (`variant="permanent"` ≥ `md`, `temporary` en dessous) — reprendre la logique de `Navigation.tsx:98-178` mais avec un état unique (`mobileOpen`) et `tone="neutral"` (le survol n'est plus la seule indication d'activité).
2. **Item actif** : fond `action.selected`, texte `text.primary`, barre latérale 2 px `primary.main` à gauche ; l'état actif du parent Cluster se propage aux enfants (corrige `Sidebar.tsx:138`).
3. **Sélecteur de projet** dans l'AppBar, pas dans la sidebar (il est transverse) : `Chip` du projet + `type`, menu déroulant avec recherche, item « Gérer les projets… ».
4. **Palette de commandes** `⌘K`/`Ctrl+K` (T2-6), affichée comme `IconButton` + raccourci dans l'AppBar.
5. **Breadcrumbs** dans l'AppBar (`Projet ▸ Section ▸ Ressource`) ; sur `S3Browser`, réutiliser `S3Breadcrumbs.tsx` (déjà conforme) en le déplaçant dans l'AppBar.
6. **Fin de `?tab=` pour la navigation** : une route par vue (`/cluster/nodes`, `/cluster/blocks`, …) au Tier 2, avec `Tabs` visibles dans la page.

### 4.3 Pattern de table (`DataTable`)

```tsx
<DataTable<Bucket>
  rows={buckets}
  getRowId={(b) => b.id}
  loading={loading}
  error={error}
  onRetry={reload}
  columns={[
    { id: 'id',      header: t('buckets.col.id'), cell: (b) => <Typography variant="code">{b.id}</Typography>, width: '18%' },
    { id: 'aliases', header: t('buckets.col.aliases'), cell: (b) => <AliasChips aliases={b.aliases} max={3} /> },
    { id: 'objects', header: t('buckets.stats.objects'), align: 'right', numeric: true, cell: (b) => b.objects, sortValue: (b) => b.objects },
    { id: 'size',    header: t('buckets.stats.bytes'),  align: 'right', numeric: true, cell: (b) => formatBytes(b.bytes), sortValue: (b) => b.bytes },
    { id: 'created', header: t('buckets.col.creationDate'), cell: (b) => formatDateTime(b.created, i18n.language), sortValue: (b) => b.created },
  ]}
  searchPlaceholder={t('common.search_placeholder')}
  searchValue={(b) => b.id + ' ' + (b.aliases ?? []).join(' ')}
  defaultSort={{ id: 'created', dir: 'desc' }}
  pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
  selection={{ enabled: true, bulkActions: (ids, clear) => [
      { label: t('buckets.bulk.delete', { count: ids.length }), tone: 'danger', onClick: () => confirmBulkDelete(ids, clear) },
      { label: t('buckets.bulk.export'), onClick: () => exportCsv(ids) },
  ] }}
  emptyState={{ icon: <StorageIcon />, title: t('buckets.empty_title'), description: t('buckets.empty_desc'),
                primaryAction: { label: t('buckets.actions_add'), onClick: openCreate }, isFiltered: () => searched }}
  density={densityMode}
  stickyHeader
  onRowClick={(b) => openDetails(b.id)}
/>
```

Contrat du composant (à respecter pour que la migration des 16 tables soit mécanique) :

| Prop | Comportement |
|---|---|
| `columns[].align: 'right'` + `numeric` | alignement + `fontVariantNumeric: 'tabular-nums'` |
| `columns[].sortValue` | active le tri sur la colonne (`TableSortLabel`, `aria-sort`) |
| `searchValue(row)` | indexe la recherche (nom, id, alias, clé) |
| `loading` | rend `rowsPerPage` lignes de `Skeleton` (jamais un `CircularProgress` dans une cellule) |
| `error` | rend `ErrorState variant="centered" onRetry` **dans le corps de la table** ; les en-têtes restent visibles |
| `emptyState.isFiltered()` | affiche automatiquement « aucun résultat pour ce filtre » + bouton « Effacer les filtres » si un filtre est actif, sinon l'empty state d'origine |
| `selection` | colonne de cases uniquement si `selection.enabled` ; barre d'actions flottante en bas quand ≥ 1 ligne est cochée |
| `density` | 3 modes, lus dans le thème (`theme.kexa.density`) |

Colonnes min/max : largeur minimale 80 px, troncature avec `Tooltip` (pattern déjà utilisé dans `Buckets.tsx:363-373`), jamais de `minWidth` en dur dans un `sx` responsive comme `Buckets.tsx:369`.

### 4.4 Feedback

| Besoin | Pattern cible | Remplace |
|---|---|---|
| Succès/erreur d'action | `notify({ severity, message, action? })` → snackbar empilée, 4 s (succès) / 8 s (erreur), ancrée en bas à droite | `ClusterLayout.tsx:810-819`, `AdminTokens.tsx:380-384`, états `error` locaux |
| Erreur de chargement de page | `ErrorState variant="centered"` avec `onRetry` et code d'erreur replié | `Chip color="error"` (`S3Browser.tsx:694-698`, `ActivityLogs.tsx:83-87`), `div color:red` (`AdminTokens.tsx:209`) |
| Erreur de champ de formulaire | `helperText` + `error` sur le `TextField`, `Alert severity="error"` en tête du dialogue, focus sur le premier champ en erreur | `Alert` global dans les dialogues (`Projects.tsx:307-311`, `UserManager.tsx:258-262`) |
| Chargement de liste | lignes `Skeleton` | 37 `CircularProgress` |
| Chargement de carte/KPI | `Skeleton variant="rounded"` sur la valeur | `Nodes.tsx:88-93` etc. |
| Chargement d'action (bouton) | bouton `loading` avec largeur figée (`minWidth`) et `startIcon` remplacé par un spinner 16 px | `Projects.tsx:400`, `AdminTokens.tsx:306` |
| Confirmation destructive | `confirm({ title, description, resourceName, tone: 'danger', requireTypedName: true })` pour buckets/projets/jetons | `window.confirm` (`Projects.tsx:166`, `UserManager.tsx:148`) et dialogues sans nom de ressource (`Buckets.tsx:726-736`) |
| Confirmation à fort impact (disposition cluster) | dialogue avec **résumé diff** (avant → après) et double validation | `ClusterLayout.tsx:792-808` |
| Progression longue | barre + file d'attente (`T2-4`) | `ObjectsList.tsx:194-202` (un seul fichier à la fois) |

Règle de sélection : `notify` pour un effet non bloquant, `confirm` pour un effet irréversible, `ErrorState` pour un échec de chargement qui empêche d'utiliser l'écran.

### 4.5 États vides, chargement, erreur — contrat unique

```
EmptyState (nouveau composant)
  props: icon? (LucideIcon), title (string i18n), description?, primaryAction?, secondaryAction?, size?: 'page'|'inline'
  rendu page   : 96px d'icône en cercle `action.hover`, titre `h6`, description `body2 text.secondary` max 420px, CTA `contained`, lien `text`
  rendu inline : même chose en 1 ligne centrée dans la cellule (colSpan), CTA `size="small"`

LoadingState (existant, components/LoadingState.tsx)
  type="skeleton" | "spinner" ; rows ; utilisé pour les listes (skeleton) et les pages (spinner centré 40px)

ErrorState (existant, components/ErrorState.tsx)
  variant="centered" + onRetry pour les échecs bloquants ; variant="alert" pour les échecs non bloquants
  + nouvelle prop `detail?: string` (message technique replié dans un <pre> via RawCollapse ressuscité)
```

Textes d'état vide à créer (clés i18n) : `<entité>.empty_title` (ex. « Aucun bucket dans ce projet ») + `<entité>.empty_desc` (« Créez votre premier bucket pour commencer à stocker des objets. ») + CTA vers l'action de création. Les 5 états vides actuels (`Buckets.tsx:352-358`, `ObjectsList.tsx:229-235`, `BucketsList.tsx:71-77`, `AdminTokens.tsx:226-232`, `ActivityLogs.tsx:107-112`) et l'absence d'état vide sur `Projects` (`:232-300`) et `UserManager` (`:200-249`) sont tous remplacés.

### 4.6 Formulaires

- `FormDialog` : `Dialog` + `DialogTitle` (verbe d'action + ressource) + `DialogContent` (`Stack spacing={2}`, `Alert` d'erreur en tête, **pas** de `margin="normal"` : la mise en page vient du `Stack`) + `DialogActions` (`Annuler` en `text`, action primaire en `contained`, `disabled` pendant `busy`, `minWidth` fixe).
- Champs : `TextField size="small"` par défaut, `fullWidth`, labels issus du thème i18n, `helperText` explicite. Dates : `type="datetime-local"` + `slotProps={{ inputLabel: { shrink: true } }}`.
- Cases à cocher : `Checkbox` + `FormControlLabel` (jamais `<input>`). Interrupteurs pour les options binaires (« Site web activé », `Switch`, comme `Buckets.tsx:628`).
- Secrets : champ `readOnly` en `text` monospace + bouton « Copier » avec `Tooltip` « Copié ! », bandeau `Alert severity="warning"` « ce secret ne sera plus affiché » + case « Je l'ai enregistré » obligatoire avant fermeture (aujourd'hui : `ApplicationsKeys.tsx:535-564`, `AdminTokens.tsx:348-378`).
- Validation : règle par champ (`required`, `min`, motif S3 pour un nom de bucket : 3–63 caractères, minuscules/chiffres/tirets — à ajouter, aujourd'hui aucune validation de nom n'existe : `CreateBucketDialog.tsx:30`), message sous le champ, bouton bloqué tant qu'un champ obligatoire est vide.

### 4.7 Accessibilité & i18n — règles non négociables

1. Tout `IconButton` porte un `aria-label` **ou** un `Tooltip` non vide (jamais `title=""`, cf. `Sidebar.tsx:101`).
2. Toute action destructive est annoncée (`aria-describedby` du nom de la ressource).
3. Focus visible : `outline: 2px solid var(--kexa-palette-focus-ring); outline-offset: 2px` sur tous les éléments interactifs (à ajouter dans `MuiCssBaseline`).
4. Taille de cible ≥ 32×32 px (icônes de table : passer de `size="small"` seul à `size="small"` + `sx={{ width: 32, height: 32 }}`).
5. Contraste : texte ≤ 18 px → ≥ 4,5:1 ; vérifier `#94A3B8` sur `#121826` (≈ 6,8:1, OK) et `#64748B` (désactivé, ne jamais l'utiliser pour du texte porteur d'information).
6. Tout texte visible passe par `t()` — aucune exception, aucune chaîne de secours (`defaultValue`) en dur : les 30 `defaultValue` recensés doivent disparaître (annexe A.2).
7. Locale : `i18n.language` pilote `Intl.DateTimeFormat`/`Intl.NumberFormat` via `utils/format.ts` (jamais `toLocaleString()` sans locale).

### 4.8 Points de vigilance spécifiques à la migration MUI 9

| API présente dans le code | Statut | Action |
|---|---|---|
| `Grid size={{ xs, sm, md }}` (`ClusterLayout.tsx:307,315,322,329`) + `Grid container` (`:306`) | ✅ API actuelle (Grid v6/v7+) | Rien à faire, compatible MUI 9 |
| `primaryTypographyProps` sur `ListItemText` (`Sidebar.tsx:115,149,173`) | ⚠️ déprécié depuis la v6 | Remplacer par `slotProps={{ primary: { fontSize: '0.875rem', fontWeight: 500 } }}` |
| `InputLabelProps={{ shrink: true }}` (`ApplicationsKeys.tsx:352,486`, `AdminTokens.tsx:298`) | ⚠️ déprécié depuis la v5.5 | Remplacer par `slotProps={{ inputLabel: { shrink: true } }}` |
| `PaperProps` / `ModalProps` sur `Drawer` (`Navigation.tsx:103,104`) | ⚠️ déprécié | Remplacer par `slotProps={{ paper: …, modal: … }}` (fichier mort : à faire lors de l'absorption en T1-2) |
| `useMediaQuery` importé par défaut (`Buckets.tsx:28`) | ✅ | Inchangé |
| Emission / Emotion (`@emotion/react`, `@emotion/styled` dans `package.json:16-17`) | ⚠️ dépend du choix du moteur de style en MUI 9 | Si adoption de **Pigment CSS** : `sx` reste supporté mais les `styleOverrides` du thème et les sélecteurs imbriqués doivent être revus ; si Emotion est conservé, `theme/index.ts` §4.1 fonctionne tel quel |
| `react-router-dom` 7.10 (`package.json:27`) | ✅ | Compatible React 19 |
| `@mui/icons-material` 7.3 (16 fichiers) vs `lucide-react` (`package.json:22`) | ⚠️ dette P3-4 | Choisir **une** famille à l'occasion de la migration (recommandation : `@mui/icons-material` pour les composants MUI, `lucide-react` pour les illustrations d'état vide) |

**Recommandation** : faire lander T1-1 (thème à variables CSS) **après** la migration MUI 9, pas avant, pour éviter de réécrire deux fois `theme/index.ts`.

---

## 5. Maquettes textuelles avant → après

Convention : `⟨action⟩`, `[bouton]`, `(état)`. Les changements structurels sont annotés `→ (T0-x / T1-x / T2-x)`.

### 5.1 Écran de connexion (`Login.tsx`)

**AVANT** (thème MUI clair par défaut, hors provider — `App.tsx:108`)

```
┌──────────────────────── écran blanc, Roboto ────────────────────────────┐
│                                                                        │
│                        ┌──────────────────────┐                        │
│                        │        ( ● )         │  pastille bleue MUI    │
│                        │      Connexion       │  ← login.title, pas le │
│                        │ Veuillez entrer votre│     nom du produit     │
│                        │ token d'accès…       │  ← texte faux (token)  │
│                        │                      │                        │
│                        │ [Nom d'utilisateur ] │                        │
│                        │ [• • • • • • • • • ] │  pas d'œil afficher    │
│                        │ [    Se connecter  ] │                        │
│                        │ [      Effacer     ] │  redondant             │
│                        └──────────────────────┘                        │
│        Aucun sélecteur de langue ni de thème                           │
└────────────────────────────────────────────────────────────────────────┘
```

**APRÈS**

```
┌──────────────────── écran sombre #0B0F17, Inter, primaire #0EA5E9 ─────┐
│                                               [FR ▾]  [☾/☀]            │  → (T0-2)
│                  ┌────────────────────────────────────┐                │
│                  │  ◈  KexaManager                    │  ← nom produit │
│                  │  Console d'administration de       │     + accroche │
│                  │  votre stockage S3 / Garage        │                │
│                  │                                    │                │
│                  │  (Alert error si échec, avec code)  │  → (T1-5)     │
│                  │  Nom d'utilisateur *               │                │
│                  │  ┌──────────────────────────────┐  │                │
│                  │  Mot de passe *          [👁]  │  │  → œil + CapsLock
│                  │  ┌──────────────────────────────┐  │                │
│                  │  ☐ Se souvenir de moi              │                │
│                  │  [   Se connecter   ]              │  ← seul bouton │
│                  └────────────────────────────────────┘                │
│                  KexaManager v… · documentation · état des services →   │
└────────────────────────────────────────────────────────────────────────┘
```
Détails : `Enter` soumet, bouton `loading` avec largeur figée, erreur API mappée en messages courts (`Invalid credentials`, `Service indisponible (503)`), focus initial sur « Nom d'utilisateur », aucune pastille générique.

### 5.2 Shell applicatif (sidebar + contenu)

**AVANT** (`DashboardLayout.tsx:13-19`, `Sidebar.tsx:68-231`)

```
┌ 260px ─────────┬───────────────────────────────────────────────────────┐
│ [K] KexaManager│  (pas de barre supérieure : contenu collé en haut)    │
│                │                                                       │
│ ▸ Projects     │  Système / Nœuds          ← titre h5, padding 0       │
│ ▸ S3 Browser   │  ┌─────────────────────────────────────────────────┐  │
│ ▸ Logs         │  │ ID | Hostname | … (tableau densité par défaut)  │  │
│ ▸ Buckets      │  └─────────────────────────────────────────────────┘  │
│ ▸ Applications │                                                       │
│                │  Aucun indicateur du projet actif sur cet écran       │
│ SYSTEM         │                                                       │
│ ▾ Cluster    ? │                                                       │
│   • Overview   │                                                       │
│   • Nodes      │                                                       │
│   • Partitions │                                                       │
│   • Config     │                                                       │
│ ▸ Workers      │                                                       │
│ ▸ Blocks       │                                                       │
│ ▸ Admin Tokens │                                                       │
│ ▸ Users        │                                                       │
│ [FR▾] [☾] [⟨]  │  ← [⟨] : clic = plantage React (P0-1)                │
│ (JD) Admin User│  ← identité fictive                                  │
└────────────────┴───────────────────────────────────────────────────────┘
Sur 375px : la sidebar prend 69% de l'écran, le contenu est illisible
```

**APRÈS**

```
┌ AppBar 56px ───────────────────────────────────────────────────────────────┐
│ [☰] Projet ▸ Buckets ▸ mon-bucket   [⌘K Rechercher]  [● staging ▾] [⚙][☾][FR▾][👤 Administrateur ▾] │
└────────────────┐───────────────────────────────────────────────────────────┘
┌ Drawer 264 ────┬──────────────────────────────────────────────────────────┐
│ PLATEFORME     │  Buckets                            [+ Créer un bucket]   │ ← PageHeader
│  Projets       │  Contenu et gestion des buckets de « staging »          │   (T0-10)
│  Utilisateurs  │  ─────────────────────────────────────────────────────── │
│ DONNÉES        │  [🔎 Rechercher un bucket…]        [Filtre ▾] [⟳] [⛶]    │ ← DataTable
│  Buckets      ◀│  ┌──┬──────────────┬────────┬────────┬──────────┬──────┐ │   (T1-4)
│  Navigateur S3 │  │☐ │ ID           │ Objets │ Taille │ Créé le  │      │ │
│  Applications  │  ├──┼──────────────┼────────┼────────┼──────────┼──────┤ │
│ CLUSTER        │  │☐ │ assets-media │  1 204 │ 12,4 Go│ 12/01/26 │ ⋯    │ │
│  Vue d'ens. ①  │  │☐ │ backups-db   │    318 │  4,1 Go│ 03/02/26 │ ⋯    │ │
│  Nœuds         │  └──┴──────────────┴────────┴────────┴──────────┴──────┘ │
│  Partitions    │  Lignes par page [25▾]  1–25 sur 137   [⟨] [1] [2] [⟩]    │
│  Workers       │                                                           │
│  Blocs      ③  │  (sélection active → barre flottante :                  │ ← bulk
│  Configuration │   2 éléments sélectionnés · [Supprimer] [Télécharger] [×])│
│  Journaux      │                                                           │
│ SÉCURITÉ       │                                                           │
│  Jetons admin  │                                                           │
│ ───────────────│                                                           │
│ [⟨ replier] [☾][FR]                                                        │
└────────────────┴───────────────────────────────────────────────────────────┘
< md : Drawer fermé, [☰] ouvre un Drawer temporaire overlay (jamais de contenu écrasé)
```
Corrections portées : P0-1 (repli sans crash), P0-2 (projet dans l'AppBar), P1-1 (titre + fil d'Ariane), P1-2 (recherche/tri/pagination), P1-5 (mobile), P1-8 (densité unique), P2-7 (onglets Cluster visibles dans l'AppBar du module).

### 5.3 Projets / sélection de contexte (`Projects.tsx`)

**AVANT** : spinner plein écran (`:177-183`), cartes `minmax(350px,1fr)`, badge `type` sur fond `rgba(255,255,255,.05)`, `window.confirm` pour supprimer, aucun empty state.

```
┌───────────────────────────────────────────────────────────────┐
│                    (spinner plein écran)                      │
└───────────────────────────────────────────────────────────────┘
 puis :
┌───────────────────────────────────────────────────────────────┐
│  Projects                                   [+ Add Project]   │
│  ┌─────────────────────┐  ┌─────────────────────┐             │
│  │ staging         GARAGE│ │ prod-s3        S3  │             │
│  │ URL: http://…        │ │ URL: http://…      │             │
│  │ Region: us-east-1    │ │ Region: eu-west-3  │             │
│  │        [Edit][Open]  │ │        [Edit][Open]│             │
│  └─────────────────────┘  └─────────────────────┘             │
│  (si 0 projet : page blanche ; si erreur : Alert en haut)     │
└───────────────────────────────────────────────────────────────┘
```

**APRÈS** (skeletons, recherche, CTA, état vide, confirmation nommée)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Projets                                        [+ Ajouter un projet]     │
│  Vos environnements S3 / Garage — le projet actif s'applique à tous       │
│  les écrans.                            [🔎 Rechercher…] [Type ▾] [⟳]     │
│  ────────────────────────────────────────────────────────────────────────│
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐    │
│  │ ● staging        [Garage]     │  │ ● prod-s3           [S3]      │    │
│  │ http://garage.staging:3900    │  │ https://s3.prod.example       │    │
│  │ 12 buckets · 4,1 Go · us-east │  │ 37 buckets · 812 Go · eu-west3│    │
│  │ [Ouvrir]  [Modifier]  [⋯]     │  │ [Ouvrir]  [Modifier]  [⋯]     │    │
│  └───────────────────────────────┘  └───────────────────────────────┘    │
│  ⋯ → Modifier / Dupliquer / Tester la connexion / Supprimer              │
│                                                                          │
│  État vide :  ◇  Aucun projet configuré                                  │
│  Ajoutez votre premier projet S3 ou Garage pour commencer.               │
│  [ + Ajouter un projet ]   Besoin d'aide ? Voir la documentation         │
└──────────────────────────────────────────────────────────────────────────┘
Suppression → dialog : « Supprimer le projet « staging » ? Cette action
retire la console sans supprimer les données du cluster. Pour confirmer,
saisissez staging. [Annuler] [Supprimer définitivement] »   → (T0-3, T1-5)
```

### 5.4 Buckets (`Buckets.tsx`)

**AVANT** : 7 catch vides, « Aucun bucket » indistinct, en-tête en deux `h6`, détail en dialogue de 210 lignes, octets bruts.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Buckets                                        [Ajouter un bucket]     │
│ Contenu et gestion des buckets                                        │
│ Project: staging            ← 2e titre h6, non i18n                   │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ ID            │ Alias        │ Date de création │ Actions         │ │
│ ├───────────────┼──────────────┼──────────────────┼─────────────────┤ │
│ │ assets-media  │ cdn `,` m     │ 12/01/2026 09:14 │ Détails Suppr. │ │
│ │ …             │               │                  │                │ │
│ │ (vide)        │               │                  │                │ │
│ │        Aucun bucket     ← même message pour vide ET erreur        │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
Détail : dialogue `maxWidth="lg"` : id/ARN, stats (octets bruts « 4294967296 »),
alias + suppressions unitaires, quotas (nombre + unité), site web, ajout d'alias
+ « Assigner des clés » (Autocomplete) — 4 sections empilées, 1 bouton [Modifier].
Suppression en échec → aucun message (catch vide).
```

**APRÈS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Buckets  [staging · Garage]                       [+ Créer un bucket]     │
│  Contenu et gestion des buckets du projet « staging »                      │
│  ───────────────────────────────────────────────────────────────────────── │
│  [🔎 Rechercher…]  [Trier : Créé ▾]  [Taille ▾]  [⟳]  3 buckets            │
│  ┌──┬──────────────┬───────────────┬────────┬─────────┬──────────┬───────┐ │
│  │☐ │ ID           │ Alias         │ Objets │ Taille  │ Créé le  │       │ │
│  ├──┼──────────────┼───────────────┼────────┼─────────┼──────────┼───────┤ │
│  │☐ │ assets-media │ cdn  +2       │  1 204 │ 12,4 Go │ 12/01/26 │  ⋯    │ │
│  │☐ │ backups-db   │ —             │    318 │  4,1 Go │ 03/02/26 │  ⋯    │ │
│  │☐ │ logs-2026    │ archives      │ 98 415 │ 41,7 Go │ 01/01/26 │  ⋯    │ │
│  └──┴──────────────┴───────────────┴────────┴─────────┴──────────┴───────┘ │
│  1–25 sur 3                                [25 ▾]                          │
│                                                                            │
│  (état vide)  ◇  Aucun bucket dans ce projet                               │
│  Créez votre premier bucket pour commencer à stocker des objets.           │
│  [ + Créer un bucket ]   En savoir plus sur les buckets Garage             │
│                                                                            │
│  (erreur)  ⚠  Impossible de charger les buckets                            │
│  HTTP 503 — service admin indisponible   [ Réessayer ]  Détails ▾          │
└────────────────────────────────────────────────────────────────────────────┘
Détail → Drawer latéral 480px (au lieu d'un dialog 210 lignes) :
  Onglets : [Général] [Quotas] [Accès] [Site web] [Alias]
  Général : id (copiable), alias globaux en chips, objets, taille formatée,
            créé/modifié (formatés selon la langue), ARN
  Quotas  : champs « 12 Go » avec unité par défaut intelligente + barre
            d'utilisation (utilisé / quota)
  Accès   : liste des clés avec rôle (lecture/écriture/propriétaire) en
            commutateurs, recherche, + ajouter une clé
  Alias   : ajout inline, suppression avec confirmation nommant l'alias
  Pied    : [Enregistrer les modifications] (désactivé si aucun changement)
            + bandeau « modifications non enregistrées » si l'on ferme
```
Corrections portées : P0-3 (plus d'échec silencieux), P0-4→P1-3 (vide ≠ erreur), P1-2 (tri/recherche), P1-7 (confirmation nommée), P1-8 (en-tête unique), P2-2 (tailles/dates localisées).

### 5.5 Navigateur S3 — liste de buckets puis objets

**AVANT**

```
┌───────────────────────────────────────────────────────────────┐
│ Project: staging                                              │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ S3 Browser                     [Actualiser] [+ Créer]     │ │
│ │ ID           │ Date de création      │ Actions             │ │
│ │ assets-media │ 12/01/2026 09:14      │ [Open] [🗑]         │ │
│ └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
 Ouvert sur un bucket :
┌───────────────────────────────────────────────────────────────┐
│ ⌂ Buckets / assets-media                                       │
│ [region: default] [New folder__________] [📁+]  [⟳][Upload ▾][🗑]│
│ ┌──┬──────────────┬──────────┬───────────────┬───────────────┐│
│ │☐ │ Key          │     Size │ LastModified  │ Actions       ││
│ │☐ │ 📁 images/   │        - │ -             │ [🗑]          ││
│ │☐ │ index.html   │    10482 │ 2026-01-12T…  │ [👁][⤓][🗑]   ││
│ └──┴──────────────┴──────────┴───────────────┴───────────────┘│
│                        [ Load more ]                          │
│ (erreur éventuelle affichée ici, en bas : Chip rouge)         │
└───────────────────────────────────────────────────────────────┘
Upload : 1 fichier à la fois, libellés anglais en dur, quota en anglais.
```

**APRÈS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Navigateur S3  [staging · Garage]                       [+ Créer un bucket] │
│  ───────────────────────────────────────────────────────────────────────── │
│  [🔎 Rechercher un bucket…] [Trier ▾] [⟳]                                   │
│  ┌──────────────┬─────────────┬──────────────┬──────────────┬────────────┐ │
│  │ ID           │ Région      │ Objets       │ Taille       │ Créé le    │ │
│  ├──────────────┼─────────────┼──────────────┼──────────────┼────────────┤ │
│  │ assets-media │ us-east-1   │ 1 204        │ 12,4 Go      │ 12/01/26   │ │
│  └──────────────┴─────────────┴──────────────┴──────────────┴────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
Bucket ouvert :
┌────────────────────────────────────────────────────────────────────────────┐
│  Projet ▸ Navigateur S3 ▸ assets-media                                     │
│  ───────────────────────────────────────────────────────────────────────── │
│  [🔎 rechercher dans ce dossier…]  [⟳]  [⬆ Importer ▾ (Fichiers · Dossier)] │
│  [＋ Nouveau dossier]        Sélection : 2 · [Télécharger] [Supprimer] [×]  │
│  ┌──┬──────────────────────┬─────────┬──────────────────┬────────────────┐ │
│  │☐ │ Nom                  │ Taille  │ Modifié          │                │ │
│  │☐ │ 📁 images/           │    —    │ —                │          ⋯     │ │
│  │☐ │ index.html           │ 10,2 Ko │ 12/01/26 09:14   │ 👁 ⤓ ⋯         │ │
│  └──┴──────────────────────┴─────────┴──────────────────┴────────────────┘ │
│  Chargé 50 sur ~1 204                           [ Charger 50 de plus ]      │
│                                                                            │
│  File d'import (bas-droite, non bloquante) :                               │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │ 3 fichiers en cours · 2 terminés · [Tout annuler]              │        │
│  │ video.mp4   ████████████████░░░░  78 %  2,1 Mo/s  [Annuler]   │        │
│  │ notes.md    ████████████████████ 100 %  ✓                      │        │
│  └────────────────────────────────────────────────────────────────┘        │
│                                                                            │
│  Alerte quota (i18n) : « L'import dépasserait le quota du bucket :          │
│  12,4 Go utilisés + 2,1 Go > 15 Go. [Annuler] [Importer quand même] »      │
└────────────────────────────────────────────────────────────────────────────┘
```
Corrections portées : P1-2 (tri/recherche), P1-3 (erreur en haut, actionnable), P1-6 (menu de ligne `⋯` avec Copier réellement implémenté ou retiré), P1-7 (confirmation nommant les clés), P2-1 (i18n), P2-2 (tailles/dates), T2-4 (file d'upload).

### 5.6 Cluster — Vue d'ensemble et Nœuds

**AVANT** : KPI présents mais pas de dashboard d'accueil (`App.tsx:119` commenté), titre `h6` minuscule avec icône injectée (`ClusterLayout.tsx:284`), 4 KPI puis un BarChart, en-têtes de tableaux en anglais, `?tab=` sans onglets.

```
┌───────────────────────────────────────────────────────────────┐
│ ⚡ Overview                         [Refresh]                 │
│ ┌─ Nodes ─────┐┌─ Storage ───┐┌─ Capacité ─┐┌─ Utilisé ─────┐ │
│ │ 3 / 3       ││ 3 / 3       ││ 12,4 TiB   ││ 4,1 TiB       │ │
│ └─────────────┘└─────────────┘└────────────┘└───────────────┘ │
│ ┌─ Cluster Storage Overview ─────────────────────────────────┐│
│ │ [BarChart recharts, couleurs codées en dur]                ││
│ └────────────────────────────────────────────────────────────┘│
│ (onglet Nœuds)                                                 │
│ │ ID | Hostname | Address | Garage Version | Up | Draining |… │
└───────────────────────────────────────────────────────────────┘
```

**APRÈS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Vue d'ensemble  [staging · Garage]                        ⟳ Actualiser      │
│  État du cluster mis à jour à 14:03 (il y a 12 s)                          │
│  ───────────────────────────────────────────────────────────────────────── │
│  ┌ Santé ────────┐ ┌ Nœuds ────────┐ ┌ Capacité ─────┐ ┌ Utilisé ──────┐   │
│  │ ● Sain        │ │ 3 / 3 en ligne│ │ 12,4 To       │ │ 4,1 To (33 %) │   │
│  │ 0 alerte      │ │ 3 stockage    │ │ +1 nœud prévu │ │ ▓▓▓░░░░░░░    │   │
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘   │
│  ───────────────────────────────────────────────────────────────────────── │
│  À traiter (3)                                                             │
│   ⚠  2 blocs en erreur sur node-02          [Voir les blocs →]             │
│   ⚠  1 clé expire dans 4 jours (ci-deploy)  [Voir les clés →]              │
│   ⓘ  Layout modifié non appliqué (v13)      [Voir la configuration →]      │
│  ───────────────────────────────────────────────────────────────────────── │
│  Répartition du stockage                          Données récentes          │
│  ┌───────────────────────────────────────┐        derniers buckets créés…   │
│  │ utilisé ████░░░░░░░░░ disponible      │                                │
│  └───────────────────────────────────────┘                                │
└────────────────────────────────────────────────────────────────────────────┘
Onglet Nœuds (vrais Tabs en haut de page) :
 [Vue d'ensemble] [Nœuds] [Partitions] [Workers] [Blocs •3] [Configuration] [Journaux]
 ┌──┬──────────┬──────────────┬─────────────┬────────┬───────┬────────┬───────┐
 │▾ │ Nœud     │ Version      │ Adresse     │ État   │ Drain │ Zone   │ Vu il │
 ├──┼──────────┼──────────────┼─────────────┼────────┼───────┼────────┼───────┤
 │▾ │ node-01  │ v1.0.1       │ 10.0.0.11   │ ● actif│ —     │ eu-1   │ 2 s   │
 │  │   └ Statistiques : CPU 12 % · RAM 41 % · disque 33 % (au lieu du JSON brut)│
 └──┴──────────┴──────────────┴─────────────┴────────┴───────┴────────┴───────┘
Configuration : sélection de capacité en To/Go (au lieu d'octets), tags en chips
(au lieu de « a,b »), diff avant/après avant « Appliquer le layout ».
```
Corrections portées : P1-1 (titre), P1-3 (état de chargement/vide/erreur), P2-7 (onglets), P2-8 (JSON brut → KPI lisibles), T2-2 (découpage), T2-3 (dashboard).

### 5.7 Applications & clés (`ApplicationsKeys.tsx`)

**AVANT** : suppression non rouge (`:330`), impersonation par rechargement complet, secret en clair sans garde-fou.

```
┌───────────────────────────────────────────────────────────────┐
│ Clés d'application            [Actualiser][Ajouter][Importer] │
│ Nom     │ Date de création │ Expiration  │ Actions            │
│ ci-deploy│ 12/01/2026      │ 2026-03-01  │ Détails Impersonate Supprimer(noir!)│
└───────────────────────────────────────────────────────────────┘
Détail : bloc de <Typography> avec <b>Label:</b> valeur empilés, secret en clair.
```

**APRÈS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Applications & clés  [staging · Garage]      [⟳] [+ Nouvelle clé ▾ (Créer · Importer)] │
│  ───────────────────────────────────────────────────────────────────────── │
│  [🔎 Rechercher une clé…] [Statut ▾ (actives/expirées)]                     │
│  ┌──┬────────────┬───────────┬────────────┬───────────────┬───────────────┐ │
│  │☐ │ Nom        │ Créée le  │ Expire le  │ Statut        │               │ │
│  │☐ │ ci-deploy  │ 12/01/26  │ 01/03/26   │ ⏳ 4 jours    │   ⋯           │ │
│  │☐ │ backup     │ 03/02/26  │ jamais     │ ● active      │   ⋯           │ │
│  └──┴────────────┴───────────┴────────────┴───────────────┴───────────────┘ │
│  ⋯ → Détails · Modifier · Copier l'Access Key ID · 🔑 Utiliser cette clé     │
│      (« Utiliser cette clé » = impersonation, sans rechargement, bandeau     │
│       permanent « Vous agissez en tant que ci-deploy » + [Quitter] )         │
│                                                                            │
│  Détail (Drawer) : onglets [Général][Permissions][Buckets][Secret]          │
│   Permissions : liste de commutateurs (Créer un bucket, …) au lieu d'une    │
│                 seule case                                                      │
│   Secret : ⚠ Ce secret ne sera plus affiché après fermeture                  │
│            [••••••••••••] [👁] [⧉ Copier]   ☐ Je l'ai enregistré             │
│            [Fermer] désactivé tant que la case n'est pas cochée              │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.8 Jetons d'administration (`AdminTokens.tsx`)

**AVANT** : `<div>/<h3>/<p>` bruts, erreur en rouge CSS natif, détail en `<br/>`, tableau densité par défaut.

```
<div>
  <h3>Tokens admin</h3><p>Gestion des tokens d'administration</p>  [Ajouter un token]
  (chargement : spinner + texte)   (erreur : <div style="color:red">)
  # | Créé | Nom | Expiration | Expiré | Portée | Actions
  (vide : « Aucun token admin »)
Détail : <div style="white-space:pre-wrap"> Nom: x <br/> ID: y <br/> … </div>
```

**APRÈS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Jetons d'administration  [staging]                       [+ Ajouter un jeton]│
│  Jetons d'accès à l'API d'administration Garage du projet « staging »        │
│  ───────────────────────────────────────────────────────────────────────── │
│  [🔎 Rechercher…] [Statut ▾]                                                 │
│  ┌──┬────────────┬───────────┬────────────┬──────────┬────────────────┬──┐ │
│  │☐ │ Nom        │ Créé le   │ Expire le  │ État     │ Portée         │  │ │
│  │☐ │ ci-admin   │ 12/01/26  │ jamais     │ ● actif  │ *              │⋯ │ │
│  │☐ │ ops-read   │ 03/02/26  │ 01/06/26   │ ⏳ 118 j │ bucket:read…   │⋯ │ │
│  └──┴────────────┴───────────┴────────────┴──────────┴────────────────┴──┘ │
│  Détail (Drawer) : sections Général / Portée (chips) / Utilisation récente   │
│  Formulaire : Nom · Portée (sélecteur de ressources + recherche, au lieu     │
│               d'un champ « * » en texte libre) · Expiration (jamais / date)  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.9 Nœuds / Blocs / Workers

**AVANT** (racine `<div>` sans padding, titre `h5`, `<pre>` de JSON, actions répétées par ligne)

```
<div>
 <h5>Blocs</h5><p>Vue d'ensemble des blocs</p>
 (spinner + texte)  (Alert si erreur)  (Alert info si vide)
 ▾ | Nœud | Nombre d'erreurs | Actions
   | node-02 | 2 | [Détails][Actualiser]   ← actualiser sur CHAQUE ligne
   (développé) hash… | errors: 3, refcount: 1 | [Purger][Retenter]
 (Détails → dialogue avec <pre>{JSON}</pre>)
```

**APRÈS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Blocs  [staging · Garage]                                   ⟳ Actualiser    │
│  Erreurs de blocs détectées par le cluster                                  │
│  ───────────────────────────────────────────────────────────────────────── │
│  ┌──┬──────────┬───────────────┬─────────────┬────────────┬──────────────┐ │
│  │▾ │ Nœud     │ Blocs en err. │ Plus récent │ Gravité    │              │ │
│  ├──┼──────────┼───────────────┼─────────────┼────────────┼──────────────┤ │
│  │▾ │ node-02  │      2        │ 14:01       │ ⚠ moyenne  │       ⋯      │ │
│  │  │ ┌────────┴───────┬────────────┬──────────┬──────────┴────────────┐ │ │
│  │  │ │ Hash           │ Err/Ref    │ Taille   │ Actions                │ │ │
│  │  │ │ a1b2…f9        │ 3 / 1      │ 1,2 Mo   │ [Resynchroniser][Purger]│ │ │
│  │  │ └────────────────┴────────────┴──────────┴────────────────────────┘ │ │
│  └──┴──────────┴───────────────┴─────────────┴────────────┴──────────────┘ │
│  état vide : ✓  Aucune erreur de bloc — le cluster est sain                │
│  Détails techniques → drawer avec JSON replié (RawCollapse ressuscité)      │
└────────────────────────────────────────────────────────────────────────────┘
Même gabarit pour Nœuds (stats CPU/RAM/disque au lieu de freeform) et Workers
(nom, état, dernière exécution, actions Arrêter/Relancer).
```

### 5.10 Utilisateurs (`UserManager.tsx`)

**AVANT** : spinner plein écran, tableau densité par défaut sans hover, `window.confirm`, aucun état vide.

**APRÈS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Utilisateurs                                                  [+ Inviter]  │
│  Comptes ayant accès à la console KexaManager                              │
│  ───────────────────────────────────────────────────────────────────────── │
│  [🔎 Rechercher…] [Rôle ▾]                                                 │
│  ┌───────────────┬───────────┬─────────────┬──────────────┬──────────────┐ │
│  │ Nom           │ Rôle      │ Créé le     │ Dernière conn.│              │ │
│  │ root (● système)│ ADMIN   │ 01/01/25    │ 14:02        │        —     │ │
│  │ alice         │ ADMIN     │ 12/01/26    │ il y a 2 h   │        ⋯     │ │
│  │ bob           │ UTILISATEUR│ 03/02/26   │ il y a 4 j   │        ⋯     │ │
│  └───────────────┴───────────┴─────────────┴──────────────┴──────────────┘ │
│  Formulaire : Nom · Rôle (segmented control Utilisateur/Admin) · Mot de     │
│  passe (générer un mot de passe fort + jauge de robustesse) · ☐ Exiger un   │
│  changement à la première connexion                                         │
│  Suppression → dialog nommant l'utilisateur, action « Supprimer » rouge     │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Annexe

### A. Mesures reproductibles

```bash
# A.1 volumétrie et dette
cd front/src
find . -name '*.tsx' | xargs wc -l | tail -1                 # 8154 lignes
grep -ro "sx={{" . --include=*.tsx | wc -l                   # 303
grep -rc "<Table " . --include=*.tsx | grep -v ':0'          # 16 tables / 10 fichiers
grep -rc "CircularProgress" . --include=*.tsx | grep -v ':0' # 37 / 17 fichiers
grep -ro "Skeleton" . --include=*.tsx | wc -l                # 3 (uniquement LoadingState, mort)
grep -rc "console.log" . --include=*.tsx | grep -v ':0'      # 21
grep -rn 'bgcolor: "rgba\|backgroundColor: "#\|fill="#' . --include=*.tsx   # couleurs en dur
grep -rn "<input type=\"checkbox\"\|<label>" . --include=*.tsx   # 12 occurrences (Buckets, ApplicationsKeys)
npx eslint src --format json | head                            # 6 problèmes / 4 fichiers
                                                               # dont 2 react-hooks/rules-of-hooks (Sidebar:192,193)
```

```bash
# A.2 cohérence i18n (à exécuter après T0-11 et T1-7 : les 3 sorties doivent être vides)
node -e "const f=require('./src/locales/fr/translation.json'),e=require('./src/locales/en/translation.json');
const fl=(d,p='')=>Object.entries(d).flatMap(([k,v])=>v&&typeof v=='object'?fl(v,p+k+'.'):[[p+k,v]]);
const A=Object.fromEntries(fl(f)),B=Object.fromEntries(fl(e));
console.log('FR sans EN:',Object.keys(A).filter(k=>!(k in B)));
console.log('EN sans FR:',Object.keys(B).filter(k=>!(k in A)));
console.log('identiques FR=EN:',Object.keys(A).filter(k=>k in B&&A[k]===B[k]).length)"
grep -rn "defaultValue:" src --include=*.tsx                 # attendu : 0 après T1-7 (30 aujourd'hui)
```

```bash
# A.3 code mort (fichiers sans aucun import)
cd front/src
for f in Navigation Header PageHeader LoadingState ErrorState ResponsiveLayout \
         S3ConfigSelector RawCollapse SystemHealth TrafficChart MetricPaper \
         RecentDeployments CreateFileDialog AdminPage UserPage; do
  echo "$f: $(grep -rl "from .*$f['\"]" --include=*.tsx --include=*.ts . | wc -l) importeur(s)"
done   # Navigation/Header/S3ConfigSelector/RawCollapse/SystemHealth/TrafficChart/MetricPaper/AdminPage/UserPage/RecentDeployments = 0
```

```bash
# A.4 vérification runtime locale (lecture seule)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/       # 200 (dev server Vite)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/health  # endpoint API
cd front && npx tsc -b && npm run build                                # doit passer après chaque tier
```

### B. Checklist de recette pour le Tier 0

| # | Test manuel | Attendu |
|---|---|---|
| 1 | Se connecter, puis cliquer sur le bouton de repli de la sidebar | Aucune erreur console, la sidebar se replie, la page reste affichée |
| 2 | Se déconnecter | L'écran de connexion est sombre, avec Inter, sans saut de thème |
| 3 | Arrêter le conteneur API (8080), ouvrir `/buckets`, cliquer sur « Supprimer » | Message d'erreur visible (avant : rien) |
| 4 | Avec l'API arrêtée, revenir sur `/buckets` | « Impossible de charger … [Réessayer] » et non « Aucun bucket » |
| 5 | Supprimer un projet depuis `/projects` | Dialogue MUI contenant le nom du projet (pas de `window.confirm`) |
| 6 | Afficher `/apps` | Le bouton de suppression est rouge |
| 7 | Comparer les 10 écrans côte à côte | Titre de page identique, tableaux de même densité, projet visible sous forme de `Chip` |
| 8 | Basculer en anglais | Aucun en-tête de tableau ni message d'action en français |

### C. Fichiers à supprimer / créer

**À supprimer** (après T0-12 et T2-5) : `components/dashboard/RecentDeployments.tsx`, `components/dashboard/SystemHealth.tsx`, `components/dashboard/TrafficChart.tsx` (ou recyclé par T2-3), `components/S3ConfigSelector.tsx`, `pages/AdminPage.tsx`, `pages/UserPage.tsx`, `pages/dashboard/PreviewPage.tsx`, `pages/dashboard/components/{MetricPaper,RawCollapse*,CreateFileDialog}.tsx`, `components/index.ts` (*`RawCollapse` peut être conservé pour la variante « détail technique » de `ErrorState`), `components/Navigation.tsx` (après absorption par T1-2).

**À créer** :
```
components/layout/AppBar.tsx
components/layout/ProjectSwitcher.tsx
components/layout/PageContainer.tsx
components/data/DataTable.tsx
components/data/EmptyState.tsx
components/feedback/FeedbackProvider.tsx        (notify + confirm)
components/forms/FormDialog.tsx
components/cluster/ClusterTabs.tsx              (T2-2)
pages/Overview.tsx                              (T2-3)
theme/tokens.ts
utils/format.ts                                 (formatBytes, formatDateTime)
utils/mime.ts                                   (T2-5)
utils/s3Client.ts                               (T2-4)
```

---

### Résumé exécutable en 5 lignes

1. **Jour 1** — exécuter T0-1 → T0-14 (≈ 8 h) : l'application cesse de planter (repli de la sidebar), parle une seule langue et n'avale plus les erreurs.
2. **Jours 2–3** — T1-1 (thème MUI 9 à variables CSS) + T1-2/T1-3 (AppBar, Drawer responsive, sélecteur de projet global) : le socle qui rend tout le reste possible.
3. **Jours 4–7** — T1-4 (`DataTable`) puis T1-5/T1-6/T1-9 : tri/recherche/pagination sur les 16 tables, feedback unifié, états vide/chargement/erreur, accessibilité.
4. **Jours 8–10** — T1-7/T1-8 : i18n exhaustif, formulaires normalisés (fin des `<input>` natifs et des `InputLabelProps`).
5. **Semaines 2–4** — T2-1 → T2-5 : navigation par tâches, découpage de `ClusterLayout` (822 l.), dashboard de vue d'ensemble, file d'upload, preview unifiée.
