# Kalima Jeunes — Mission Kalima Moyenne Guinée

Application de suivi des jeunes pour le responsable régional : annuaire avec
photos et numéros, tableau de bord par église, planification des programmes,
rappel des anniversaires, et préparation de SMS groupés. Les données sont
stockées dans Supabase (gratuit, externe), comme pour l'application AEMEG.

## ⚠️ Mise à jour d'un site déjà en ligne

Cette version ajoute : un système de cotisation par église (piloté par le
responsable régional), des sessions de cotisation exceptionnelle internes à
chaque église, la possibilité de charger l'affiche d'un événement, et la
présentation du comité. Ta base contient déjà des jeunes saisis par de
vraies églises — **avant** de remplacer les fichiers sur GitHub, va
d'abord dans Supabase → **SQL Editor** → **New query**, colle ceci, puis
**Run** — ça ajoute les nouvelles tables et la colonne d'affiche sans
toucher à tes données existantes :

```sql
alter table programmes add column if not exists photo_url text;

create table if not exists inscriptions_programme (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references programmes(id) on delete cascade,
  nom text not null,
  telephone text,
  eglise text,
  created_at timestamptz not null default now()
);

create table if not exists communiques (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  contenu text not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists comite (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  fonction text,
  telephone text,
  photo_url text,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists objectifs_eglise (
  eglise text primary key,
  montant_cible numeric not null default 0
);

create table if not exists versements_eglise (
  id uuid primary key default gen_random_uuid(),
  eglise text not null,
  montant numeric not null,
  date_versement date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists sessions_cotisation (
  id uuid primary key default gen_random_uuid(),
  eglise text not null,
  titre text not null,
  montant_cible numeric,
  created_at timestamptz not null default now()
);

create table if not exists contributions_session (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions_cotisation(id) on delete cascade,
  jeune_id uuid references jeunes(id) on delete set null,
  jeune_nom text,
  montant numeric not null,
  date_contribution date not null default current_date,
  created_at timestamptz not null default now()
);
```

Une fois cette migration faite, remplace sur GitHub `server.js` et tout le
dossier `public/` par les nouvelles versions de ce dossier. Render
redéploiera automatiquement. Rien à refaire côté églises déjà chargées —
leurs jeunes restent intacts.

## Étape 1 — Créer la base Supabase

1. Va sur https://supabase.com → **Start your project** → connecte-toi avec
   GitHub → **New project**
2. Nom : `kalima-jeunes`, choisis un mot de passe (garde-le de côté), une
   région proche, puis **Create new project**. Attends 1-2 minutes.
3. Va dans **SQL Editor** → **New query**, colle ceci, puis **Run** :

   ```sql
   create table jeunes (
     id uuid primary key default gen_random_uuid(),
     eglise text not null,
     nom text not null,
     telephone text,
     fonction text,
     date_naissance date,
     photo_url text,
     created_at timestamptz not null default now()
   );

   create table programmes (
     id uuid primary key default gen_random_uuid(),
     titre text not null,
     date_heure timestamptz not null,
     lieu text,
     description text,
     photo_url text,
     created_at timestamptz not null default now()
   );

   create table inscriptions_programme (
     id uuid primary key default gen_random_uuid(),
     programme_id uuid references programmes(id) on delete cascade,
     nom text not null,
     telephone text,
     eglise text,
     created_at timestamptz not null default now()
   );

   create table communiques (
     id uuid primary key default gen_random_uuid(),
     titre text not null,
     contenu text not null,
     photo_url text,
     created_at timestamptz not null default now()
   );

   create table comite (
     id uuid primary key default gen_random_uuid(),
     nom text not null,
     fonction text,
     telephone text,
     photo_url text,
     ordre integer not null default 0,
     created_at timestamptz not null default now()
   );

   create table objectifs_eglise (
     eglise text primary key,
     montant_cible numeric not null default 0
   );

   create table versements_eglise (
     id uuid primary key default gen_random_uuid(),
     eglise text not null,
     montant numeric not null,
     date_versement date not null default current_date,
     note text,
     created_at timestamptz not null default now()
   );

   create table sessions_cotisation (
     id uuid primary key default gen_random_uuid(),
     eglise text not null,
     titre text not null,
     montant_cible numeric,
     created_at timestamptz not null default now()
   );

   create table contributions_session (
     id uuid primary key default gen_random_uuid(),
     session_id uuid references sessions_cotisation(id) on delete cascade,
     jeune_id uuid references jeunes(id) on delete set null,
     jeune_nom text,
     montant numeric not null,
     date_contribution date not null default current_date,
     created_at timestamptz not null default now()
   );
   ```

