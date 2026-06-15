const app = {
    isLoggedIn: false,
    currentUser: null,
    currentInstituicao: null,
    scanner: null,
    auditScanner: null,
    currentItem: null,
    auditSession: { pending: [], returned: [], startTime: null },
    localUsers: [],

    init: async () => {
        await db.init();
        app.instituicoes.init();
        
        // 1. Primeiro carrega usuários da nuvem (ou cache)
        app.localUsers = await sync.fetchUsers();
        
        // 2. Depois faz a migração (que adiciona ao cache local)
        await app.users.init();
        
        const savedSession = localStorage.getItem('sessionData');
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                const user = app.localUsers.find(u => u.username === session.username) || app.users.getLocal(session.username);
                if (user && session.instituicao) {
                    app.isLoggedIn = true;
                    app.currentUser = user;
                    app.currentInstituicao = session.instituicao;
                    document.getElementById('btn-login-toggle').textContent = `🔓 ${user.nome || user.name}`;
                    app.applyPermissions(app.accessLevels[user.nivel || user.level]);
                }
            } catch (e) { localStorage.removeItem('sessionData'); }
        }

        if (!app.isLoggedIn) app.showLoginScreen();
        else { app.navigate('dashboard'); app.updateDashboard(); app.updateInstituicaoDisplay(); app.updateLogoDisplay(); }
        
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
    },

    showLoginScreen: () => {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const loginView = document.getElementById('view-login-required');
        if (loginView) loginView.classList.remove('hidden');
        app.updateLogoDisplay();
    },

    updateLogoDisplay: () => {
        const headerLogo = document.getElementById('header-logo');
        const loginLogo = document.getElementById('login-logo');
        if (app.currentInstituicao?.logo) {
            if (headerLogo) { headerLogo.src = app.currentInstituicao.logo; headerLogo.style.display = 'block'; }
            if (loginLogo) { loginLogo.src = app.currentInstituicao.logo; loginLogo.style.display = 'block'; }
        } else {
            if (headerLogo) headerLogo.style.display = 'none';
            if (loginLogo) loginLogo.style.display = 'none';
        }
    },

    forceUpdate: () => {
        if (confirm('Isso vai limpar o cache e recarregar.\n\nUSUÁRIOS e UNIDADES serão PRESERVADOS.\n\nOK?')) {
            const protectedKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('user_') || key.startsWith('inst_') || key === 'cloudUsersCache' || key === 'cloudUsersLastSync' || key === 'usersMigrated')) {
                    protectedKeys.push({ key, value: localStorage.getItem(key) });
                }
            }
            localStorage.clear();
            protectedKeys.forEach(({ key, value }) => localStorage.setItem(key, value));
            if ('caches' in window) caches.keys().then(names => names.forEach(n => caches.delete(n)));
            window.location.reload(true);
        }
    },

    navigate: (viewId) => {
        if (!app.isLoggedIn && viewId !== 'login-required') { app.showLoginScreen(); return; }
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${viewId}`);
        if (target) target.classList.remove('hidden');
        else alert('ERRO: View não encontrada: view-' + viewId);
        
        if (viewId === 'dashboard') { app.renderList(); app.updateInstituicaoDisplay(); }
        if (viewId === 'add') document.getElementById('item-codigo').value = app.generateCode();
        if (viewId === 'scanner') app.startScanner();
        if (viewId === 'audit') app.renderAudit();
        if (viewId === 'reports') app.renderReports();
    },

    generateCode: () => `FDSF-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,

    updateInstituicaoDisplay: () => {
        const display = document.getElementById('current-instituicao-display');
        if (!display) return;
        if (app.currentInstituicao) {
            display.textContent = `📍 ${app.currentInstituicao.nome} - ${app.currentInstituicao.cidade || ''}`;
            display.classList.remove('hidden');
        } else display.classList.add('
