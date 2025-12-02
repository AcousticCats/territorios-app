/************************************************************
 * CONFIGURAÇÃO DO FIREBASE
 ************************************************************/
const firebaseConfig = {
  apiKey: "AIzaSyAgC7Kij9qrnq2CHzzMTRefp01jpdxGYiU",
  authDomain: "controle-territ.firebaseapp.com",
  projectId: "controle-territ",
  storageBucket: "controle-territ.firebasestorage.app",
  messagingSenderId: "669171529346",
  appId: "1:669171529346:web:2a1a40afa0e3b58c28e69b",
  measurementId: "G-VTKRFWLERS",
};

// Garante que só inicializa uma vez
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

/************************************************************
 * TUDO A PARTIR DAQUI SÓ RODA DEPOIS DO HTML ESTAR PRONTO
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  /**********************************************************
   * ELEMENTOS DA INTERFACE
   **********************************************************/
  const loadingScreen = document.getElementById("loading-screen");
  const modeScreen = document.getElementById("mode-screen");
  const mainScreen = document.getElementById("main-screen");

  const btnAdminLogin = document.getElementById("btn-admin-login");
  const btnGuestEnter = document.getElementById("btn-guest-enter");
  const guestNameInput = document.getElementById("guest-name-input");
  const inviteCodeInput = document.getElementById("invite-code-input");

  const headerCongName = document.getElementById("header-cong-name");
  const headerUserInitials = document.getElementById("header-user-initials");

  const profileNameInput = document.getElementById("profile-name-input");
  const btnSaveProfileName = document.getElementById("btn-save-profile-name");

  const adminSettingsSection = document.getElementById("admin-only-settings");
  const settingsCongName = document.getElementById("settings-cong-name");
  const settingsAdminPassword = document.getElementById("settings-admin-password");

  const territoryCountLabel = document.getElementById("territory-count-label");

  const btnLogout = document.getElementById("btn-logout");

  const territoriesList = document.getElementById("territories-list");

  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");

  const filterChips = document.querySelectorAll(".chip-filter");

  /**********************************************************
   * ESTADO GLOBAL
   **********************************************************/
  let currentUser = null;
  let currentCongId = null;
  let userIsAdmin = false;
  let unsubscribeTerritories = null;
  let currentFilter = "all";
  let profileName = localStorage.getItem("territorios_profile_name") || "";

  /**********************************************************
   * FUNÇÕES DE TELA
   **********************************************************/
  function showLoading() {
    loadingScreen.classList.remove("hidden");
    modeScreen.classList.add("hidden");
    mainScreen.classList.add("hidden");
  }

  function showMode() {
    loadingScreen.classList.add("hidden");
    modeScreen.classList.remove("hidden");
    mainScreen.classList.add("hidden");
  }

  function showMain() {
    loadingScreen.classList.add("hidden");
    modeScreen.classList.add("hidden");
    mainScreen.classList.remove("hidden");
  }

  function setTab(tab) {
    tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${tab}`);
    });
  }

  /**********************************************************
   * INICIALIZAÇÃO DO PERFIL
   **********************************************************/
  if (profileName) {
    profileNameInput.value = profileName;
    headerUserInitials.textContent = initialsFromName(profileName);
  }

  function initialsFromName(name) {
    if (!name) return "S";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**********************************************************
   * ABAS
   **********************************************************/
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setTab(btn.dataset.tab);
    });
  });

  /**********************************************************
   * FILTROS
   **********************************************************/
  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      // Re-render depois que estados forem carregados
      // (renderTerritorios usa currentFilter)
    });
  });

  /**********************************************************
   * BOTÃO SALVAR NOME
   **********************************************************/
  btnSaveProfileName.addEventListener("click", () => {
    const name = profileNameInput.value.trim();
    if (!name) {
      alert("Digite seu nome.");
      return;
    }
    profileName = name;
    localStorage.setItem("territorios_profile_name", name);
    headerUserInitials.textContent = initialsFromName(name);
    alert("Nome salvo.");
  });

  /**********************************************************
   * LOGIN ANCIÃO (GOOGLE)
   **********************************************************/
  btnAdminLogin.addEventListener("click", async () => {
    try {
      showLoading();
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await auth.signInWithPopup(provider);

      currentUser = result.user;
      currentCongId = currentUser.uid;
      userIsAdmin = true;

      await garantirCongregacaoCriada(currentCongId, currentUser.displayName || "Congregação");

      await carregarCongregacao();
      showMain();
    } catch (err) {
      console.error(err);
      alert("Erro ao entrar com Google.");
      showMode();
    }
  });

  /**********************************************************
   * LOGIN PUBLICADOR (CONVIDADO)
   **********************************************************/
  btnGuestEnter.addEventListener("click", async () => {
    const guestName = guestNameInput.value.trim();
    const rawCode = inviteCodeInput.value.trim();

    if (!guestName || !rawCode) {
      alert("Preencha o nome e o código/link da congregação.");
      return;
    }

    // Extrai possível cid de um link (?cid=xxx) ou usa o código direto
    let cid = rawCode;
    const match = rawCode.match(/[?&]cid=([a-zA-Z0-9_-]+)/);
    if (match) {
      cid = match[1];
    }

    try {
      showLoading();
      // Login anônimo (já está ativado no Firebase)
      await auth.signInAnonymously();
      currentUser = auth.currentUser;
      currentCongId = cid;
      userIsAdmin = false;

      profileName = guestName;
      localStorage.setItem("territorios_profile_name", guestName);
      profileNameInput.value = guestName;
      headerUserInitials.textContent = initialsFromName(guestName);

      await carregarCongregacao();
      showMain();
    } catch (err) {
      console.error(err);
      alert("Erro ao entrar como convidado. Verifique se o login anônimo está ativado no Firebase.");
      showMode();
    }
  });

  /**********************************************************
   * LOGOUT
   **********************************************************/
  btnLogout.addEventListener("click", async () => {
    try {
      showLoading();
      if (unsubscribeTerritories) unsubscribeTerritories();
      unsubscribeTerritories = null;
      currentUser = null;
      currentCongId = null;
      userIsAdmin = false;
      await auth.signOut();
      showMode();
    } catch (err) {
      console.error(err);
      alert("Erro ao sair.");
      showMain();
    }
  });

  /**********************************************************
   * GARANTIR CONGREGAÇÃO CRIADA (ANCIÃO)
   **********************************************************/
  async function garantirCongregacaoCriada(congId, ownerName) {
    const congRef = db.collection("congregations").doc(congId);
    const doc = await congRef.get();
    if (doc.exists) return;

    const dataBase = {
      name: `Congregação de ${ownerName}`,
      adminPassword: "1234",
      territoryCount: 25,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(congRef, dataBase);

    const terrCol = congRef.collection("territories");
    for (let i = 1; i <= 25; i++) {
      const terrRef = terrCol.doc(String(i));
      batch.set(terrRef, {
        number: i,
        active: true,
        in_use: false,
        last_user: "",
        last_action: "",
        last_date: "",
        notes: "",
        map_image_url: "",
        map_google_url: "",
      });
    }

    await batch.commit();
  }

  /**********************************************************
   * CARREGAR CONGREGAÇÃO + TERRITÓRIOS
   **********************************************************/
  async function carregarCongregacao() {
    if (!currentCongId) {
      alert("Nenhuma congregação selecionada.");
      showMode();
      return;
    }

    const congRef = db.collection("congregations").doc(currentCongId);
    const congDoc = await congRef.get();
    if (!congDoc.exists) {
      alert("Congregação não encontrada. Verifique o código/link.");
      showMode();
      return;
    }

    const data = congDoc.data();

    headerCongName.textContent = data.name || "";
    settingsCongName.value = data.name || "";
    settingsAdminPassword.value = data.adminPassword || "1234";
    territoryCountLabel.textContent = data.territoryCount || 25;

    adminSettingsSection.classList.toggle("hidden", !userIsAdmin);

    if (unsubscribeTerritories) unsubscribeTerritories();

    unsubscribeTerritories = congRef
      .collection("territories")
      .orderBy("number", "asc")
      .onSnapshot((snap) => {
        const lista = [];
        snap.forEach((doc) => lista.push({ id: doc.id, ...doc.data() }));
        renderTerritorios(lista);
      });
  }

  /**********************************************************
   * RENDERIZAR TERRITÓRIOS
   **********************************************************/
  function renderTerritorios(lista) {
    territoriesList.innerHTML = "";

    let filtrados = lista.filter((t) => t.active !== false);

    if (currentFilter === "in_use") {
      filtrados = filtrados.filter((t) => t.in_use);
    } else if (currentFilter === "free") {
      filtrados = filtrados.filter((t) => !t.in_use);
    }

    if (!filtrados.length) {
      territoriesList.innerHTML = "<p class='small'>Nenhum território cadastrado.</p>";
      return;
    }

    filtrados.forEach((t) => {
      const card = document.createElement("div");
      card.className = "territory-card";

      const hasNotes = t.notes && t.notes.trim() !== "";

      card.innerHTML = `
        <div class="territory-header">
          <div class="territory-number">Território ${t.number}</div>
          <div class="territory-status ${t.in_use ? "status-inuse" : "status-free"}">
            ${t.in_use ? "Em uso" : "Livre"}
          </div>
        </div>
        <div class="territory-buttons">
          <button class="btn ${t.in_use ? "danger" : "primary"} small" data-action="toggle" data-id="${t.number}">
            ${t.in_use ? "Devolver" : "Pegar"}
          </button>
          <button class="btn secondary small" data-action="map" data-id="${t.number}">
            Mapa
          </button>
          <button class="btn small ${hasNotes ? "notes-alert" : ""}" data-action="notes" data-id="${t.number}">
            Obs
          </button>
        </div>
        <div class="territory-info">
          <span>${t.last_action || "-"} ${t.last_user || ""}</span>
          <span>${t.last_date || ""}</span>
        </div>
      `;

      territoriesList.appendChild(card);
    });
  }

  /**********************************************************
   * CLIQUES NA LISTA DE TERRITÓRIOS
   **********************************************************/
  territoriesList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !id) return;

    const terrRef = db
      .collection("congregations")
      .doc(currentCongId)
      .collection("territories")
      .doc(String(id));

    const terrSnap = await terrRef.get();
    if (!terrSnap.exists) {
      alert("Território não encontrado.");
      return;
    }

    const terr = terrSnap.data();

    if (action === "toggle") {
      if (!profileName) {
        alert("Defina o seu nome na aba Configurar antes de pegar/devolver.");
        setTab("settings");
        return;
      }

      const now = new Date().toLocaleString("pt-BR");
      if (terr.in_use) {
        await terrRef.update({
          in_use: false,
          last_user: profileName,
          last_action: "Devolvido por",
          last_date: now,
        });
      } else {
        await terrRef.update({
          in_use: true,
          last_user: profileName,
          last_action: "Pegado por",
          last_date: now,
        });
      }
    }

    if (action === "notes") {
      alert("Tela de observações será implementada depois que o básico estiver redondo.");
    }

    if (action === "map") {
      alert("Tela de mapa e rabiscos também entra na próxima etapa.");
    }
  });

  /**********************************************************
   * ESTADO INICIAL
   **********************************************************/
  showMode();
});
