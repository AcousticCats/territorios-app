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

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===============
// VARIÁVEIS GLOBAIS
// ===============

let currentUser = null; // objeto auth
let currentRole = null; // "admin" ou "guest"
let currentCongregationId = null;
let currentCongregation = null;
let territoriesUnsubscribe = null;
let movementsUnsubscribe = null;
let currentFilter = "all";
let drawing = false;
let mapCanvas, mapCtx;
let profileName = localStorage.getItem("territorios_profile_name") || "";

// MAPA: território atual / doc atual
let currentMapTerritoryId = null;
let currentMapTerritoryData = null;

// ==================
// FUNÇÕES DE AJUDA
// ==================

function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  const screens = document.querySelectorAll(".screen");
  screens.forEach((s) => s.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function setTab(tab) {
  document
    .querySelectorAll(".tab-button")
    .forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.tab === tab)
    );
  document
    .querySelectorAll(".tab-panel")
    .forEach((panel) =>
      panel.classList.toggle("active", panel.id === "tab-" + tab)
    );
}

function getUrlParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
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
// FLUXO DE INICIALIZAÇÃO
// ======================

window.addEventListener("load", () => {
  // Elementos básicos
  const loadingScreen = $("loading-screen");
  const modeScreen = $("mode-screen");
  const mainScreen = $("main-screen");
  const headerCongName = $("header-cong-name");
  const headerUserInitials = $("header-user-initials");

  // Preenche nome de perfil se existir
  if (profileName) {
    $("profile-name-input").value = profileName;
    headerUserInitials.textContent = initialsFromName(profileName);
  }

  // Tabs
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTab(btn.dataset.tab);
    });
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

  // Botões de modo
  $("btn-admin-login").addEventListener("click", handleAdminLoginClick);
  $("btn-guest-enter").addEventListener("click", handleGuestEnterClick);

  // Perfil
  $("btn-save-profile-name").addEventListener("click", () => {
    const name = $("profile-name-input").value.trim();
    if (!name) {
      alert("Digite seu nome.");
      return;
    }
    profileName = name;
    localStorage.setItem("territorios_profile_name", name);
    headerUserInitials.textContent = initialsFromName(name);
    alert("Nome salvo.");
  });

  // Relatórios
  $("btn-reports-print").addEventListener("click", () => {
    window.print();
  });

  // Logout
  $("btn-logout").addEventListener("click", async () => {
    await auth.signOut();
    currentUser = null;
    currentRole = null;
    currentCongregationId = null;
    currentCongregation = null;
    if (territoriesUnsubscribe) territoriesUnsubscribe();
    if (movementsUnsubscribe) movementsUnsubscribe();
    showScreen("mode-screen");
  });

  // Admin settings
  $("btn-save-admin-settings").addEventListener("click", saveAdminSettings);
  $("btn-territory-minus").addEventListener("click", () =>
    adjustTerritoryCount(-1)
  );
  $("btn-territory-plus").addEventListener("click", () =>
    adjustTerritoryCount(1)
  );
  $("btn-save-territory-count").addEventListener("click", saveTerritoryCount);
  $("btn-open-invite").addEventListener("click", openInviteModal);

  // Primeira congregação modal
  $("btn-first-cong-cancel").addEventListener("click", () => {
    $("first-cong-modal").classList.add("hidden");
    auth.signOut();
    showScreen("mode-screen");
  });
  $("btn-first-cong-save").addEventListener("click", createFirstCongregation);

  // Notas
  $("btn-notes-cancel").addEventListener("click", () => {
    $("notes-modal").classList.add("hidden");
  });
  $("btn-notes-save").addEventListener("click", saveNotes);

  // Map modal
  mapCanvas = $("map-canvas");
  mapCtx = mapCanvas.getContext("2d");

  $("btn-map-close").addEventListener("click", () => {
    $("map-modal").classList.add("hidden");
  });
  $("btn-map-clear").addEventListener("click", clearMapDrawing);
  $("btn-map-save").addEventListener("click", saveMapDrawing);
  $("btn-map-google").addEventListener("click", () => {
    if (currentMapTerritoryData && currentMapTerritoryData.googleMapsUrl) {
      window.open(currentMapTerritoryData.googleMapsUrl, "_blank");
    } else {
      alert("Nenhum link do Google Maps configurado para este território.");
    }
  });
  $("btn-map-config").addEventListener("click", () => {
    if (currentRole !== "admin") {
      alert("Somente o admin pode configurar o mapa.");
      return;
    }
    openMapConfigModal();
  });

  // Desenho no mapa
  mapCanvas.addEventListener("mousedown", startDrawing);
  mapCanvas.addEventListener("mousemove", draw);
  mapCanvas.addEventListener("mouseup", stopDrawing);
  mapCanvas.addEventListener("mouseleave", stopDrawing);
  mapCanvas.addEventListener("touchstart", startDrawing, { passive: false });
  mapCanvas.addEventListener("touchmove", draw, { passive: false });
  mapCanvas.addEventListener("touchend", stopDrawing, { passive: false });

  // Map config modal
  $("btn-map-config-cancel").addEventListener("click", () => {
    $("map-config-modal").classList.add("hidden");
  });
  $("btn-map-config-save").addEventListener("click", saveMapConfig);

  // Invite modal
  $("btn-invite-close").addEventListener("click", () => {
    $("invite-modal").classList.add("hidden");
  });
  $("btn-copy-invite").addEventListener("click", () => {
    const link = $("invite-link-input").value;
    navigator.clipboard
      .writeText(link)
      .then(() => alert("Link copiado para a área de transferência."))
      .catch(() =>
        alert("Não foi possível copiar automaticamente. Copie manualmente.")
      );
  });
  $("btn-invite-whatsapp").addEventListener("click", () => {
    const link = $("invite-link-input").value;
    const text = `Convite para o app de territórios da congregação: ${link}`;
    window.open(
      "https://wa.me/?text=" + encodeURIComponent(text),
      "_blank"
    );
  });

  // Territory count buttons etc já configurados acima

  // Auth listener
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;

    const cidFromUrl = getUrlParam("cid");
    if (!user) {
      // Deslogado: mostra tela de modo (mestre ou convidado)
      hideAllSubscriptions();
      showScreen("mode-screen");
      loadingScreen.classList.add("hidden");
      modeScreen.classList.remove("hidden");
      return;
    }

    // Usuário logado
    if (user.isAnonymous) {
      currentRole = "guest";
      // Convidado sempre deve ter cid da URL
      if (!cidFromUrl) {
        alert("Convidado precisa acessar via link de convite com código.");
        await auth.signOut();
        return;
      }
      currentCongregationId = cidFromUrl;
      await ensureGuestProfile();
      await loadCongregation();
      setupRealtimeData();
      headerCongName.textContent = currentCongregation?.name || "";
      setTab("territories");
      showScreen("main-screen");
      $("admin-only-settings").classList.add("hidden");
      loadingScreen.classList.add("hidden");
      return;
    } else {
      // Admin (Google)
      currentRole = "admin";
      $("admin-only-settings").classList.remove("hidden");

      // Verifica se já existe congregação do admin
      const congSnap = await db
        .collection("congregations")
        .where("ownerUid", "==", user.uid)
        .limit(1)
        .get();

      if (congSnap.empty) {
        // Primeira vez -> abrir modal para criar congregação
        $("first-cong-modal").classList.remove("hidden");
        showScreen("main-screen"); // tela de fundo
        loadingScreen.classList.add("hidden");
        return;
      } else {
        const doc = congSnap.docs[0];
        currentCongregationId = doc.id;
        currentCongregation = { id: doc.id, ...doc.data() };
        headerCongName.textContent = currentCongregation.name || "";
        $("settings-cong-name").value = currentCongregation.name || "";
        $("settings-admin-password").value =
          currentCongregation.adminPassword || "1234";
        $("territory-count-label").textContent =
          currentCongregation.territoryCount || 25;
        setupRealtimeData();
        showScreen("main-screen");
        loadingScreen.classList.add("hidden");
      }
    }
  });
});

