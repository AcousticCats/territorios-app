/************************************************************
 *  CONFIGURAÇÃO DO FIREBASE
 ************************************************************/
const firebaseConfig = {
  apiKey: "AIzaSyAgC7Kij9qrnq2CHzzMTRefp01jpdxGYiU",
  authDomain: "controle-territ.firebaseapp.com",
  projectId: "controle-territ",
  storageBucket: "controle-territ.firebasestorage.app",
  messagingSenderId: "669171529346",
  appId: "1:669171529346:web:2a1a40afa0e3b58c28e69b",
  measurementId: "G-VTKRFWLERS"
};

// Inicializa Firebase apenas uma vez
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

/************************************************************
 *  ELEMENTOS DA INTERFACE
 ************************************************************/
const loadingScreen = document.getElementById("loading-screen");
const modeScreen = document.getElementById("mode-screen");
const mainScreen = document.getElementById("main-screen");

// LOGIN
const btnAdminLogin = document.getElementById("btn-admin-login");
const btnGuestEnter = document.getElementById("btn-guest-enter");

// CAMPOS GUEST
const guestNameInput = document.getElementById("guest-name-input");
const inviteCodeInput = document.getElementById("invite-code-input");

// HEADER
const headerCongName = document.getElementById("header-cong-name");
const headerUserInitials = document.getElementById("header-user-initials");

// LISTAGEM DE TERRITÓRIOS
const territoriesList = document.getElementById("territories-list");
const territoryCountLabel = document.getElementById("territory-count-label");

// PERFIL
const profileNameInput = document.getElementById("profile-name-input");

// ADMIN
const adminSettingsSection = document.getElementById("admin-only-settings");
const settingsCongName = document.getElementById("settings-cong-name");
const settingsAdminPassword = document.getElementById("settings-admin-password");

/************************************************************
 *  VARIÁVEIS DE ESTADO
 ************************************************************/
let currentUser = null;
let currentCongId = null;
let userIsAdmin = false;
let unsubscribeTerritories = null;

/************************************************************
 *  MOSTRAR TELAS
 ************************************************************/
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

/************************************************************
 *  LOGIN — ADMIN (GOOGLE)
 ************************************************************/
btnAdminLogin.addEventListener("click", async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);

    currentUser = result.user;

    // Verifica se já existe congregação
    const congDoc = await db.collection("congregations").doc(currentUser.uid).get();

    if (!congDoc.exists) {
      await criarNovaCongregacao(currentUser.uid);
    }

    currentCongId = currentUser.uid;
    userIsAdmin = true;

    carregarCongregacao();
    showMain();

  } catch (err) {
    alert("Erro no login do Google");
  }
});

/************************************************************
 *  LOGIN — PUBLICADOR VIA CONVITE
 ************************************************************/
btnGuestEnter.addEventListener("click", async () => {
  const name = guestNameInput.value.trim();
  const code = inviteCodeInput.value.trim();

  if (!name || !code) {
    alert("Preencha nome e código.");
    return;
  }

  currentUser = { displayName: name };
  currentCongId = code;
  userIsAdmin = false;

  profileNameInput.value = name;

  carregarCongregacao();
  showMain();
});

/************************************************************
 *  CRIAR NOVA CONGREGAÇÃO
 ************************************************************/
async function criarNovaCongregacao(id) {
  const defaultData = {
    name: "Minha Congregação",
    adminPassword: "1234",
    territoryCount: 25
  };

  await db.collection("congregations").doc(id).set(defaultData);

  // Cria os 25 territórios padrão
  const batch = db.batch();
  for (let i = 1; i <= 25; i++) {
    const ref = db.collection("congregations").doc(id).collection("territories").doc(String(i));
    batch.set(ref, {
      number: i,
      active: true,
      in_use: false,
      last_user: "",
      last_action: "",
      last_date: "",
      notes: "",
      map_image_url: "",
      map_google_url: ""
    });
  }
  await batch.commit();
}

/************************************************************
 *  CARREGAR CONGREGAÇÃO
 ************************************************************/
async function carregarCongregacao() {
  // Carrega dados gerais
  const congDoc = await db.collection("congregations").doc(currentCongId).get();
  if (!congDoc.exists) {
    alert("Código inválido. Congregação não encontrada.");
    showMode();
    return;
  }

  const data = congDoc.data();

  headerCongName.textContent = data.name ?? "";
  settingsCongName.value = data.name ?? "";
  settingsAdminPassword.value = data.adminPassword ?? "";
  territoryCountLabel.textContent = data.territoryCount ?? 25;

  headerUserInitials.textContent = (currentUser.displayName || "?")[0].toUpperCase();

  // Admin vê configurações
  adminSettingsSection.classList.toggle("hidden", !userIsAdmin);

  // Carregar territórios em tempo real
  if (unsubscribeTerritories) unsubscribeTerritories();

  unsubscribeTerritories = db
    .collection("congregations")
    .doc(currentCongId)
    .collection("territories")
    .orderBy("number", "asc")
    .onSnapshot(renderTerritorios);
}

/************************************************************
 *  RENDERIZAR TERRITÓRIOS
 ************************************************************/
function renderTerritorios(snapshot) {
  territoriesList.innerHTML = "";

  snapshot.forEach(doc => {
    const t = doc.data();
    const card = document.createElement("div");
    card.className = "territory-card";

    const hasNotes = t.notes && t.notes.trim() !== "";

    card.innerHTML = `
      <div class="territory-number">Território ${t.number}</div>
      <div class="territory-buttons">
        <button class="btn primary small" data-action="toggle" data-id="${t.number}">
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
        <span>Último: ${t.last_user || "-"}</span>
        <span>${t.last_date || ""}</span>
      </div>
    `;

    territoriesList.appendChild(card);
  });
}

/************************************************************
 *  PEGAR / DEVOLVER TERRITÓRIO
 ************************************************************/
territoriesList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  const ref = db.collection("congregations")
    .doc(currentCongId)
    .collection("territories")
    .doc(id);

  const t = (await ref.get()).data();

  if (action === "toggle") {
    const now = new Date().toLocaleString("pt-BR");

    if (t.in_use) {
      // Devolver
      await ref.update({
        in_use: false,
        last_user: currentUser.displayName,
        last_action: "Devolveu",
        last_date: now
      });

    } else {
      // Pegar
      await ref.update({
        in_use: true,
        last_user: currentUser.displayName,
        last_action: "Pegou",
        last_date: now
      });
    }
  }

  if (action === "notes") {
    alert("Observações serão adicionadas na próxima fase.");
  }

  if (action === "map") {
    alert("Mapa será ativado na próxima fase.");
  }
});
