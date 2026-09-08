const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "KALIMA2026";
const PHOTOS_BUCKET = "photos";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 Mo max
});

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn("⚠️  SUPABASE_URL / SUPABASE_SERVICE_KEY manquants. Voir le README.");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Vérification admin ---
app.post("/api/admin/verify", (req, res) => {
  const { pin } = req.body || {};
  res.json({ ok: pin === ADMIN_PIN });
});

// --- Protection légère des actions plus sensibles (comité, cotisations, affiches) ---
function requireAdmin(req, res, next) {
  const pin = req.headers["x-admin-pin"];
  if (!pin || pin !== ADMIN_PIN) return res.status(401).json({ error: "Accès administrateur requis" });
  next();
}

// --- Tableau de bord : liste des églises + compteurs ---
app.get("/api/eglises", async (req, res) => {
  const { data, error } = await supabase.from("jeunes").select("eglise");
  if (error) return res.status(500).json({ error: error.message });

  const counts = {};
  data.forEach((row) => {
    counts[row.eglise] = (counts[row.eglise] || 0) + 1;
  });
  const eglises = Object.entries(counts)
    .map(([nom, nbJeunes]) => ({ nom, nbJeunes }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  const totalJeunes = data.length;

  res.json({ eglises, totalEglises: eglises.length, totalJeunes });
});

// --- Jeunes d'une église précise ---
app.get("/api/jeunes", async (req, res) => {
  const eglise = (req.query.eglise || "").trim();
  if (!eglise) return res.status(400).json({ error: "Nom d'église requis" });
  const { data, error } = await supabase
    .from("jeunes")
    .select("*")
    .eq("eglise", eglise)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ eglise, jeunes: data });
});

// --- Tous les jeunes de la région (annuaire + SMS groupé + anniversaires) ---
app.get("/api/jeunes/tous", async (req, res) => {
  const { data, error } = await supabase
    .from("jeunes")
    .select("*")
    .order("eglise", { ascending: true })
    .order("nom", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ jeunes: data });
});

