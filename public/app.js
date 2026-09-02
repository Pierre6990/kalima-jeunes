const app = document.getElementById("app");

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function topBar(title, onBack) {
  const bar = el(`
    <div class="topbar">
      <button aria-label="Retour">←</button>
      <span>${title}</span>
    </div>
  `);
  bar.querySelector("button").onclick = onBack;
  return bar;
}

function logoRow() {
  return el(`
    <div class="logo-row">
      <img class="logo-badge" src="/logo.png" alt="Mission Kalima" />
      <div>
        <div class="logo-title">Mission Kalima</div>
        <div class="logo-sub">Jeunesse — Moyenne Guinée</div>
      </div>
    </div>
  `);
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Erreur serveur");
  }
  return res.json();
}

function initials(nom) {
  return (nom || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function avatarHtml(j) {
  if (j.photo_url) return `<img class="avatar" src="${j.photo_url}" alt="" />`;
  return `<div class="avatar avatar-placeholder">${escapeHtml(initials(j.nom))}</div>`;
}
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
function normalizePhone(p) {
  return (p || "").replace(/[^\d+]/g, "");
}
function formatDateFr(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
function formatDateTimeFr(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ================= ÉCRAN D'ACCUEIL =================
async function renderHome() {
  app.innerHTML = "";
  app.appendChild(logoRow());
  const wrap = el(`<div class="container"></div>`);
  wrap.appendChild(el(`<h1 class="hero serif">Suivi des jeunes, église par église</h1>`));
  wrap.appendChild(el(`<p class="lead">Chaque responsable de jeunesse tient à jour la liste de son église. Le responsable régional suit l'ensemble, les programmes et les anniversaires depuis un tableau de bord.</p>`));

  const cardPresident = el(`
    <button class="choice-card">
      <div class="row"><span>👥</span><span class="title">Responsable des jeunes d'une église</span></div>
      <p class="desc">Saisir ou mettre à jour la liste des jeunes de votre église</p>
    </button>
  `);
  cardPresident.onclick = renderPresidentPick;

  const cardAdmin = el(`
    <button class="choice-card">
      <div class="row"><span>🛡️</span><span class="title">Responsable régional des jeunes</span></div>
      <p class="desc">Annuaire, tableau de bord, programmes, anniversaires, SMS groupé</p>
    </button>
  `);
  cardAdmin.onclick = renderAdminPin;

  wrap.appendChild(cardPresident);
  wrap.appendChild(cardAdmin);
  app.appendChild(wrap);

  // Aperçu des prochains programmes, visible à tous
  try {
    const { programmes } = await api("/api/programmes");
    const upcoming = programmes.filter((p) => new Date(p.date_heure) >= new Date()).slice(0, 2);
    if (upcoming.length) {
      wrap.appendChild(el(`<p class="section-title">Prochains programmes</p>`));
      upcoming.forEach((p) => {
        wrap.appendChild(el(`
          <div class="programme-row">
            <div class="titre">${escapeHtml(p.titre)}</div>
            <div class="when">${formatDateTimeFr(p.date_heure)}</div>
            ${p.lieu ? `<div class="where">📍 ${escapeHtml(p.lieu)}</div>` : ""}
          </div>
        `));
      });
    }
  } catch (e) { /* silencieux si erreur réseau */ }
}

// ================= ESPACE RESPONSABLE D'ÉGLISE =================
function renderPresidentPick() {
  app.innerHTML = "";
  app.appendChild(topBar("Mon église", renderHome));
  const wrap = el(`<div class="container"></div>`);
  wrap.appendChild(el(`<p class="lead" style="margin-bottom:16px;">Écrivez le nom de votre église exactement comme la dernière fois, pour retrouver la même liste.</p>`));

  const field = el(`
    <label class="field">
      <span class="label-text">Nom de l'église</span>
      <input type="text" placeholder="ex. Église Kalima Labé" />
    </label>
  `);
  const input = field.querySelector("input");
  wrap.appendChild(field);

  const btn = el(`<button class="btn btn-primary" disabled>Continuer</button>`);
  input.addEventListener("input", () => { btn.disabled = !input.value.trim(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim()) go(); });
  btn.onclick = go;
  wrap.appendChild(btn);
  app.appendChild(wrap);

  async function go() {
    const nom = input.value.trim();
    if (!nom) return;
    const { jeunes } = await api(`/api/jeunes?eglise=${encodeURIComponent(nom)}`);
    renderRoster(nom, jeunes);
  }
}

function renderRoster(nomEglise, jeunes) {
  let editingId = null;

  function draw() {
    app.innerHTML = "";
    app.appendChild(topBar(nomEglise, renderPresidentPick));
    const wrap = el(`<div class="container"></div>`);

    const card = el(`
      <div class="card">
        <div class="card-head">
          <span class="label">${editingId ? "Modifier un jeune" : "Ajouter un jeune"}</span>
          <span class="saved-flag" style="display:none;">✓ Enregistré</span>
        </div>
      </div>
    `);

    const editing = jeunes.find((j) => j.id === editingId);
    const fNom = el(`<label class="field"><span class="label-text">Nom complet</span><input placeholder="Nom et prénom" /></label>`);
    const fTel = el(`<label class="field"><span class="label-text">Numéro de téléphone</span><input placeholder="ex. 622 00 00 00" /></label>`);
    const fFonc = el(`<label class="field"><span class="label-text">Fonction à l'église</span><input placeholder="ex. Choriste, Trésorier..." /></label>`);
    const fNaiss = el(`<label class="field"><span class="label-text">Date de naissance (facultatif)</span><input type="date" /></label>`);
    fNom.querySelector("input").value = editing ? editing.nom : "";
    fTel.querySelector("input").value = editing ? editing.telephone || "" : "";
    fFonc.querySelector("input").value = editing ? editing.fonction || "" : "";
    fNaiss.querySelector("input").value = editing ? editing.date_naissance || "" : "";
    card.appendChild(fNom); card.appendChild(fTel); card.appendChild(fFonc); card.appendChild(fNaiss);

    const fPhoto = el(`
      <label class="field">
        <span class="label-text">Photo (facultatif)</span>
        <input type="file" accept="image/*" capture="environment" />
      </label>
    `);
    const photoInput = fPhoto.querySelector("input");
    const preview = el(`<div style="margin:-8px 0 14px;"></div>`);
    if (editing && editing.photo_url) preview.appendChild(el(`<img src="${editing.photo_url}" class="avatar avatar-lg" alt="" />`));
    photoInput.addEventListener("change", () => {
      preview.innerHTML = "";
      const file = photoInput.files[0];
      if (file) preview.appendChild(el(`<img src="${URL.createObjectURL(file)}" class="avatar avatar-lg" alt="" />`));
    });
    card.appendChild(fPhoto);
    card.appendChild(preview);

    const btnRow = el(`<div style="display:flex; gap:8px;"></div>`);
    const saveBtn = el(`<button class="btn btn-gold">${editingId ? "Enregistrer" : "＋ Ajouter"}</button>`);
    btnRow.appendChild(saveBtn);
    if (editingId) {
      const cancelBtn = el(`<button class="btn btn-ghost">Annuler</button>`);
      cancelBtn.onclick = () => { editingId = null; draw(); };
      btnRow.appendChild(cancelBtn);
    }
    card.appendChild(btnRow);
    wrap.appendChild(card);

    saveBtn.onclick = async () => {
      const nom = fNom.querySelector("input").value.trim();
      const telephone = fTel.querySelector("input").value.trim();
      const fonction = fFonc.querySelector("input").value.trim();
      const date_naissance = fNaiss.querySelector("input").value || null;
      const photoFile = photoInput.files[0];
      if (!nom) return;
      saveBtn.disabled = true;
      let jeune;
      if (editingId) {
        jeune = await api(`/api/jeunes/${editingId}`, { method: "PUT", body: JSON.stringify({ nom, telephone, fonction, date_naissance }) });
      } else {
        jeune = await api(`/api/jeunes`, { method: "POST", body: JSON.stringify({ eglise: nomEglise, nom, telephone, fonction, date_naissance }) });
      }
      if (photoFile) {
        const fd = new FormData();
        fd.append("photo", photoFile);
        const res = await fetch(`/api/jeunes/${jeune.id}/photo`, { method: "POST", body: fd });
        if (res.ok) jeune = await res.json();
      }
      if (editingId) {
        const idx = jeunes.findIndex((j) => j.id === editingId);
        jeunes[idx] = jeune;
        editingId = null;
      } else {
        jeunes.push(jeune);
      }
      draw();
    };

    const listHead = el(`
      <div class="list-head">
        <span class="label">Jeunes enregistrés</span>
        <span class="count">${jeunes.length}</span>
      </div>
    `);
    wrap.appendChild(listHead);

    if (jeunes.length === 0) {
      wrap.appendChild(el(`<p class="empty">Aucun jeune saisi pour le moment.</p>`));
    } else {
      jeunes.forEach((j) => {
        const row = el(`
          <div class="jeune-row">
            <div class="jeune-info">
              ${avatarHtml(j)}
              <div>
                <div class="nom">${escapeHtml(j.nom)}</div>
                <div class="meta">${escapeHtml(j.telephone || "—")} · ${escapeHtml(j.fonction || "—")}</div>
              </div>
            </div>
            <div class="actions">
              <button aria-label="Modifier">✎</button>
              <button aria-label="Supprimer">🗑</button>
            </div>
          </div>
        `);
        const [editBtn, delBtn] = row.querySelectorAll("button");
        editBtn.onclick = () => { editingId = j.id; draw(); };
        delBtn.onclick = async () => {
          await api(`/api/jeunes/${j.id}`, { method: "DELETE" });
          jeunes = jeunes.filter((x) => x.id !== j.id);
          draw();
        };
        wrap.appendChild(row);
      });
    }

    app.appendChild(wrap);
  }

  draw();
}

// ================= ESPACE RESPONSABLE RÉGIONAL =================
function renderAdminPin() {
  app.innerHTML = "";
  app.appendChild(topBar("Responsable régional", renderHome));
  const wrap = el(`<div class="container"></div>`);
  wrap.appendChild(el(`<p class="lead" style="margin-bottom:16px;">Entrez le code réservé au responsable régional des jeunes.</p>`));

  const field = el(`<label class="field"><span class="label-text">Code d'accès</span><input type="password" /></label>`);
  const input = field.querySelector("input");
  wrap.appendChild(field);

  const errorBox = el(`<p class="error-text" style="display:none;"></p>`);
  wrap.appendChild(errorBox);

  const btn = el(`<button class="btn btn-primary">Entrer</button>`);
  btn.onclick = check;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
  wrap.appendChild(btn);
  app.appendChild(wrap);

  async function check() {
    const { ok } = await api("/api/admin/verify", { method: "POST", body: JSON.stringify({ pin: input.value }) });
    if (ok) renderAdminMenu();
    else {
      errorBox.textContent = "Code incorrect.";
      errorBox.style.display = "block";
    }
  }
}

function renderAdminMenu() {
  app.innerHTML = "";
  app.appendChild(topBar("Espace régional", renderHome));
  const wrap = el(`<div class="container"></div>`);

  const grid = el(`<div class="menu-grid"></div>`);
  const items = [
    { icon: "📊", label: "Tableau de bord", fn: renderDashboard },
    { icon: "📇", label: "Annuaire complet", fn: renderAnnuaire },
    { icon: "📅", label: "Programmes", fn: renderProgrammes },
    { icon: "🎂", label: "Anniversaires", fn: renderAnniversaires },
  ];
  items.forEach((it) => {
    const tile = el(`<button class="menu-tile"><div class="icon">${it.icon}</div><span class="label">${it.label}</span></button>`);
    tile.onclick = it.fn;
    grid.appendChild(tile);
  });
  wrap.appendChild(grid);
  app.appendChild(wrap);
}

// ---------- Tableau de bord (par église) ----------
async function renderDashboard() {
  app.innerHTML = "";
  app.appendChild(topBar("Tableau de bord", renderAdminMenu));
  const wrap = el(`<div class="container"><p class="empty">Chargement…</p></div>`);
  app.appendChild(wrap);

  const data = await api("/api/eglises");
  draw(data);

  function draw(data) {
    wrap.innerHTML = "";
    const stats = el(`
      <div class="stats-grid">
        <div class="stat-box" style="background:var(--ink);">
          <div class="num">${data.totalEglises}</div>
          <div class="cap">Église${data.totalEglises > 1 ? "s" : ""} ajoutée${data.totalEglises > 1 ? "s" : ""}</div>
        </div>
        <div class="stat-box" style="background:var(--gold);">
          <div class="num">${data.totalJeunes}</div>
          <div class="cap">Jeunes au total</div>
        </div>
      </div>
    `);
    wrap.appendChild(stats);
    wrap.appendChild(el(`<div class="list-head"><span class="label">Détail par église</span></div>`));

    if (data.eglises.length === 0) {
      wrap.appendChild(el(`<p class="empty">Aucune église n'a encore saisi ses jeunes.</p>`));
    } else {
      data.eglises.forEach((c) => {
        const row = el(`
          <button class="eglise-row">
            <span class="nom">${escapeHtml(c.nom)}</span>
            <span class="count">${c.nbJeunes} jeune${c.nbJeunes > 1 ? "s" : ""}</span>
          </button>
        `);
        row.onclick = () => renderChurchDetail(c.nom);
        wrap.appendChild(row);
      });
    }

    const refresh = el(`<button class="refresh-link">⟳ Actualiser</button>`);
    refresh.onclick = async () => draw(await api("/api/eglises"));
    wrap.appendChild(refresh);
  }
}

async function renderChurchDetail(nomEglise) {
  const { jeunes } = await api(`/api/jeunes?eglise=${encodeURIComponent(nomEglise)}`);
  app.innerHTML = "";
  app.appendChild(topBar(nomEglise, renderDashboard));
  const wrap = el(`<div class="container"></div>`);
  wrap.appendChild(el(`<p class="hint-text">${jeunes.length} jeune${jeunes.length > 1 ? "s" : ""}</p>`));
  if (jeunes.length === 0) {
    wrap.appendChild(el(`<p class="empty">Aucun jeune saisi pour cette église.</p>`));
  } else {
    jeunes.forEach((j) => {
      wrap.appendChild(el(`
        <div class="jeune-row">
          <div class="jeune-info">
            ${avatarHtml(j)}
            <div>
              <div class="nom">${escapeHtml(j.nom)}</div>
              <div class="meta">${escapeHtml(j.telephone || "—")} · ${escapeHtml(j.fonction || "—")}</div>
            </div>
          </div>
        </div>
      `));
    });
  }
  app.appendChild(wrap);
}

// ---------- Annuaire complet + sélection SMS ----------
async function renderAnnuaire() {
  app.innerHTML = "";
  app.appendChild(topBar("Annuaire complet", renderAdminMenu));
  const wrap = el(`<div class="container"><p class="empty">Chargement…</p></div>`);
  app.appendChild(wrap);

  const { jeunes } = await api("/api/jeunes/tous");
  const selected = new Set();
  let query = "";

  function filtered() {
    if (!query) return jeunes;
    const q = query.toLowerCase();
    return jeunes.filter((j) =>
      j.nom.toLowerCase().includes(q) ||
      (j.eglise || "").toLowerCase().includes(q) ||
      (j.fonction || "").toLowerCase().includes(q)
    );
  }

  function draw() {
    wrap.innerHTML = "";
    const search = el(`<input class="search-field" placeholder="Rechercher un nom, une église, une fonction..." />`);
    search.value = query;
    search.oninput = () => { query = search.value; draw(); };
    wrap.appendChild(search);

    const list = filtered();
    const selBar = el(`
      <div class="select-bar">
        <span>${selected.size} sélectionné${selected.size > 1 ? "s" : ""} sur ${list.length}</span>
        <a>${list.every((j) => selected.has(j.id)) && list.length ? "Tout désélectionner" : "Tout sélectionner"}</a>
      </div>
    `);
    selBar.querySelector("a").onclick = () => {
      const allSelected = list.every((j) => selected.has(j.id)) && list.length;
      list.forEach((j) => (allSelected ? selected.delete(j.id) : selected.add(j.id)));
      draw();
    };
    wrap.appendChild(selBar);

    if (list.length === 0) {
      wrap.appendChild(el(`<p class="empty">Aucun jeune trouvé.</p>`));
    } else {
      list.forEach((j) => {
        const row = el(`
          <div class="jeune-row">
            <div class="jeune-info">
              <span class="select-box"><input type="checkbox" /></span>
              ${avatarHtml(j)}
              <div>
                <div class="nom">${escapeHtml(j.nom)}</div>
                <div class="meta">${escapeHtml(j.telephone || "—")} · ${escapeHtml(j.fonction || "—")}</div>
                <span class="badge-eglise">${escapeHtml(j.eglise)}</span>
              </div>
            </div>
          </div>
        `);
        const cb = row.querySelector("input");
        cb.checked = selected.has(j.id);
        cb.onchange = () => {
          if (cb.checked) selected.add(j.id); else selected.delete(j.id);
          draw();
        };
        wrap.appendChild(row);
      });
    }

    const sticky = el(`<div class="sticky-action"></div>`);
    const smsBtn = el(`<button class="btn btn-gold" style="width:100%; justify-content:center;">✉ Envoyer un SMS groupé (${selected.size})</button>`);
    smsBtn.disabled = selected.size === 0;
    smsBtn.onclick = () => {
      const chosen = jeunes.filter((j) => selected.has(j.id));
      renderComposeSms(chosen);
    };
    sticky.appendChild(smsBtn);
    wrap.appendChild(sticky);
  }

  draw();
}

function renderComposeSms(destinataires) {
  app.innerHTML = "";
  app.appendChild(topBar("Message groupé", renderAnnuaire));
  const wrap = el(`<div class="container"></div>`);

  const avecNumero = destinataires.filter((j) => normalizePhone(j.telephone));
  const sansNumero = destinataires.length - avecNumero.length;

  wrap.appendChild(el(`<p class="hint-text">${avecNumero.length} destinataire${avecNumero.length > 1 ? "s" : ""} avec numéro${sansNumero > 0 ? ` (${sansNumero} sans numéro, ignoré${sansNumero > 1 ? "s" : ""})` : ""}.</p>`));

  const field = el(`
    <label class="field">
      <span class="label-text">Votre message</span>
      <textarea rows="5" placeholder="Écrivez le message à envoyer..." style="width:100%; border:1px solid var(--line); border-radius:6px; padding:10px 12px; font-size:15px; font-family:inherit; outline:none; resize:vertical;"></textarea>
    </label>
  `);
  wrap.appendChild(field);
  const textarea = field.querySelector("textarea");

  wrap.appendChild(el(`<p class="hint-text">Certains téléphones limitent le nombre de destinataires par SMS groupé. Le message sera donc préparé en plusieurs groupes de 10 — appuyez sur chaque bouton l'un après l'autre pour envoyer à tout le monde.</p>`));

  const groupsWrap = el(`<div></div>`);
  wrap.appendChild(groupsWrap);

  const buildBtn = el(`<button class="btn btn-gold">Préparer les groupes</button>`);
  buildBtn.onclick = () => {
    groupsWrap.innerHTML = "";
    const numbers = avecNumero.map((j) => normalizePhone(j.telephone));
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < numbers.length; i += chunkSize) chunks.push(numbers.slice(i, i + chunkSize));

    if (chunks.length === 0) {
      groupsWrap.appendChild(el(`<p class="empty">Aucun numéro valide parmi les destinataires sélectionnés.</p>`));
      return;
    }

    chunks.forEach((chunk, idx) => {
      const btn = el(`<button class="btn btn-primary" style="display:block; width:100%; justify-content:center; margin-bottom:8px;">Envoyer — groupe ${idx + 1}/${chunks.length} (${chunk.length})</button>`);
      btn.onclick = () => {
        const body = encodeURIComponent(textarea.value);
        const nums = chunk.join(",");
        window.location.href = `sms:${nums}?body=${body}`;
      };
      groupsWrap.appendChild(btn);
    });
  };
  wrap.appendChild(buildBtn);

  app.appendChild(wrap);
}

// ---------- Programmes ----------
async function renderProgrammes() {
  app.innerHTML = "";
  app.appendChild(topBar("Programmes", renderAdminMenu));
  const wrap = el(`<div class="container"><p class="empty">Chargement…</p></div>`);
  app.appendChild(wrap);

  const { programmes } = await api("/api/programmes");
  draw(programmes);

  function draw(programmes) {
    wrap.innerHTML = "";

    const card = el(`<div class="card"><div class="card-head"><span class="label">Nouveau programme</span></div></div>`);
    const fTitre = el(`<label class="field"><span class="label-text">Titre</span><input placeholder="ex. Rencontre régionale des jeunes" /></label>`);
    const fDate = el(`<label class="field"><span class="label-text">Date et heure</span><input type="datetime-local" /></label>`);
    const fLieu = el(`<label class="field"><span class="label-text">Lieu (facultatif)</span><input placeholder="ex. Église Kalima Labé" /></label>`);
    const fDesc = el(`<label class="field"><span class="label-text">Description (facultatif)</span><input placeholder="Détails du programme" /></label>`);
    card.appendChild(fTitre); card.appendChild(fDate); card.appendChild(fLieu); card.appendChild(fDesc);
    const addBtn = el(`<button class="btn btn-gold">＋ Ajouter</button>`);
    card.appendChild(addBtn);
    wrap.appendChild(card);

    addBtn.onclick = async () => {
      const titre = fTitre.querySelector("input").value.trim();
      const date_heure = fDate.querySelector("input").value;
      const lieu = fLieu.querySelector("input").value.trim();
      const description = fDesc.querySelector("input").value.trim();
      if (!titre || !date_heure) return;
      const p = await api("/api/programmes", { method: "POST", body: JSON.stringify({ titre, date_heure: new Date(date_heure).toISOString(), lieu, description }) });
      programmes.push(p);
      programmes.sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure));
      draw(programmes);
    };

    wrap.appendChild(el(`<div class="list-head"><span class="label">Programmes prévus</span></div>`));
    if (programmes.length === 0) {
      wrap.appendChild(el(`<p class="empty">Aucun programme planifié.</p>`));
    } else {
      programmes.forEach((p) => {
        const row = el(`
          <div class="programme-row">
            <div class="titre">${escapeHtml(p.titre)}</div>
            <div class="when">${formatDateTimeFr(p.date_heure)}</div>
            ${p.lieu ? `<div class="where">📍 ${escapeHtml(p.lieu)}</div>` : ""}
            ${p.description ? `<div class="desc">${escapeHtml(p.description)}</div>` : ""}
            <button class="del">Supprimer</button>
          </div>
        `);
        row.querySelector(".del").onclick = async () => {
          await api(`/api/programmes/${p.id}`, { method: "DELETE" });
          draw(programmes.filter((x) => x.id !== p.id));
        };
        wrap.appendChild(row);
      });
    }
  }
}

// ---------- Anniversaires ----------
async function renderAnniversaires() {
  app.innerHTML = "";
  app.appendChild(topBar("Anniversaires", renderAdminMenu));
  const wrap = el(`<div class="container"><p class="empty">Chargement…</p></div>`);
  app.appendChild(wrap);

  const { jeunes } = await api("/api/jeunes/tous");
  const avecDate = jeunes.filter((j) => j.date_naissance);
  const mois = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  let moisChoisi = new Date().getMonth();

  function draw() {
    wrap.innerHTML = "";
    const select = el(`<select class="search-field"></select>`);
    mois.forEach((m, i) => select.appendChild(el(`<option value="${i}" ${i === moisChoisi ? "selected" : ""}>${m}</option>`)));
    select.onchange = () => { moisChoisi = parseInt(select.value, 10); draw(); };
    wrap.appendChild(select);

    const liste = avecDate
      .filter((j) => new Date(j.date_naissance + "T00:00:00").getMonth() === moisChoisi)
      .sort((a, b) => new Date(a.date_naissance + "T00:00:00").getDate() - new Date(b.date_naissance + "T00:00:00").getDate());

    if (liste.length === 0) {
      wrap.appendChild(el(`<p class="empty">Aucun anniversaire enregistré ce mois-ci.</p>`));
    } else {
      liste.forEach((j) => {
        wrap.appendChild(el(`
          <div class="jeune-row">
            <div class="jeune-info">
              ${avatarHtml(j)}
              <div>
                <div class="nom">${escapeHtml(j.nom)}</div>
                <div class="meta">🎂 ${formatDateFr(j.date_naissance)} · ${escapeHtml(j.telephone || "—")}</div>
                <span class="badge-eglise">${escapeHtml(j.eglise)}</span>
              </div>
            </div>
          </div>
        `));
      });
    }
  }
  draw();
}

renderHome();