4. Va dans **Storage** → **New bucket** → nom `photos` → active
   **Public bucket** → **Create bucket**

5. Va dans **Project Settings** → **API**. Note :
   - **Project URL**
   - La clé **secret** / **service_role** (jamais l'`anon`/`publishable`)

## Étape 2 — Mettre le code sur GitHub

1. Crée un nouveau dépôt (ex. `kalima-jeunes`), Public, sans rien cocher.
2. Uploade tout le contenu de ce dossier (`server.js`, `package.json`, le
   dossier `public/`, `.gitignore`, ce `README.md`) — pas besoin de
   `node_modules`.
3. Commit.

## Étape 3 — Déployer sur Render

1. render.com → **New** → **Web Service** → connecte le dépôt
   `kalima-jeunes`
2. Build Command : `npm install`
3. Start Command : `npm start`
4. Onglet **Environment** → ajoute :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ADMIN_PIN` → ton code secret (sinon `KALIMA2026` par défaut)
5. **Create Web Service**

L'URL Render obtenue est le lien à partager aux responsables de jeunesse de
chaque église de la région.

## Ce que l'application permet

**Côté responsable d'église** (comme avant), avec deux nouveautés :
- Saisir les jeunes de son église : nom, téléphone, fonction, date de
  naissance, photo
- Voir en lecture seule la progression de la cotisation régionale de son
  église, si le responsable régional a fixé un objectif pour elle
- **Ouvrir ses propres sessions de cotisation exceptionnelle** (ex. "Aide
  pour le voyage de Fatou") : le responsable régional n'y a aucun accès,
  c'est un outil entièrement interne à l'église pour suivre une collecte
  ponctuelle jeune par jeune, avec historique et suppression possibles

**Côté responsable régional**, un menu avec six sections :
- **Tableau de bord** — nombre d'églises et de jeunes, détail par église
- **Annuaire complet** — tous les jeunes de la région avec photo et
  téléphone, recherche par nom/église/fonction
- **Programmes** — créer des rencontres avec titre, date/heure, lieu,
  description, et **charger l'affiche de l'événement** (image) qui
  s'affiche en grand sur l'écran d'accueil ; les 2 prochains programmes
  restent visibles par tous, avec un bouton **"S'inscrire"** que
  n'importe qui peut utiliser sans se connecter (nom, téléphone,
  église). Depuis l'écran Programmes, le bouton **"Voir les inscrits"**
  affiche la liste et permet de la **télécharger en PDF**, prête à
  imprimer
- **Communiqués** — publier des annonces (titre + texte), avec
  possibilité d'y **charger une affiche** aussi. Présentés sur l'accueil
  avec un bandeau doré, comme sur les sites AEMEG et Kalima national.
  Différence avec Programmes : un communiqué est une annonce ou une
  information à faire passer, sans date de rencontre associée ; un
  programme est une rencontre planifiée avec une date et un lieu précis
- **Anniversaires** — liste des jeunes nés dans le mois sélectionné
- **Cotisations** — fixe un objectif par église, note les versements
  reçus, consulte l'historique. Changer l'objectif d'une église remet son
  compteur à zéro pour démarrer un nouveau cycle (confirmation demandée
  avant). L'historique peut aussi être effacé manuellement, versement par
  versement ou en une fois
- **Comité** — ajouter les membres (nom, fonction, téléphone, photo) ;
  affiché sur l'accueil avec le président à gauche et les autres membres
  à droite

**SMS groupé** : depuis l'annuaire, coche les jeunes concernés (ou "Tout
sélectionner"), écris ton message, puis "Préparer les groupes" — la liste
des numéros est répartie automatiquement par groupes de 10 (limite courante
des SMS groupés selon les téléphones/opérateurs). Chaque bouton ouvre ton
application SMS avec les numéros et le message déjà remplis ; il ne reste
qu'à appuyer sur envoyer, groupe après groupe. Aucun service payant n'est
utilisé — tout part directement depuis la puce du téléphone qui ouvre le
lien.

## Sécurité — bon à savoir

La saisie des jeunes et les sessions de cotisation exceptionnelle restent
ouvertes comme avant (n'importe qui connaissant le nom d'une église peut y
accéder — garde ces noms comme un mot de passe informel). Les actions plus
sensibles au niveau régional (programmes, comité, cotisations par église)
exigent maintenant le code administrateur à chaque requête, pas seulement à
l'écran de connexion.

## Lancer en local (facultatif)

```bash
npm install
SUPABASE_URL=https://xxxxx.supabase.co SUPABASE_SERVICE_KEY=xxxx npm start
```

Puis ouvrir http://localhost:3000