// --- Ajouter un jeune ---
app.post("/api/jeunes", async (req, res) => {
  const { eglise, nom, telephone, fonction, date_naissance } = req.body || {};
  if (!eglise || !eglise.trim()) return res.status(400).json({ error: "Nom d'église requis" });
  if (!nom || !nom.trim()) return res.status(400).json({ error: "Le nom du jeune est requis" });
  const { data, error } = await supabase
    .from("jeunes")
    .insert({
      eglise: eglise.trim(),
      nom: nom.trim(),
      telephone,
      fonction,
      date_naissance: date_naissance || null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- Modifier un jeune ---
app.put("/api/jeunes/:id", async (req, res) => {
  const { nom, telephone, fonction, date_naissance } = req.body || {};
  const { data, error } = await supabase
    .from("jeunes")
    .update({ nom, telephone, fonction, date_naissance: date_naissance || null })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- Supprimer un jeune ---
app.delete("/api/jeunes/:id", async (req, res) => {
  const { error } = await supabase.from("jeunes").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// --- Ajouter / remplacer la photo d'un jeune ---
app.post("/api/jeunes/:id/photo", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune photo reçue" });
  const ext = (req.file.mimetype.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const filePath = `${req.params.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(filePath);
  const photo_url = `${pub.publicUrl}?t=${Date.now()}`;

  const { data, error } = await supabase
    .from("jeunes")
    .update({ photo_url })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- Programmes / rencontres ---
app.get("/api/programmes", async (req, res) => {
  const { data, error } = await supabase
    .from("programmes")
    .select("*")
    .order("date_heure", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ programmes: data });
});

app.post("/api/programmes", requireAdmin, async (req, res) => {
  const { titre, date_heure, lieu, description } = req.body || {};
  if (!titre || !titre.trim()) return res.status(400).json({ error: "Titre requis" });
  if (!date_heure) return res.status(400).json({ error: "Date requise" });
  const { data, error } = await supabase
    .from("programmes")
    .insert({ titre: titre.trim(), date_heure, lieu, description })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/programmes/:id/affiche", requireAdmin, upload.single("affiche"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune image reçue" });
  const ext = (req.file.mimetype.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const filePath = `affiche-${req.params.id}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (uploadError) return res.status(500).json({ error: uploadError.message });
  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(filePath);
  const photo_url = `${pub.publicUrl}?t=${Date.now()}`;
  const { data, error } = await supabase.from("programmes").update({ photo_url }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/programmes/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("programmes").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ================= INSCRIPTIONS AUX PROGRAMMES =================
app.post("/api/programmes/:id/inscriptions", async (req, res) => {
  const { nom, telephone, eglise } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: "Nom requis" });
  const { data, error } = await supabase
    .from("inscriptions_programme")
    .insert({ programme_id: req.params.id, nom: nom.trim(), telephone, eglise })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/programmes/:id/inscriptions", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("inscriptions_programme")
    .select("*")
    .eq("programme_id", req.params.id)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ inscriptions: data });
});

app.get("/api/programmes/:id/inscriptions/pdf", requireAdmin, async (req, res) => {
  const { data: programme } = await supabase.from("programmes").select("titre").eq("id", req.params.id).single();
  const { data: inscriptions, error } = await supabase
    .from("inscriptions_programme")
    .select("*")
    .eq("programme_id", req.params.id)
    .order("nom", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const titre = programme ? programme.titre : "Programme";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="inscrits-${titre.replace(/[^a-z0-9]+/gi, "_")}.pdf"`);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(res);

  doc.fontSize(18).fillColor("#1F3A5F").text("Mission Kalima — Moyenne Guinée", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(14).fillColor("#22262B").text(`Liste des inscrits — ${titre}`, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor("#8A8266").text(`${inscriptions.length} inscrit${inscriptions.length > 1 ? "s" : ""} · Édité le ${new Date().toLocaleDateString("fr-FR")}`, { align: "center" });
  doc.moveDown(1.2);

  const colX = { nom: 50, tel: 250, eglise: 400 };
  function drawHeader(y) {
    doc.rect(50, y, 495, 22).fill("#1F3A5F");
    doc.fillColor("#fff").fontSize(10);
    doc.text("Nom", colX.nom + 5, y + 6, { width: 190 });
    doc.text("Téléphone", colX.tel + 5, y + 6, { width: 140 });
    doc.text("Église", colX.eglise + 5, y + 6, { width: 140 });
    return y + 22;
  }

  let y = drawHeader(doc.y);
  doc.fontSize(9);
  inscriptions.forEach((i, idx) => {
    if (y > 760) {
      doc.addPage();
      y = drawHeader(50);
    }
    if (idx % 2 === 0) doc.rect(50, y, 495, 20).fill("#F3EFE3");
    doc.fillColor("#22262B");
    doc.text(i.nom || "", colX.nom + 5, y + 5, { width: 190 });
    doc.text(i.telephone || "—", colX.tel + 5, y + 5, { width: 140 });
    doc.text(i.eglise || "—", colX.eglise + 5, y + 5, { width: 140 });
    y += 20;
  });

  if (inscriptions.length === 0) {
    doc.fillColor("#8A8266").text("Aucune inscription reçue pour ce programme.", 50, y + 10);
  }

  doc.end();
});

// ================= COMMUNIQUÉS =================
app.get("/api/communiques", async (req, res) => {
  const { data, error } = await supabase.from("communiques").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ communiques: data });
});

app.post("/api/communiques", requireAdmin, async (req, res) => {
  const { titre, contenu } = req.body || {};
  if (!titre || !contenu) return res.status(400).json({ error: "Titre et contenu requis" });
  const { data, error } = await supabase
    .from("communiques")
    .insert({ titre: titre.trim(), contenu: contenu.trim() })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/communiques/:id/affiche", requireAdmin, upload.single("affiche"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune image reçue" });
  const ext = (req.file.mimetype.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const filePath = `affiche-communique-${req.params.id}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (uploadError) return res.status(500).json({ error: uploadError.message });
  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(filePath);
  const photo_url = `${pub.publicUrl}?t=${Date.now()}`;
  const { data, error } = await supabase.from("communiques").update({ photo_url }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/communiques/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("communiques").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ================= COMITÉ =================
app.get("/api/comite", async (req, res) => {
  const { data, error } = await supabase.from("comite").select("*").order("ordre", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ membres: data });
});

app.post("/api/comite", requireAdmin, async (req, res) => {
  const { nom, fonction, telephone } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: "Le nom est requis" });
  const { data: existants } = await supabase.from("comite").select("ordre").order("ordre", { ascending: false }).limit(1);
  const ordre = existants && existants.length ? existants[0].ordre + 1 : 0;
  const { data, error } = await supabase
    .from("comite")
    .insert({ nom: nom.trim(), fonction: fonction || "", telephone: telephone || "", ordre })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/comite/:id/photo", requireAdmin, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucune photo reçue" });
  const ext = (req.file.mimetype.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const filePath = `comite-${req.params.id}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (uploadError) return res.status(500).json({ error: uploadError.message });
  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(filePath);
  const photo_url = `${pub.publicUrl}?t=${Date.now()}`;
  const { data, error } = await supabase.from("comite").update({ photo_url }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/comite/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("comite").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ================= COTISATION RÉGIONALE (par église, gérée par le responsable régional) =================
app.get("/api/eglises/resume-cotisations", requireAdmin, async (req, res) => {
  const [{ data: jeunes }, { data: objectifs }, { data: versements }] = await Promise.all([
    supabase.from("jeunes").select("eglise"),
    supabase.from("objectifs_eglise").select("*"),
    supabase.from("versements_eglise").select("eglise, montant"),
  ]);
  const eglisesSet = new Set([
    ...(jeunes || []).map((j) => j.eglise),
    ...(objectifs || []).map((o) => o.eglise),
  ]);
  const resume = [...eglisesSet].sort((a, b) => a.localeCompare(b)).map((eglise) => {
    const nbJeunes = (jeunes || []).filter((j) => j.eglise === eglise).length;
    const objectif = (objectifs || []).find((o) => o.eglise === eglise);
    const totalVerse = (versements || []).filter((v) => v.eglise === eglise).reduce((s, v) => s + Number(v.montant), 0);
    return { eglise, nbJeunes, montantCible: objectif ? Number(objectif.montant_cible) : 0, totalVerse };
  });
  res.json({ eglises: resume });
});

app.put("/api/eglises/:eglise/objectif", requireAdmin, async (req, res) => {
  const eglise = req.params.eglise;
  const { montant_cible } = req.body || {};
  const { data, error } = await supabase
    .from("objectifs_eglise")
    .upsert({ eglise, montant_cible: Number(montant_cible) || 0 }, { onConflict: "eglise" })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  const { error: resetError } = await supabase.from("versements_eglise").delete().eq("eglise", eglise);
  if (resetError) return res.status(500).json({ error: resetError.message });
  res.json(data);
});

// Consultable par l'église elle-même (même niveau de confiance que sa liste de jeunes)
app.get("/api/eglises/:eglise/cotisation", async (req, res) => {
  const eglise = req.params.eglise;
  const [{ data: objectifs }, { data: versements }] = await Promise.all([
    supabase.from("objectifs_eglise").select("*").eq("eglise", eglise),
    supabase.from("versements_eglise").select("*").eq("eglise", eglise).order("date_versement", { ascending: false }),
  ]);
  const montantCible = objectifs && objectifs.length ? Number(objectifs[0].montant_cible) : 0;
  const totalVerse = (versements || []).reduce((s, v) => s + Number(v.montant), 0);
  res.json({ montantCible, totalVerse, versements: versements || [] });
});

app.post("/api/eglises/:eglise/versements", requireAdmin, async (req, res) => {
  const eglise = req.params.eglise;
  const { montant, date_versement, note } = req.body || {};
  if (!montant || Number(montant) <= 0) return res.status(400).json({ error: "Montant requis" });
  const { data, error } = await supabase
    .from("versements_eglise")
    .insert({
      eglise,
      montant: Number(montant),
      date_versement: date_versement || new Date().toISOString().slice(0, 10),
      note: note || null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/eglises/:eglise/versements/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("versements_eglise")
    .delete()
    .eq("id", req.params.id)
    .eq("eglise", req.params.eglise);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete("/api/eglises/:eglise/versements", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("versements_eglise").delete().eq("eglise", req.params.eglise);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ================= SESSIONS DE COTISATION EXCEPTIONNELLE (internes à chaque église) =================
// Le responsable régional n'a accès à rien ici : ces routes ne demandent pas le code
// admin, seulement le nom de l'église, exactement comme pour la gestion des jeunes.
app.get("/api/mon-eglise/:eglise/sessions", async (req, res) => {
  const { data, error } = await supabase
    .from("sessions_cotisation")
    .select("*")
    .eq("eglise", req.params.eglise)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sessions: data });
});

app.post("/api/mon-eglise/:eglise/sessions", async (req, res) => {
  const { titre, montant_cible } = req.body || {};
  if (!titre || !titre.trim()) return res.status(400).json({ error: "Titre requis" });
  const { data, error } = await supabase
    .from("sessions_cotisation")
    .insert({ eglise: req.params.eglise, titre: titre.trim(), montant_cible: montant_cible ? Number(montant_cible) : null })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/sessions/:id", async (req, res) => {
  const [{ data: session, error: sessionError }, { data: contributions, error: contribError }] = await Promise.all([
    supabase.from("sessions_cotisation").select("*").eq("id", req.params.id).single(),
    supabase.from("contributions_session").select("*").eq("session_id", req.params.id).order("created_at", { ascending: false }),
  ]);
  if (sessionError) return res.status(404).json({ error: "Session introuvable" });
  if (contribError) return res.status(500).json({ error: contribError.message });
  const total = (contributions || []).reduce((s, c) => s + Number(c.montant), 0);
  res.json({ session, contributions: contributions || [], total });
});

app.post("/api/sessions/:id/contributions", async (req, res) => {
  const { jeune_id, jeune_nom, montant, date_contribution } = req.body || {};
  if (!jeune_nom || !montant || Number(montant) <= 0) return res.status(400).json({ error: "Jeune et montant requis" });
  const { data, error } = await supabase
    .from("contributions_session")
    .insert({
      session_id: req.params.id,
      jeune_id: jeune_id || null,
      jeune_nom,
      montant: Number(montant),
      date_contribution: date_contribution || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/sessions/:sessionId/contributions/:id", async (req, res) => {
  const { error } = await supabase
    .from("contributions_session")
    .delete()
    .eq("id", req.params.id)
    .eq("session_id", req.params.sessionId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete("/api/sessions/:id", async (req, res) => {
  const { error } = await supabase.from("sessions_cotisation").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Kalima Jeunes en écoute sur le port ${PORT}`);
});
