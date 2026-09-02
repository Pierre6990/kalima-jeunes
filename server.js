const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");

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

app.post("/api/programmes", async (req, res) => {
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

app.delete("/api/programmes/:id", async (req, res) => {
  const { error } = await supabase.from("programmes").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Kalima Jeunes en écoute sur le port ${PORT}`);
});
