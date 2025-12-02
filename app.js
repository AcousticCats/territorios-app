// ======================
// CONFIGURAÇÃO FIREBASE
// ======================
const firebaseConfig = {
  apiKey: "AIzaSyAgC7Kij9qrnq2CHzzMTRefp01jpdxGYiU",
  authDomain: "controle-territ.firebaseapp.com",
  projectId: "controle-territ",
  storageBucket: "controle-territ.firebasestorage.app",
  messagingSenderId: "669171529346",
  appId: "1:669171529346:web:2a1a40afa0e3b58c28e69b",
  measurementId: "G-VTKRFWLERS",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ======================
// UTILIDADES
// ======================
function $(id) { return document.getElementById(id); }

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  const el = $(screenId);
  if (el) el.classList.remove("hidden");
}

function setTab(tab) {
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
}

function getUrlParam(name) {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  } catch {
    return null;
  }
}

function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatDateTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialsFromName(name) {
  if (!name) return "S";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ======================
// ESTADO GLOBAL
// ======================
let currentUser = null;
let currentRole = null;
let currentCongregationId = null;
let currentCongregation = null;

let territoriesUnsub = null;
let movementsUnsub = null;

let territoriesCache = [];
let movementsCache = [];
let currentFilter = "all";

let profileName = localStorage.getItem("territorios_profile_name") || "";

let mapCanvas = null;
let mapCtx = null;
let drawing = false;
let currentMapTerritory = null;
let currentNotesTerritory = null;

// ======================
// INICIALIZAÇÃO
// ======================
window.addEventListener("load", () => {
  const headerInitials = $("header-user-initials");
  const profileInput = $("profile-name-input");

  if (profileName) {
    profileInput.value = profileName;
    headerInitials.textContent = initialsFromName(profileName);
  }

  // Tabs
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // Filtros
  document.querySelectorAll(".chip-filter").forEach((chip) => {
    chip.addEventListener("click", () => {
      document
        .querySelectorAll(".chip-filter")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      renderTerritories();
    });
  });

  // Botões principais
  $("btn-admin-login").addEventListener("click", handleAdminLogin);
  $("btn-guest-enter").addEventListener("click", handleGuestEnter);
  $("btn-save-profile-name").addEventListener("click", saveProfileName);
  $("btn-logout").addEventListener("click", handleLogout);

  // Primeira congregação
  $("btn-first-cong-cancel").addEventListener("click", () => {
    $("first-cong-modal").classList.add("hidden");
    auth.signOut();
    showScreen("mode-screen");
  });
  $("btn-first-cong-save").addEventListener("click", createFirstCongregation);

  // Notas
  $("btn-notes-cancel").addEventListener("click", () => {
    $("notes-modal").classList.add("hidden");
    currentNotesTerritory = null;
  });
  $("btn-notes-save").addEventListener("click", saveNotes);

  // Relatórios
  $("btn-reports-print").addEventListener("click", () => window.print());

  // Admin
  $("btn-save-admin-settings").addEventListener("click", saveAdminSettings);
  $("btn-territory-minus").addEventListener("click", () => adjustTerritoryCount(-1));
  $("btn-territory-plus").addEventListener("click", () => adjustTerritoryCount(1));
  $("btn-save-territory-count").addEventListener("click", saveTerritoryCount);
  $("btn-open-invite").addEventListener("click", openInviteModal);

  // Invite
  $("btn-invite-close").addEventListener("click", () => {
    $("invite-modal").classList.add("hidden");
  });
  $("btn-copy-invite").addEventListener("click", () => {
    const link = $("invite-link-input").value;
    navigator.clipboard
      .writeText(link)
      .then(() => alert("Link copiado para a área de transferência."))
      .catch(() => alert("Não foi possível copiar. Copie manualmente."));
  });
  $("btn-invite-whatsapp").addEventListener("click", () => {
    const link = $("invite-link-input").value;
    const txt = `Convite para o app de territórios: ${link}`;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  });

  // Mapa
  mapCanvas = $("map-canvas");
  if (mapCanvas) {
    mapCtx = mapCanvas.getContext("2d");
    mapCanvas.addEventListener("mousedown", startDrawing);
    mapCanvas.addEventListener("mousemove", drawOnCanvas);
    mapCanvas.addEventListener("mouseup", stopDrawing);
    mapCanvas.addEventListener("mouseleave", stopDrawing);
    mapCanvas.addEventListener("touchstart", startDrawing, { passive: false });
    mapCanvas.addEventListener("touchmove", drawOnCanvas, { passive: false });
    mapCanvas.addEventListener("touchend", stopDrawing, { passive: false });
  }

  $("btn-map-close").addEventListener("click", () => {
    $("map-modal").classList.add("hidden");
    currentMapTerritory = null;
  });
  $("btn-map-clear").addEventListener("click", clearMapDrawing);
  $("btn-map-save").addEventListener("click", saveMapDrawing);
  $("btn-map-google").addEventListener("click", openMapGoogle);
  $("btn-map-config").addEventListener("click", () => {
    if (currentRole !== "admin") {
      alert("Somente o ancião (admin) pode configurar o mapa.");
      return;
    }
    openMapConfigModal();
  });

  $("btn-map-config-cancel").addEventListener("click", () => {
    $("map-config-modal").classList.add("hidden");
  });
  $("btn-map-config-save").addEventListener("click", saveMapConfig);

  auth.onAuthStateChanged(handleAuthStateChanged);
  showScreen("loading-screen");
});

// ======================
// AUTH / LOGIN
// ======================
async function handleAdminLogin() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.error(err);
    alert("Erro ao entrar com Google: " + err.message);
  }
}

