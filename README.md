# Kalima Jeunes — Mission Kalima Moyenne Guinée

Application de suivi des jeunes pour le responsable régional : annuaire avec
photos et numéros, tableau de bord par église, planification des programmes,
rappel des anniversaires, et préparation de SMS groupés. Les données sont
stockées dans Supabase (gratuit, externe), comme pour l'application AEMEG.

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

**Côté responsable d'église** (comme avant) :
- Saisir les jeunes de son église : nom, téléphone, fonction, date de
  naissance, photo

**Côté responsable régional**, un menu avec quatre sections :
- **Tableau de bord** — nombre d'églises et de jeunes, détail par église
- **Annuaire complet** — tous les jeunes de la région avec photo et
  téléphone, recherche par nom/église/fonction, pour identifier rapidement
  quelqu'un
- **Programmes** — créer des rencontres avec titre, date/heure, lieu,
  description ; les 2 prochains programmes s'affichent aussi sur l'écran
  d'accueil, visibles par tous
- **Anniversaires** — liste des jeunes nés dans le mois sélectionné, pour le
  suivi pastoral

**SMS groupé** : depuis l'annuaire, coche les jeunes concernés (ou "Tout
sélectionner"), écris ton message, puis "Préparer les groupes" — la liste
des numéros est répartie automatiquement par groupes de 10 (limite courante
des SMS groupés selon les téléphones/opérateurs). Chaque bouton ouvre ton
application SMS avec les numéros et le message déjà remplis ; il ne reste
qu'à appuyer sur envoyer, groupe après groupe. Aucun service payant n'est
utilisé — tout part directement depuis la puce du téléphone qui ouvre le
lien.

## Lancer en local (facultatif)

```bash
npm install
SUPABASE_URL=https://xxxxx.supabase.co SUPABASE_SERVICE_KEY=xxxx npm start
```

Puis ouvrir http://localhost:3000
