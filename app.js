// app.js - Controle de Territórios

// Configuração do Firebase
// Firebase configuration generated from the Firebase console (see project settings).
// Measurement ID is included for analytics; remove if not needed.
const firebaseConfig = {
  apiKey: "AIzaSyAgC7Kij9qrnq2CHzzMTRefp01jpdxGYiU",
  authDomain: "controle-territ.firebaseapp.com",
  projectId: "controle-territ",
  storageBucket: "controle-territ.firebasestorage.app",
  messagingSenderId: "669171529346",
  appId: "1:669171529346:web:2a1a40afa0e3b58c28e69b",
  measurementId: "G-VTKRFWLERS"
};

// Inicializa Firebase (se a configuração estiver completa)
let firebaseApp = null;
let auth = null;
let db = null;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "SUA_API_KEY") {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase inicializado com sucesso");
  } else {
    console.warn("Firebase não configurado. Configure suas credenciais em firebaseConfig.");
  }
} catch (error) {
  console.error("Erro ao inicializar Firebase:", error);
}

// Estados da aplicação
let currentUser = null;
let currentCongregation = null;
let currentUserRole = null; // 'admin' ou 'guest'

// Elementos DOM - com verificação de existência
function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Elemento #${id} não encontrado`);
  }
  return element;
}

// Screens
const screens = {
  loading: getElement('loading-screen'),
  mode: getElement('mode-screen'),
  main: getElement('main-screen')
};

// Botões com verificação
const buttons = {
  adminLogin: getElement('btn-admin-login'),
  guestEnter: getElement('btn-guest-enter'),
  logout: getElement('btn-logout'),
  saveProfileName: getElement('btn-save-profile-name'),
  territoryPlus: getElement('btn-territory-plus'),
  territoryMinus: getElement('btn-territory-minus')
};

// Inputs
const inputs = {
  inviteCode: getElement('invite-code-input'),
  guestName: getElement('guest-name-input'),
  profileName: getElement('profile-name-input'),
  congName: getElement('settings-cong-name'),
  adminPassword: getElement('settings-admin-password')
};

// Outros elementos
const headerCongName = getElement('header-cong-name');
const headerUserInitials = getElement('header-user-initials');
const adminOnlySettings = getElement('admin-only-settings');
const territoriesList = getElement('territories-list');
const territoryCountLabel = getElement('territory-count-label');

// Tab buttons
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

// Chip filters
const filterChips = document.querySelectorAll('.chip-filter');

// FUNÇÕES AUXILIARES COM VERIFICAÇÃO
function showScreen(screenElement) {
  if (!screenElement) return;
  
  // Esconder todas as telas
  Object.values(screens).forEach(screen => {
    if (screen) screen.classList.add('hidden');
  });
  
  // Mostrar tela desejada
  screenElement.classList.remove('hidden');
}

function showElement(element) {
  if (element) element.classList.remove('hidden');
}

function hideElement(element) {
  if (element) element.classList.add('hidden');
}

function setElementText(element, text) {
  if (element) element.textContent = text;
}

function addClickListener(element, handler) {
  if (element) {
    element.addEventListener('click', handler);
  }
}

// Inicialização segura
function initApp() {
  console.log("Inicializando aplicação...");
  
  // Mostrar tela de escolha após carregamento
  setTimeout(() => {
    showScreen(screens.mode);
  }, 800);
  
  // Configurar listeners somente se os elementos existirem
  if (buttons.adminLogin) {
    buttons.adminLogin.addEventListener('click', handleAdminLogin);
  }
  
  if (buttons.guestEnter) {
    buttons.guestEnter.addEventListener('click', handleGuestEnter);
  }
  
  if (buttons.logout) {
    buttons.logout.addEventListener('click', handleLogout);
  }
  
  if (buttons.saveProfileName) {
    buttons.saveProfileName.addEventListener('click', handleSaveProfileName);
  }
  
  // Inicializar tabs
  if (tabButtons.length > 0) {
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        switchTab(tabId);
      });
    });
  }
  
  // Inicializar filtros
  if (filterChips.length > 0) {
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        // Aqui você filtraria a lista de territórios
      });
    });
  }
  
  console.log("Aplicação inicializada");
}

// HANDLERS
async function handleAdminLogin() {
  console.log("Tentando login como admin...");
  
  if (!auth) {
    alert("Firebase não configurado. Configure as credenciais no arquivo app.js");
    return;
  }
  
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    currentUser = result.user;
    currentUserRole = 'admin';
    
    // Aqui você criaria/recuperaria a congregação
    await initializeCongregation();
    
    showScreen(screens.main);
    updateUI();
  } catch (error) {
    console.error("Erro no login:", error);
    alert("Erro ao fazer login: " + error.message);
  }
}

async function handleGuestEnter() {
  console.log("Tentando entrar como convidado...");
  
  const inviteCode = inputs.inviteCode ? inputs.inviteCode.value.trim() : '';
  const guestName = inputs.guestName ? inputs.guestName.value.trim() : '';
  
  if (!inviteCode || !guestName) {
    alert("Por favor, preencha o código da congregação e seu nome.");
    return;
  }
  
  // Aqui você validaria o código de convite
  currentUserRole = 'guest';
  
  // Simulação - em produção você buscaria do Firebase
  currentCongregation = {
    id: inviteCode,
    name: "Congregação " + inviteCode.substring(0, 5)
  };
  
  // Salvar nome do perfil localmente
  localStorage.setItem('guestName', guestName);
  
  showScreen(screens.main);
  updateUI();
}

function handleLogout() {
  if (auth && currentUser) {
    auth.signOut();
  }
  
  // Limpar estado
  currentUser = null;
  currentCongregation = null;
  currentUserRole = null;
  
  // Limpar inputs
  if (inputs.inviteCode) inputs.inviteCode.value = '';
  if (inputs.guestName) inputs.guestName.value = '';
  
  showScreen(screens.mode);
}