async function handleGuestEnter() {
  const rawCode = $("invite-code-input").value.trim();
  const guestName = $("guest-name-input").value.trim();

  if (!rawCode) {
    alert("Cole o link ou código da congregação.");
    return;
  }
  if (!guestName) {
    alert("Digite seu nome.");
    return;
  }

  let cid = rawCode;
  const match = rawCode.match(/[?&]cid=([a-zA-Z0-9_-]+)/);
  if (match) cid = match[1];

  profileName = guestName;
  localStorage.setItem("territorios_profile_name", guestName);
  $("profile-name-input").value = guestName;
  $("header-user-initials").textContent = initialsFromName(guestName);

  const url = new URL(window.location.href);
  url.searchParams.set("cid", cid);
  window.history.replaceState({}, "", url.toString());

  try {
    await auth.signInAnonymously();
  } catch (err) {
    console.error(err);
    alert("Erro ao entrar como publicador: " + err.message);
  }
}

async function handleLogout() {
  try {
    await auth.signOut();
  } catch (err) {
    console.error(err);
  }
  clearRealtime();
  currentUser = null;
  currentRole = null;
  currentCongregationId = null;
  currentCongregation = null;
  showScreen("mode-screen");
}

function clearRealtime() {
  if (territoriesUnsub) territoriesUnsub();
  if (movementsUnsub) movementsUnsub();
  territoriesUnsub = null;
  movementsUnsub = null;
  territoriesCache = [];
  movementsCache = [];
}

// ======================
// AUTH STATE
// ======================
async function handleAuthStateChanged(user) {
  const loading = $("loading-screen");
  const adminSettings = $("admin-only-settings");
  const headerCongName = $("header-cong-name");

  currentUser = user;

  if (!user) {
    clearRealtime();
    if (adminSettings) adminSettings.classList.add("hidden");
    showScreen("mode-screen");
    if (loading) loading.classList.add("hidden");
    return;
  }

  const cidFromUrl = getUrlParam("cid");

  if (user.isAnonymous) {
    currentRole = "guest";
    if (!cidFromUrl) {
      alert("Link de convite inválido. Falta o código da congregação (cid).");
      await auth.signOut();
      return;
    }

    currentCongregationId = cidFromUrl;
    await loadCongregation();
    await ensureGuestMember();

    if (headerCongName && currentCongregation) {
      headerCongName.textContent = currentCongregation.name || "";
    }
    if (adminSettings) adminSettings.classList.add("hidden");
    setupRealtime();
    setTab("territories");
    showScreen("main-screen");
    if (loading) loading.classList.add("hidden");
  } else {
    currentRole = "admin";
    if (adminSettings) adminSettings.classList.remove("hidden");

    const snap = await db
      .collection("congregations")
      .where("ownerUid", "==", user.uid)
      .limit(1)
      .get();

    if (snap.empty) {
      showScreen("main-screen");
      $("first-cong-modal").classList.remove("hidden");
      if (loading) loading.classList.add("hidden");
      return;
    }

    const doc = snap.docs[0];
    currentCongregationId = doc.id;
    currentCongregation = { id: doc.id, ...doc.data() };

    if (headerCongName) headerCongName.textContent = currentCongregation.name || "";
    $("settings-cong-name").value = currentCongregation.name || "";
    $("settings-admin-password").value = currentCongregation.adminPassword || "1234";
    $("territory-count-label").textContent = currentCongregation.territoryCount || 25;

    setupRealtime();
    setTab("territories");
    showScreen("main-screen");
    if (loading) loading.classList.add("hidden");
  }
}