// =======================
// LOGIN / GUEST ENTRADA
// =======================

async function handleAdminLoginClick() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.error(err);
    alert("Erro ao entrar com Google: " + err.message);
  }
}

async function handleGuestEnterClick() {
  const rawCode = $("invite-code-input").value.trim();
  const guestName = $("guest-name-input").value.trim();

  if (!rawCode) {
    alert("Cole o link de convite ou código da congregação.");
    return;
  }
  if (!guestName) {
    alert("Digite seu nome para entrar.");
    return;
  }

  // Extrai cid de um link completo ou código bruto
  let cid = rawCode;
  const urlMatch = rawCode.match(/[?&]cid=([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    cid = urlMatch[1];
  }

  // Salva nome localmente
  profileName = guestName;
  localStorage.setItem("territorios_profile_name", guestName);
  $("profile-name-input").value = guestName;
  $("header-user-initials").textContent = initialsFromName(guestName);

  // Atualiza URL do navegador com cid
  const url = new URL(window.location.href);
  url.searchParams.set("cid", cid);
  window.history.replaceState({}, "", url.toString());

  try {
    // login anônimo
    await auth.signInAnonymously();
  } catch (err) {
    console.error(err);
    alert(
      "Erro ao entrar como convidado. Verifique se o login Anônimo está ativado no Firebase."
    );
  }
}

async function ensureGuestProfile() {
  if (!currentUser || !currentUser.isAnonymous || !currentCongregationId)
    return;

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

// =======================
// CRIAÇÃO PRIMEIRA CONGREGAÇÃO
// =======================

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

    // Cria 25 territórios padrão
    const batch = db.batch();
    for (let i = 1; i <= 25; i++) {
      const terrRef = congRef.collection("territories").doc(String(i));
      batch.set(terrRef, {
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

    setupRealtimeData();
    setTab("territories");
  } catch (err) {
    console.error(err);
    alert("Erro ao criar congregação: " + err.message);
  }
}

// =======================
// CARREGAR DADOS EM TEMPO REAL
// =======================

let territoriesCache = [];
let movementsCache = [];

function hideAllSubscriptions() {
  if (territoriesUnsubscribe) territoriesUnsubscribe();
  if (movementsUnsubscribe) movementsUnsubscribe();
}

async function loadCongregation() {
  if (!currentCongregationId) return;
  const congDoc = await db
    .collection("congregations")
    .doc(currentCongregationId)
    .get();
  if (!congDoc.exists) {
    alert("Congregação não encontrada. Verifique o link de convite.");
    return;
  }
  currentCongregation = { id: congDoc.id, ...congDoc.data() };
  $("header-cong-name").textContent = currentCongregation.name || "";
  $("settings-cong-name").value = currentCongregation.name || "";
  $("settings-admin-password").value =
    currentCongregation.adminPassword || "1234";
  $("territory-count-label").textContent =
    currentCongregation.territoryCount || 25;
}

function setupRealtimeData() {
  if (!currentCongregationId) return;

  hideAllSubscriptions();

  territoriesUnsubscribe = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories")
    .where("active", "==", true)
    .orderBy("number")
    .onSnapshot((snap) => {
      territoriesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderTerritories();
    });

  movementsUnsubscribe = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("movements")
    .orderBy("timestamp", "desc")
    .limit(100)
    .onSnapshot((snap) => {
      movementsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderReports();
    });
}

// ===============
// RENDER TERRITÓRIOS
// ===============

function renderTerritories() {
  const container = $("territories-list");
  container.innerHTML = "";

  if (!territoriesCache.length) {
    container.innerHTML = "<p class='small'>Nenhum território cadastrado.</p>";
    return;
  }

  let list = [...territoriesCache];

  if (currentFilter === "in_use") {
    list = list.filter((t) => t.status === "IN_USE");
  } else if (currentFilter === "free") {
    list = list.filter((t) => t.status === "FREE");
  } else if (currentFilter === "less_used") {
    list.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
  }

  for (const terr of list) {
    const card = document.createElement("div");
    card.className = "territory-card";

    const header = document.createElement("div");
    header.className = "territory-header";

    const title = document.createElement("div");
    title.className = "territory-title";
    title.textContent = `Território ${terr.number}`;

    const status = document.createElement("div");
    const isInUse = terr.status === "IN_USE";
    status.className =
      "territory-status " + (isInUse ? "status-inuse" : "status-free");
    status.innerHTML = `
      <span class="status-dot"></span>
      <span>${isInUse ? "EM USO" : "LIVRE"}</span>
    `;

    header.appendChild(title);
    header.appendChild(status);

    const meta = document.createElement("div");
    meta.className = "territory-meta";
    let metaText = "";
    if (terr.lastTakenBy && terr.lastTakenAt) {
      metaText += `Pegado por: ${terr.lastTakenBy} em ${formatDateTime(
        terr.lastTakenAt
      )}`;
    }
    if (terr.lastReturnedBy && terr.lastReturnedAt) {
      metaText += metaText ? " · " : "";
      metaText += `Devolvido por: ${terr.lastReturnedBy} em ${formatDateTime(
        terr.lastReturnedAt
      )}`;
    }
    if (!metaText) metaText = "Ainda sem movimentações.";
    meta.textContent = metaText;

    const actions = document.createElement("div");
    actions.className = "territory-actions";

    const mainBtn = document.createElement("button");
    mainBtn.className = "btn " + (isInUse ? "danger" : "primary");
    mainBtn.textContent = isInUse ? "Devolver" : "Pegar";
    mainBtn.addEventListener("click", () =>
      handleToggleTerritory(terr, !isInUse)
    );

    const mapBtn = document.createElement("button");
    mapBtn.className = "btn secondary";
    mapBtn.innerHTML = '<span class="button-icon">🗺️</span>';

    mapBtn.addEventListener("click", () => openMapModal(terr));

    const notesBtn = document.createElement("button");
    notesBtn.className = "btn ghost";
    notesBtn.innerHTML = '<span class="button-icon">💬</span>';

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
  }
}

// =====================
// PEGAR / DEVOLVER
// =====================

async function handleToggleTerritory(territory, willTake) {
  if (!currentCongregationId) return;
  if (!profileName) {
    alert("Antes, salve seu nome em Configurar > Seu Perfil.");
    return;
  }

  const action = willTake ? "Pegar" : "Devolver";
  const confirmMsg = willTake
    ? `Confirmar pegar o Território ${territory.number}?`
    : `Confirmar devolver o Território ${territory.number}?`;

  if (!confirm(confirmMsg)) return;

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

      const now = firebase.firestore.FieldValue.serverTimestamp();
      const terrData = terrDoc.data();

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

// =====================
// NOTAS
// =====================

let currentNotesTerritory = null;

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
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar observações: " + err.message);
  }
}

// =====================
// MAPA / DESENHO
// =====================

function openMapModal(territory) {
  currentMapTerritoryId = String(territory.number);
  currentMapTerritoryData = territory;
  $("map-territory-label").textContent = territory.number;

  const img = $("map-image");
  img.src =
    territory.mapImageUrl ||
    "https://via.placeholder.com/800x800.png?text=Mapa+do+Territ%C3%B3rio";

  img.onload = () => {
    // dimensiona canvas igual à imagem
    mapCanvas.width = img.clientWidth;
    mapCanvas.height = img.clientHeight;
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

    // se houver overlay salvo, desenha
    if (territory.overlayDataUrl) {
      const overlayImg = new Image();
      overlayImg.onload = () => {
        mapCtx.drawImage(overlayImg, 0, 0, mapCanvas.width, mapCanvas.height);
      };
      overlayImg.src = territory.overlayDataUrl;
    }
  };

  $("map-modal").classList.remove("hidden");
}

function getCanvasPos(evt) {
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
  drawing = true;
  const pos = getCanvasPos(evt);
  mapCtx.strokeStyle = "rgba(255,0,0,0.9)";
  mapCtx.lineWidth = 3;
  mapCtx.lineCap = "round";
  mapCtx.beginPath();
  mapCtx.moveTo(pos.x, pos.y);
}

function draw(evt) {
  if (!drawing) return;
  evt.preventDefault();
  const pos = getCanvasPos(evt);
  mapCtx.lineTo(pos.x, pos.y);
  mapCtx.stroke();
}

function stopDrawing(evt) {
  if (!drawing) return;
  evt && evt.preventDefault();
  drawing = false;
}

function clearMapDrawing() {
  if (!mapCanvas) return;
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
}

async function saveMapDrawing() {
  if (!currentCongregationId || !currentMapTerritoryId) return;
  const dataUrl = mapCanvas.toDataURL("image/png");
  const terrRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories")
    .doc(currentMapTerritoryId);

  try {
    await terrRef.update({
      overlayDataUrl: dataUrl,
    });
    alert("Rabiscos salvos.");
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar rabiscos: " + err.message);
  }
}

// =====================
// CONFIG MAPA
// =====================

function openMapConfigModal() {
  if (!currentMapTerritoryData) return;
  $("map-config-password").value = "";
  $("map-config-image-url").value =
    currentMapTerritoryData.mapImageUrl || "";
  $("map-config-google-url").value =
    currentMapTerritoryData.googleMapsUrl || "";
  $("map-config-modal").classList.remove("hidden");
}

async function saveMapConfig() {
  const pwd = $("map-config-password").value.trim();
  const imgUrl = $("map-config-image-url").value.trim();
  const gmapsUrl = $("map-config-google-url").value.trim();

  if (!pwd) {
    alert("Digite a senha do admin.");
    return;
  }
  if (!currentCongregation || pwd !== (currentCongregation.adminPassword || "1234")) {
    alert("Senha incorreta.");
    return;
  }

  if (!currentCongregationId || !currentMapTerritoryId) return;

  const terrRef = db
    .collection("congregations")
    .doc(currentCongregationId)
    .collection("territories")
    .doc(currentMapTerritoryId);

  try {
    await terrRef.update({
      mapImageUrl: imgUrl,
      googleMapsUrl: gmapsUrl,
    });
    $("map-config-modal").classList.add("hidden");
    alert("Mapa atualizado.");
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar configurações do mapa: " + err.message);
  }
}

// =====================
// RELATÓRIOS
// =====================

function renderReports() {
  const body = $("reports-body");
  const select = $("reports-month-select");

  // Gera lista de meses presentes
  const monthsSet = new Set();
  movementsCache.forEach((m) => {
    if (m.timestamp) {
      monthsSet.add(monthKey(m.timestamp.toDate()));
    }
  });

  const months = Array.from(monthsSet).sort().reverse();

  select.innerHTML = "";
  if (!months.length) {
    const opt = document.createElement("option");
    opt.value = "all";
    opt.textContent = "Todos os meses";
    select.appendChild(opt);
  } else {
    const optAll = document.createElement("option");
    optAll.value = "all";
    optAll.textContent = "Todos os meses";
    select.appendChild(optAll);

    months.forEach((mk) => {
      const opt = document.createElement("option");
      opt.value = mk;
      const [y, m] = mk.split("-");
      opt.textContent = `${m}/${y}`;
      select.appendChild(opt);
    });
  }

  select.onchange = () => renderReportsTable();

  renderReportsTable();
}

function renderReportsTable() {
  const body = $("reports-body");
  body.innerHTML = "";

  const select = $("reports-month-select");
  const monthFilter = select.value || "all";

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

// =====================
// CONFIGURAÇÕES ADMIN
// =====================

async function saveAdminSettings() {
  if (!currentRole || currentRole !== "admin") return;
  if (!currentCongregationId) return;

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
    alert("Configurações de admin salvas.");
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar configurações: " + err.message);
  }
}

function adjustTerritoryCount(delta) {
  const label = $("territory-count-label");
  let val = parseInt(label.textContent || "25", 10);
  val += delta;
  if (val < 1) val = 1;
  if (val > 200) val = 200;
  label.textContent = String(val);
}

async function saveTerritoryCount() {
  if (!currentRole || currentRole !== "admin") return;
  if (!currentCongregationId) return;

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

// =====================
// CONVITES
// =====================

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