function handleSaveProfileName() {
  const newName = inputs.profileName ? inputs.profileName.value.trim() : '';
  
  if (!newName) {
    alert("Por favor, digite um nome.");
    return;
  }
  
  localStorage.setItem('guestName', newName);
  alert("Nome salvo com sucesso!");
  updateUI();
}

async function initializeCongregation() {
  if (!currentUser || !db) return;
  
  try {
    // Verificar se já existe congregação para este usuário
    const congRef = db.collection('congregations').doc(currentUser.uid);
    const congDoc = await congRef.get();
    
    if (congDoc.exists) {
      currentCongregation = congDoc.data();
    } else {
      // Criar nova congregação
      currentCongregation = {
        id: currentUser.uid,
        name: "Minha Congregação",
        adminUid: currentUser.uid,
        territoryCount: 25,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await congRef.set(currentCongregation);
    }
  } catch (error) {
    console.error("Erro ao inicializar congregação:", error);
  }
}

// UI FUNCTIONS
function updateUI() {
  // Atualizar cabeçalho
  if (currentCongregation && headerCongName) {
    headerCongName.textContent = currentCongregation.name;
  }
  
  // Atualizar iniciais do usuário
  let initials = "S";
  if (currentUserRole === 'admin' && currentUser) {
    initials = currentUser.displayName ? 
      currentUser.displayName.charAt(0).toUpperCase() : "A";
  } else if (currentUserRole === 'guest') {
    const savedName = localStorage.getItem('guestName') || "Publicador";
    initials = savedName.charAt(0).toUpperCase();
  }
  
  if (headerUserInitials) {
    headerUserInitials.textContent = initials;
  }
  
  // Mostrar/esconder seções de admin
  if (adminOnlySettings) {
    if (currentUserRole === 'admin') {
      showElement(adminOnlySettings);
    } else {
      hideElement(adminOnlySettings);
    }
  }
  
  // Atualizar contador de territórios
  if (currentCongregation && territoryCountLabel) {
    territoryCountLabel.textContent = currentCongregation.territoryCount || 25;
  }
  
  // Preencher inputs de perfil
  if (inputs.profileName) {
    const savedName = localStorage.getItem('guestName') || "";
    inputs.profileName.value = savedName;
  }
  
  // Carregar territórios
  loadTerritories();
}

function switchTab(tabId) {
  // Atualizar botões das tabs
  tabButtons.forEach(button => {
    const isActive = button.getAttribute('data-tab') === tabId;
    button.classList.toggle('active', isActive);
  });
  
  // Mostrar painel correspondente
  tabPanels.forEach(panel => {
    const isActive = panel.id === `tab-${tabId}`;
    panel.classList.toggle('active', isActive);
  });
}

function loadTerritories() {
  if (!territoriesList) return;
  
  // Limpar lista
  territoriesList.innerHTML = '';
  
  // Simulação de territórios
  const territories = [
    { id: 1, number: "001", status: "free", lastUsed: "15/01/2024", publisher: null },
    { id: 2, number: "002", status: "in_use", lastUsed: "20/01/2024", publisher: "João Silva" },
    { id: 3, number: "003", status: "free", lastUsed: "10/01/2024", publisher: null },
    { id: 4, number: "004", status: "in_use", lastUsed: "22/01/2024", publisher: "Maria Santos" }
  ];
  
  territories.forEach(territory => {
    const card = document.createElement('div');
    card.className = 'territory-card';
    
    const statusClass = territory.status === 'free' ? 'status-free' : 'status-inuse';
    const statusText = territory.status === 'free' ? 'Livre' : 'Em uso';
    const publisherText = territory.publisher ? 
      `Com: ${territory.publisher}` : 
      `Último uso: ${territory.lastUsed}`;
    
    card.innerHTML = `
      <div class="territory-header">
        <span class="territory-title">Território ${territory.number}</span>
        <span class="territory-status ${statusClass}">
          <span class="status-dot"></span>
          ${statusText}
        </span>
      </div>
      <div class="territory-meta">${publisherText}</div>
      <div class="territory-actions">
        ${territory.status === 'free' ? 
          '<button class="btn primary small" onclick="takeTerritory(' + territory.id + ')">Pegar</button>' : 
          '<button class="btn secondary small" onclick="returnTerritory(' + territory.id + ')">Devolver</button>'
        }
        <button class="btn ghost small" onclick="viewMap(' + territory.id + ')">
          <span class="button-icon">🗺️</span> Mapa
        </button>
      </div>
    `;
    
    territoriesList.appendChild(card);
  });
}

// Funções globais para os botões dos territórios
window.takeTerritory = function(id) {
  alert(`Pegar território ${id} - Em desenvolvimento`);
};

window.returnTerritory = function(id) {
  alert(`Devolver território ${id} - Em desenvolvimento`);
};

window.viewMap = function(id) {
  alert(`Ver mapa do território ${id} - Em desenvolvimento`);
};

// INICIAR APLICAÇÃO
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM carregado, iniciando app...");
  
  // Verificar se há usuário logado
  if (auth) {
    auth.onAuthStateChanged(user => {
      if (user) {
        currentUser = user;
        currentUserRole = 'admin';
        initializeCongregation().then(() => {
          showScreen(screens.main);
          updateUI();
        });
      } else {
        initApp();
      }
    });
  } else {
    initApp();
  }
});

// Manipular erro de recarregamento de página
window.addEventListener('beforeunload', () => {
  console.log("Página sendo recarregada...");
});

// Para evitar erros de extensão no cache
if (window.chrome && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Mensagem da extensão:", request);
  });
}