// ======================
// CONGREGAÇÃO
// ======================
async function createFirstCongregation() {
  const name = $("first-cong-name").value.trim();
  if (!name) {
    alert("Digite o nome da congregação.");
    return;
  }
  if (!currentUser) {
    alert("Usuário não autenticado.");
    return;
  }

  try {
    const congRef = await db.collection("congregations").add({
      name,
      ownerUid: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      territoryCount: 25,
      adminPassword: "1234",
    });

    currentCongregationId = congRef.id;
    currentCongregation = {
      id: congRef.id,
      name,
      territoryCount: 25,
      adminPassword: "1234",
    };

    $("first-cong-modal").classList.add("hidden");
    $("header-cong-name").textContent = name;
    $("settings-cong-name").value = name;
    $("settings-admin-password").value = "1234";
    $("territory-count-label").textContent = "25";

    const batch = db.batch();
    for (let i = 1; i <= 25; i++) {
      const ref = congRef.collection("territories").doc(String(i));
      batch.set(ref, {
        number: i,
        status: "FREE",
        lastTakenBy: null,
        lastTakenAt: null,
        lastReturnedBy: null,
        lastReturnedAt: null,
        usageCount: 0,
        notes: "",
        hasNotes: false,
        mapImageUrl: "",
        googleMapsUrl: "",
        overlayDataUrl: "",
        active: true,
      });
    }
    await batch.commit();

    setupRealtime();
    setTab("territories");
  } catch (err) {
    console.error(err);
    alert("Erro ao criar congregação: " + err.message);
  }
}

async function loadCongregation() {
  if (!currentCongregationId) return;
  const doc = await db.collection("congregations").doc(currentCongregationId).get();
  if (!doc.exists) {
    alert("Congregação não encontrada. Verifique o link de convite.");
    return;
  }
  currentCongregation = { id: doc.id, ...doc.data() };

  $("header-cong-name").textContent = currentCongregation.name || "";
  $("settings-cong-name").value = currentCongregation.name || "";
  $("settings-admin-password").value = currentCongregation.adminPassword || "1234";
  $("territory-count-label").textContent = currentCongregation.territoryCount || 25;
}

async function ensureGuestMember() {
  if (!currentUser || !currentUser.isAnonymous || !currentCongregationId) return;

  const memberRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("members")
    .doc(currentUser.uid);

  const doc = await memberRef.get();
  if (!doc.exists) {
    await memberRef.set({
      uid: currentUser.uid,
      name: profileName || "Publicador",
      role: "publisher",
      joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else if (profileName && doc.data().name !== profileName) {
    await memberRef.update({ name: profileName });
  }
}

// ======================
// TEMPO REAL
// ======================
function setupRealtime() {
  clearRealtime();
  if (!currentCongregationId) return;

  const terrCol = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories");

  const movCol = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("movements");

  territoriesUnsub = terrCol.orderBy("number").onSnapshot((snap) => {
    territoriesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTerritories();
  });

  movementsUnsub = movCol
    .orderBy("timestamp", "desc")
    .limit(200)
    .onSnapshot((snap) => {
      movementsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderReports();
    });
}

// ======================
// PERFIL
// ======================
function saveProfileName() {
  const name = $("profile-name-input").value.trim();
  if (!name) {
    alert("Digite seu nome.");
    return;
  }
  profileName = name;
  localStorage.setItem("territorios_profile_name", name);
  $("header-user-initials").textContent = initialsFromName(name);
  alert("Nome salvo.");
}

// ======================
// TERRITÓRIOS
// ======================
function renderTerritories() {
  const container = $("territories-list");
  container.innerHTML = "";

  if (!territoriesCache.length) {
    container.innerHTML = "<p class='small'>Nenhum território cadastrado ainda.</p>";
    return;
  }

  let list = territoriesCache.filter((t) => t.active !== false);

  if (currentFilter === "in_use") list = list.filter((t) => t.status === "IN_USE");
  else if (currentFilter === "free") list = list.filter((t) => t.status === "FREE");
  else if (currentFilter === "less_used") {
    list = [...list].sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
  }

  list.forEach((terr) => {
    const card = document.createElement("div");
    card.className = "territory-card";

    const header = document.createElement("div");
    header.className = "territory-header";

    const title = document.createElement("div");
    title.className = "territory-title";
    title.textContent = `Território ${terr.number}`;

    const status = document.createElement("div");
    const inUse = terr.status === "IN_USE";
    status.className = "territory-status " + (inUse ? "status-inuse" : "status-free");
    status.innerHTML = `
      <span class="status-dot"></span>
      <span>${inUse ? "EM USO" : "LIVRE"}</span>
    `;

    header.appendChild(title);
    header.appendChild(status);

    const meta = document.createElement("div");
    meta.className = "territory-meta";

    let metaText = "";
    if (terr.lastTakenBy && terr.lastTakenAt) {
      metaText += `Pegado por ${terr.lastTakenBy} em ${formatDateTime(terr.lastTakenAt)}`;
    }
    if (terr.lastReturnedBy && terr.lastReturnedAt) {
      metaText += metaText ? " · " : "";
      metaText += `Devolvido por ${terr.lastReturnedBy} em ${formatDateTime(terr.lastReturnedAt)}`;
    }
    if (!metaText) metaText = "Ainda sem movimentações.";
    meta.textContent = metaText;

    const actions = document.createElement("div");
    actions.className = "territory-actions";

    const mainBtn = document.createElement("button");
    mainBtn.className = "btn " + (inUse ? "danger" : "primary");
    mainBtn.textContent = inUse ? "Devolver" : "Pegar";
    mainBtn.addEventListener("click", () => toggleTerritory(terr, !inUse));

    const mapBtn = document.createElement("button");
    mapBtn.className = "btn secondary";
    mapBtn.innerHTML = "🗺️";
    mapBtn.addEventListener("click", () => openMapModal(terr));

    const notesBtn = document.createElement("button");
    notesBtn.className = "btn ghost";
    notesBtn.innerHTML = "💬";
    notesBtn.addEventListener("click", () => openNotesModal(terr));

    actions.appendChild(mainBtn);
    actions.appendChild(mapBtn);
    actions.appendChild(notesBtn);

    if (terr.hasNotes) {
      const light = document.createElement("div");
      light.className = "notes-indicator";
      actions.appendChild(light);
    }

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

async function toggleTerritory(territory, willTake) {
  if (!currentCongregationId) return;
  if (!profileName) {
    alert("Antes salve seu nome em Configurar > Seu Perfil.");
    return;
  }

  const actionText = willTake ? "pegar" : "devolver";
  if (!confirm(`Confirmar ${actionText} o Território ${territory.number}?`)) return;

  const terrRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories")
    .doc(String(territory.number));

  const movRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("movements")
    .doc();

  try {
    await db.runTransaction(async (tx) => {
      const terrDoc = await tx.get(terrRef);
      if (!terrDoc.exists) throw new Error("Território não encontrado.");
      const terrData = terrDoc.data();
      const now = firebase.firestore.FieldValue.serverTimestamp();

      if (willTake) {
        tx.update(terrRef, {
          status: "IN_USE",
          lastTakenBy: profileName,
          lastTakenAt: now,
        });
        tx.set(movRef, {
          type: "PEGO",
          territoryNumber: territory.number,
          publisherName: profileName,
          timestamp: now,
        });
      } else {
        tx.update(terrRef, {
          status: "FREE",
          lastReturnedBy: profileName,
          lastReturnedAt: now,
          usageCount: (terrData.usageCount || 0) + 1,
        });
        tx.set(movRef, {
          type: "DEVOLVIDO",
          territoryNumber: territory.number,
          publisherName: profileName,
          timestamp: now,
        });
      }
    });
  } catch (err) {
    console.error(err);
    alert("Erro ao atualizar território: " + err.message);
  }
}

// ======================
// NOTAS
// ======================
function openNotesModal(territory) {
  currentNotesTerritory = territory;
  $("notes-territory-label").textContent = territory.number;
  $("notes-text").value = territory.notes || "";
  $("notes-modal").classList.remove("hidden");
}

async function saveNotes() {
  if (!currentNotesTerritory || !currentCongregationId) return;
  const text = $("notes-text").value.trim();

  const terrRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories")
    .doc(String(currentNotesTerritory.number));

  try {
    await terrRef.update({
      notes: text,
      hasNotes: !!text,
    });
    $("notes-modal").classList.add("hidden");
    currentNotesTerritory = null;
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar observações: " + err.message);
  }
}

// ======================
// MAPA
// ======================
function openMapModal(territory) {
  currentMapTerritory = territory;
  $("map-territory-label").textContent = territory.number;

  const img = $("map-image");
  img.src =
    territory.mapImageUrl ||
    "https://via.placeholder.com/800x800.png?text=Mapa+do+Territ%C3%B3rio";

  img.onload = () => {
    requestAnimationFrame(() => {
      mapCanvas.width = img.clientWidth || img.naturalWidth;
      mapCanvas.height = img.clientHeight || img.naturalHeight;
      mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

      if (territory.overlayDataUrl) {
        const overlay = new Image();
        overlay.onload = () => {
          mapCtx.drawImage(overlay, 0, 0, mapCanvas.width, mapCanvas.height);
        };
        overlay.src = territory.overlayDataUrl;
      }
    });
  };

  $("map-modal").classList.remove("hidden");
}

function canvasPos(evt) {
  const rect = mapCanvas.getBoundingClientRect();
  let clientX, clientY;
  if (evt.touches && evt.touches[0]) {
    clientX = evt.touches[0].clientX;
    clientY = evt.touches[0].clientY;
  } else {
    clientX = evt.clientX;
    clientY = evt.clientY;
  }
  return {
    x: ((clientX - rect.left) / rect.width) * mapCanvas.width,
    y: ((clientY - rect.top) / rect.height) * mapCanvas.height,
  };
}

function startDrawing(evt) {
  evt.preventDefault();
  if (!mapCtx) return;
  drawing = true;
  const pos = canvasPos(evt);
  mapCtx.strokeStyle = "rgba(255,0,0,0.9)";
  mapCtx.lineWidth = 3;
  mapCtx.lineCap = "round";
  mapCtx.beginPath();
  mapCtx.moveTo(pos.x, pos.y);
}

function drawOnCanvas(evt) {
  if (!drawing || !mapCtx) return;
  evt.preventDefault();
  const pos = canvasPos(evt);
  mapCtx.lineTo(pos.x, pos.y);
  mapCtx.stroke();
}

function stopDrawing(evt) {
  evt && evt.preventDefault();
  drawing = false;
}

function clearMapDrawing() {
  if (!mapCanvas || !mapCtx) return;
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
}

async function saveMapDrawing() {
  if (!currentMapTerritory || !currentCongregationId) return;
  const dataUrl = mapCanvas.toDataURL("image/png");

  const terrRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories")
    .doc(String(currentMapTerritory.number));

  try {
    await terrRef.update({ overlayDataUrl: dataUrl });
    alert("Rabiscos salvos.");
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar rabiscos: " + err.message);
  }
}

function openMapGoogle() {
  if (!currentMapTerritory || !currentMapTerritory.googleMapsUrl) {
    alert("Nenhum link do Google Maps configurado para este território.");
    return;
  }
  window.open(currentMapTerritory.googleMapsUrl, "_blank");
}

// ======================
// CONFIG MAPA
// ======================
function openMapConfigModal() {
  if (!currentMapTerritory || !currentCongregation) return;

  $("map-config-password").value = "";
  $("map-config-image-url").value = currentMapTerritory.mapImageUrl || "";
  $("map-config-google-url").value = currentMapTerritory.googleMapsUrl || "";
  $("map-config-modal").classList.remove("hidden");
}

async function saveMapConfig() {
  if (!currentMapTerritory || !currentCongregationId || !currentCongregation) return;

  const pwd = $("map-config-password").value.trim();
  const imgUrl = $("map-config-image-url").value.trim();
  const gmapsUrl = $("map-config-google-url").value.trim();

  const expected = currentCongregation.adminPassword || "1234";
  if (!pwd || pwd !== expected) {
    alert("Senha do admin incorreta.");
    return;
  }

  const terrRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories")
    .doc(String(currentMapTerritory.number));

  try {
    await terrRef.update({
      mapImageUrl: imgUrl,
      googleMapsUrl: gmapsUrl,
    });
    currentMapTerritory.mapImageUrl = imgUrl;
    currentMapTerritory.googleMapsUrl = gmapsUrl;
    $("map-config-modal").classList.add("hidden");
    alert("Mapa atualizado.");
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar mapa: " + err.message);
  }
}

// ======================
// RELATÓRIOS
// ======================
function renderReports() {
  const select = $("reports-month-select");
  const body = $("reports-body");

  const monthsSet = new Set();
  movementsCache.forEach((m) => {
    if (!m.timestamp) return;
    monthsSet.add(monthKey(m.timestamp.toDate()));
  });
  const months = Array.from(monthsSet).sort().reverse();

  select.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "Todos os meses";
  select.appendChild(optAll);

  months.forEach((mk) => {
    const [y, m] = mk.split("-");
    const opt = document.createElement("option");
    opt.value = mk;
    opt.textContent = `${m}/${y}`;
    select.appendChild(opt);
  });

  select.onchange = renderReportsTable;
  renderReportsTable();
}

function renderReportsTable() {
  const body = $("reports-body");
  const select = $("reports-month-select");
  const monthFilter = select.value || "all";
  body.innerHTML = "";

  let rows = movementsCache;
  if (monthFilter !== "all") {
    rows = rows.filter((m) => {
      if (!m.timestamp) return false;
      return monthKey(m.timestamp.toDate()) === monthFilter;
    });
  }

  rows.forEach((m) => {
    const tr = document.createElement("tr");
    const tdDate = document.createElement("td");
    const tdTerr = document.createElement("td");
    const tdPub = document.createElement("td");
    const tdAction = document.createElement("td");

    tdDate.textContent = formatDateTime(m.timestamp);
    tdTerr.textContent = `Território ${m.territoryNumber}`;
    tdPub.textContent = m.publisherName || "";
    tdAction.textContent = m.type === "PEGO" ? "Pegou" : "Devolveu";

    tr.appendChild(tdDate);
    tr.appendChild(tdTerr);
    tr.appendChild(tdPub);
    tr.appendChild(tdAction);
    body.appendChild(tr);
  });
}

// ======================
// CONFIGURAÇÕES ADMIN
// ======================
async function saveAdminSettings() {
  if (currentRole !== "admin" || !currentCongregationId || !currentCongregation) return;

  const name = $("settings-cong-name").value.trim();
  const pwd = $("settings-admin-password").value.trim() || "1234";

  try {
    await db.collection("congregations").doc(currentCongregationId).update({
      name,
      adminPassword: pwd,
    });
    currentCongregation.name = name;
    currentCongregation.adminPassword = pwd;
    $("header-cong-name").textContent = name;
    alert("Configurações salvas.");
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar configurações: " + err.message);
  }
}

function adjustTerritoryCount(delta) {
  const label = $("territory-count-label");
  let val = parseInt(label.textContent || "25", 10);
  val += delta;
  val = Math.max(1, Math.min(200, val));
  label.textContent = String(val);
}

async function saveTerritoryCount() {
  if (currentRole !== "admin" || !currentCongregationId || !currentCongregation) return;

  const newCount = parseInt($("territory-count-label").textContent, 10);
  if (!newCount || newCount < 1) {
    alert("Quantidade inválida.");
    return;
  }

  const congRef = db.collection("congregations").doc(currentCongregationId);
  const terrCol = congRef.collection("territories");

  try {
    await db.runTransaction(async (tx) => {
      const congDoc = await tx.get(congRef);
      const oldCount = congDoc.data().territoryCount || 25;
      if (newCount === oldCount) return;

      if (newCount > oldCount) {
        for (let i = oldCount + 1; i <= newCount; i++) {
          const ref = terrCol.doc(String(i));
          tx.set(ref, {
            number: i,
            status: "FREE",
            lastTakenBy: null,
            lastTakenAt: null,
            lastReturnedBy: null,
            lastReturnedAt: null,
            usageCount: 0,
            notes: "",
            hasNotes: false,
            mapImageUrl: "",
            googleMapsUrl: "",
            overlayDataUrl: "",
            active: true,
          });
        }
      } else {
        for (let i = newCount + 1; i <= oldCount; i++) {
          const ref = terrCol.doc(String(i));
          tx.update(ref, { active: false });
        }
      }
      tx.update(congRef, { territoryCount: newCount });
    });

    currentCongregation.territoryCount = newCount;
    alert("Quantidade de territórios atualizada.");
  } catch (err) {
    console.error(err);
    alert("Erro ao atualizar quantidade: " + err.message);
  }
}

// ======================
// CONVITES
// ======================
function openInviteModal() {
  if (!currentCongregationId) {
    alert("Congregação não carregada.");
    return;
  }
  const baseUrl = window.location.origin + window.location.pathname;
  const link = `${baseUrl}?cid=${currentCongregationId}`;

  $("invite-link-input").value = link;
  $("invite-qr-image").src =
    "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" +
    encodeURIComponent(link);

  $("invite-modal").classList.remove("hidden");
}
