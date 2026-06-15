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
        } else display.classList.add('hidden');
    },

    toggleLogin: () => {
        if (app.isLoggedIn) {
            if (confirm('Deseja sair do sistema?')) {
                app.isLoggedIn = false; app.currentUser = null; app.currentInstituicao = null;
                localStorage.removeItem('sessionData');
                const btn = document.getElementById('btn-login-toggle');
                if (btn) btn.textContent = '';
                app.applyPermissions({ canCreate: false, canSync: false, canManageUsers: false });
                app.showLoginScreen();
            }
        } else app.openLoginModal();
    },

    openLoginModal: () => {
        try {
            app.instituicoes.init();
            const instituicoes = app.instituicoes.getAll();
            const selectInst = document.getElementById('login-instituicao');
            if (selectInst) {
                selectInst.innerHTML = '<option value="">-- Selecione sua unidade --</option>';
                instituicoes.forEach(inst => {
                    const opt = document.createElement('option');
                    opt.value = inst.id; opt.textContent = `${inst.nome} - ${inst.cidade || ''}`;
                    selectInst.appendChild(opt);
                });
            }
            const passField = document.getElementById('login-pass');
            if (passField) passField.value = '';
            const modal = document.getElementById('login-modal');
            if (modal) modal.classList.remove('hidden');
        } catch (error) { alert('Erro ao abrir login: ' + error.message); }
    },

    doLogin: async () => {
        const username = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value;
        const instId = document.getElementById('login-instituicao').value;
        
        if (!instId) { alert('Selecione sua unidade'); return; }
        if (!username) { alert('Digite seu usuário'); return; }
        
        // Admin local (master)
        if (username === 'admin') {
            const localAdmin = app.users.getLocal('admin');
            if (!localAdmin || localAdmin.password !== p) { alert('Senha incorreta!'); return; }
            const instituicao = app.instituicoes.get(instId);
            if (!instituicao) { alert('Unidade não encontrada'); return; }
            app.completeLogin(localAdmin, instituicao);
            return;
        }
        
        // Usuários da nuvem (cache local)
        const cloudUser = app.localUsers.find(u => u.username === username);
        if (!cloudUser) { alert('Usuário não encontrado. Contate o administrador.'); return; }
        
        const hash = await utils.hashPassword(p);
        if (cloudUser.senhaHash !== hash) { alert('Senha incorreta!'); return; }
        
        const instituicao = app.instituicoes.get(instId);
        if (!instituicao) { alert('Unidade não encontrada'); return; }
        app.completeLogin(cloudUser, instituicao);
    },

    completeLogin: (user, instituicao) => {
        app.isLoggedIn = true;
        app.currentUser = user;
        app.currentInstituicao = instituicao;
        localStorage.setItem('sessionData', JSON.stringify({ username: user.username, instituicao: instituicao }));
        const btn = document.getElementById('btn-login-toggle');
        if (btn) btn.textContent = `🔓 ${user.nome || user.name}`;
        document.getElementById('login-modal').classList.add('hidden');
        app.applyPermissions(app.accessLevels[user.nivel || user.level]);
        app.navigate('dashboard');
        app.updateDashboard();
        app.updateInstituicaoDisplay();
        app.updateLogoDisplay();
        
        const hora = new Date().getHours();
        const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
        setTimeout(() => alert(`${saudacao}, ${user.nome || user.name}!\n\nBem-vindo(a) ao Inventário.\nUnidade: ${instituicao.nome}`), 300);
    },

    closeLogin: () => { document.getElementById('login-modal').classList.add('hidden'); },

    applyPermissions: (perms) => {
        const addBtn = document.querySelector('button[onclick="app.navigate(\'add\')"]');
        if (addBtn) addBtn.style.display = perms.canCreate ? 'block' : 'none';
        const syncBtn = document.querySelector('button[onclick="sync.runSync()"]');
        if (syncBtn) syncBtn.style.display = perms.canSync ? 'block' : 'none';
        const userMgmtBtn = document.getElementById('btn-user-management');
        if (userMgmtBtn) userMgmtBtn.style.display = perms.canManageUsers ? 'block' : 'none';
        const instMgmtBtn = document.getElementById('btn-instituicao-management');
        if (instMgmtBtn) instMgmtBtn.style.display = perms.canManageUsers ? 'block' : 'none';
        const printBtn = document.querySelector('button[onclick="app.printLabels()"]');
        if (printBtn) printBtn.style.display = perms.canCreate ? 'block' : 'none';
        const reportsBtn = document.getElementById('btn-reports');
        if (reportsBtn) {
            if (perms.canManageUsers) { reportsBtn.classList.remove('hidden'); reportsBtn.style.display = 'block'; }
            else { reportsBtn.classList.add('hidden'); reportsBtn.style.display = 'none'; }
        }
        const auditBtn = document.getElementById('btn-audit');
        if (auditBtn) {
            if (perms.canCreate) { auditBtn.classList.remove('hidden'); auditBtn.style.display = 'block'; }
            else { auditBtn.classList.add('hidden'); auditBtn.style.display = 'none'; }
        }
    },

    saveItem: async (e) => {
        e.preventDefault();
        if (!app.isLoggedIn || !app.currentInstituicao) { alert('Faça login'); return; }
        const fileInput = document.getElementById('item-foto');
        let fotoBase64 = '';
        if (fileInput.files[0]) fotoBase64 = await utils.compressImage(fileInput.files[0]);
        else if (!confirm('Continuar sem foto?')) return;

        const item = {
            codigo: document.getElementById('item-codigo').value,
            patrimonio: document.getElementById('item-patrimonio').value.trim(),
            categoria: document.getElementById('item-categoria').value,
            descricao: document.getElementById('item-descricao').value,
            foto: fotoBase64, observacao: document.getElementById('item-obs').value.trim(),
            status: 'Ativo', dataEntrada: new Date().toISOString().split('T')[0],
            historico: [`Criado em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`],
            instituicao: app.currentInstituicao.id, instituicaoNome: app.currentInstituicao.nome,
            instituicaoCidade: app.currentInstituicao.cidade
        };
        await db.save(item);
        alert('Item salvo!');
        document.getElementById('form-add').reset();
        app.navigate('dashboard');
        app.updateDashboard();
    },

    renderList: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        const container = document.getElementById('items-list');
        if (!container) return;
        container.innerHTML = '';
        const filter = document.getElementById('search-input').value.toLowerCase();
        const filtered = items.filter(i => i.codigo.toLowerCase().includes(filter) || i.descricao.toLowerCase().includes(filter) || (i.patrimonio && i.patrimonio.toLowerCase().includes(filter)));
        if (!filtered.length) { container.innerHTML = '<p class="text-center text-gray-500 py-8">Nenhum item</p>'; return; }
        filtered.forEach(item => {
            const temObs = item.observacao?.trim();
            const patBadge = item.patrimonio ? `<p class="text-xs text-blue-600 font-mono">Pat: ${item.patrimonio}</p>` : '';
            const div = document.createElement('div');
            div.className = 'bg-white p-3 rounded shadow border-l-4 ' + (item.status === 'Ativo' ? 'border-green-500' : 'border-red-500');
            div.innerHTML = `<div class="flex justify-between items-center cursor-pointer" onclick="app.renderDetail('${item.codigo}')"><div><p class="font-bold text-sm">${item.codigo} ${temObs ? '📝' : ''}</p><p class="text-xs text-gray-600">${item.descricao}</p>${patBadge}</div><span class="text-xs px-2 py-1 rounded bg-gray-200">${item.status}</span></div>`;
            container.appendChild(div);
        });
    },

    filterItems: () => { app.renderList(); },

    renderDetail: async (codigo) => {
        const item = await db.get(codigo);
        if (!item) { alert('Item não encontrado'); app.navigate('dashboard'); return; }
        app.currentItem = item;
        const container = document.getElementById('detail-content');
        if (!container) return;
        let historicoHtml = item.historico.map(h => `<li class="text-xs text-gray-600">• ${h}</li>`).join('');
        const obsText = item.observacao?.trim() || 'Nenhuma observação.';
        const patDisplay = item.patrimonio ? `<p class="text-sm font-mono bg-blue-50 px-2 py-1 rounded inline-block mt-1">🏷️ Pat: <strong>${item.patrimonio}</strong></p>` : '';
        let fotoUrl = item.foto || '';
        if (fotoUrl.includes('lh3.googleusercontent.com/d/')) {
            const fid = fotoUrl.match(/\/d\/([^\/\?]+)/)?.[1];
            if (fid) fotoUrl = 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w1000';
        }
        const fotoHtml = fotoUrl ? `<img src="${fotoUrl}" class="w-full h-48 object-cover rounded-lg mb-4" onerror="this.style.display='none'">` : '';
        container.innerHTML = `${fotoHtml}<h2 class="text-2xl font-bold">${item.codigo}</h2>${patDisplay}<p class="text-gray-600">${item.categoria} | ${item.descricao}</p><p class="text-xs text-blue-600 font-bold">📍 ${item.instituicaoNome || ''} ${item.instituicaoCidade ? '- ' + item.instituicaoCidade : ''}</p><div class="bg-gray-100 p-3 rounded mt-2"><p><strong>Status:</strong> ${item.status}</p><p><strong>Responsável:</strong> ${item.responsavel || 'N/A'}</p></div><div class="bg-yellow-50 p-3 rounded mt-2 border border-yellow-200"><div class="flex justify-between items-center mb-1"><p class="font-bold text-sm text-yellow-800"> Observações:</p><button id="btn-edit-obs" onclick="app.editObservation()" class="hidden text-xs bg-yellow-600 text-white px-3 py-1 rounded shadow">Editar</button></div><p id="detail-obs-text" class="text-sm text-gray-700 whitespace-pre-wrap">${obsText}</p></div><div class="mt-4 bg-white p-4 rounded-lg shadow text-center border"><p class="text-sm font-bold mb-2">QR Code</p><div id="detail-qrcode" class="flex justify-center mb-2"></div><p class="text-xs font-mono text-gray-600 break-all">${item.codigo}</p></div><div class="mt-4"><h4 class="font-bold text-sm mb-2">Histórico</h4><ul class="space-y-1">${historicoHtml}</ul></div>`;
        setTimeout(() => { const qr = document.getElementById("detail-qrcode"); if (qr) { qr.innerHTML = ''; new QRCode(qr, { text: item.codigo, width: 150, height: 150 }); } }, 100);
        const btnEditObs = document.getElementById('btn-edit-obs');
        if (app.isLoggedIn && app.currentUser && (app.currentUser.nivel || app.currentUser.level) === 'admin') btnEditObs.classList.remove('hidden');
        else btnEditObs.classList.add('hidden');
        const adminActions = document.getElementById('admin-actions');
        if (adminActions) app.isLoggedIn ? adminActions.classList.remove('hidden') : adminActions.classList.add('hidden');
        app.navigate('detail');
    },

    editObservation: async () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        const current = app.currentItem.observacao || '';
        const newObs = prompt('Editar observação (vazio para limpar):', current);
        if (newObs !== null) {
            app.currentItem.observacao = newObs.trim();
            app.currentItem.historico.push(`${newObs.trim() ? 'Atualizada' : 'Limpa'} em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`);
            await db.save(app.currentItem);
            app.renderDetail(app.currentItem.codigo); app.renderList();
        }
    },

    updateStatus: async (newStatus) => {
        if (!app.isLoggedIn) return;
        let resp = app.currentUser.nome || app.currentUser.username;
        let obs = '';
        if (newStatus === 'Emprestado') { resp = prompt('Responsável:') || resp; obs = prompt('Previsão:') || '-'; }
        else if (newStatus === 'Manutenção') obs = prompt('Motivo/OS:') || '-';
        app.currentItem.status = newStatus; app.currentItem.responsavel = resp;
        app.currentItem.historico.push(`${newStatus} em ${new Date().toLocaleString()} por ${resp}. Obs: ${obs}`);
        await db.save(app.currentItem);
        alert(`Status: ${newStatus}`);
        app.renderDetail(app.currentItem.codigo); app.updateDashboard();
    },

    baixarItem: async () => {
        if (!app.isLoggedIn) return;
        const motivo = prompt('Motivo da baixa:');
        if (!motivo) return;
        app.currentItem.status = 'Baixado';
        app.currentItem.historico.push(`BAIXA em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}. Motivo: ${motivo}`);
        await db.save(app.currentItem);
        alert('Baixado.'); app.navigate('dashboard'); app.updateDashboard();
    },

    editItem: async () => {
        if (!app.isLoggedIn) { alert('Faça login'); return; }
        const item = app.currentItem;
        document.getElementById('edit-codigo').value = item.codigo;
        document.getElementById('edit-patrimonio').value = item.patrimonio || '';
        document.getElementById('edit-categoria').value = item.categoria;
        document.getElementById('edit-descricao').value = item.descricao;
        document.getElementById('edit-obs').value = item.observacao || '';
        const preview = document.getElementById('edit-foto-preview');
        if (item.foto) { preview.src = item.foto; preview.style.display = 'block'; } else preview.style.display = 'none';
        document.getElementById('edit-item-modal').classList.remove('hidden');
    },

    saveEditItem: async () => {
        if (!app.isLoggedIn) return;
        const fileInput = document.getElementById('edit-foto');
        let fotoBase64 = app.currentItem.foto;
        if (fileInput.files[0]) {
            fotoBase64 = await utils.compressImage(fileInput.files[0]);
            app.currentItem.historico.push(`Foto atualizada em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`);
        }
        const newPat = document.getElementById('edit-patrimonio').value.trim();
        if (newPat !== (app.currentItem.patrimonio || '')) app.currentItem.historico.push(`Patrimônio alterado para "${newPat || 'vazio'}"`);
        app.currentItem.patrimonio = newPat;
        app.currentItem.categoria = document.getElementById('edit-categoria').value;
        app.currentItem.descricao = document.getElementById('edit-descricao').value;
        app.currentItem.observacao = document.getElementById('edit-obs').value.trim();
        app.currentItem.foto = fotoBase64;
        app.currentItem.historico.push(`Editado em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`);
        await db.save(app.currentItem);
        alert('Atualizado!');
        document.getElementById('edit-item-modal').classList.add('hidden');
        app.renderDetail(app.currentItem.codigo); app.renderList();
    },

    cancelEditItem: () => { document.getElementById('edit-item-modal').classList.add('hidden'); },

    deleteItem: async () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        const item = app.currentItem;
        if (!confirm(`Excluir ${item.codigo}?\n${item.descricao}\n\nIRREVERSÍVEL!`)) return;
        if (!confirm('TEM CERTEZA?')) return;
        await localforage.removeItem(item.codigo);
        alert('Excluído.'); app.navigate('dashboard'); app.updateDashboard();
    },

    updateDashboard: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('dash-total', items.length);
        set('dash-emprestados', items.filter(i => i.status === 'Emprestado').length);
        set('dash-manutencao', items.filter(i => i.status === 'Manutenção').length);
        set('dash-ativos', items.filter(i => i.status === 'Ativo').length);
    },

    printLabels: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        if (!items.length) { alert('Nenhum item'); return; }
        const win = window.open('', '_blank');
        let html = items.map(i => {
            const qr = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(i.codigo)}`;
            const pat = i.patrimonio ? `<div class="label-pat">Pat: ${i.patrimonio}</div>` : '';
            return `<div class="label"><img src="${qr}" class="qr-img"><div class="label-text"><div class="label-code">${i.codigo}</div><div class="label-desc">${i.descricao}</div>${pat}<div class="label-inst">${i.instituicaoNome || ''}</div></div></div>`;
        }).join('');
        win.document.write(`<html><head><title>Etiquetas</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px}.container{display:flex;flex-wrap:wrap;gap:15px}.label{border:1px dashed #ccc;padding:10px;width:180px;text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center}.qr-img{width:120px;height:120px;margin-bottom:8px}.label-code{font-weight:bold;font-size:12px;margin-bottom:4px}.label-desc{font-size:10px;color:#555;word-wrap:break-word}.label-pat{font-size:9px;color:#1e40af;font-weight:bold;margin-top:2px}.label-inst{font-size:9px;color:#888;margin-top:4px;font-style:italic}@media print{body{padding:0}.label{border:1px solid #000}.no-print{display:none}}</style></head><body><div class="no-print" style="text-align:center;margin-bottom:20px"><h2>Etiquetas (${items.length} itens)</h2><button onclick="window.print()" style="padding:10px 20px;font-size:16px;cursor:pointer">🖨️ Imprimir</button></div><div class="container">${html}</div></body></html>`);
        win.document.close();
    },

    startScanner: () => {
        app.scanner = new Html5Qrcode("reader");
        app.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
            async (code) => {
                app.stopScanner();
                if (!app.isLoggedIn) { alert(`Código: ${code}\nFaça login`); app.navigate('dashboard'); }
                else {
                    const item = await db.get(code);
                    if (item) app.renderDetail(code);
                    else { alert('Item não encontrado.'); app.navigate('dashboard'); }
                }
            }, () => { }).catch(err => { alert('Erro na câmera.'); app.navigate('dashboard'); });
    },

    stopScanner: () => { if (app.scanner) { app.scanner.stop().catch(() => {}); app.scanner = null; } },

    exportCSV: async () => { utils.exportCSV(await db.getAll(app.currentInstituicao?.id)); },
    exportPDF: async () => { utils.exportPDF(await db.getAll(app.currentInstituicao?.id)); },

    clearData: async () => {
        const items = await db.getAll();
        if (items.length > 0) {
            if (confirm(`Backup ${items.length} itens na nuvem antes de limpar?\nOK = Sim\nCancelar = Não`)) {
                try { await sync.runSync(); alert('Backup ok.'); } catch(e) { if (!confirm('Erro no backup. Limpar mesmo assim?')) return; }
            } else return;
        }
        if (confirm('APAGAR TUDO? USUÁRIOS E UNIDADES SERÃO PRESERVADOS.')) {
            await db.clear();
            const protect = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('user_') || k.startsWith('inst_') || k.includes('cloudUsers') || k === 'usersMigrated')) protect.push({ k, v: localStorage.getItem(k) });
            }
            localStorage.clear();
            protect.forEach(({ k, v }) => localStorage.setItem(k, v));
            window.location.reload();
        }
    },

    startAudit: async () => {
        if (!app.isLoggedIn) { alert('Faça login'); app.navigate('dashboard'); return; }
        if (!app.currentInstituicao) { alert('Selecione instituição'); app.navigate('dashboard'); return; }
        try {
            const all = await db.getAll(app.currentInstituicao.id);
            const emp = all.filter(i => i.status === 'Emprestado');
            if (!emp.length && !confirm('Sem itens emprestados. Iniciar mesmo assim?')) { app.navigate('dashboard'); return; }
            app.auditSession = {
                pending: emp.map(i => ({ codigo: i.codigo, patrimonio: i.patrimonio, descricao: i.descricao, responsavel: i.responsavel, categoria: i.categoria })),
                returned: [], startTime: new Date().toISOString()
            };
            app.navigate('audit');
        } catch (error) { alert('Erro: ' + error.message); }
    },

    renderAudit: () => {
        try {
            document.getElementById('audit-pendentes').textContent = app.auditSession.pending.length;
            document.getElementById('audit-devolvidos').textContent = app.auditSession.returned.length;
            document.getElementById('audit-total').textContent = app.auditSession.pending.length + app.auditSession.returned.length;
            const pend = document.getElementById('audit-pending-list');
            if (pend) {
                pend.innerHTML = app.auditSession.pending.length ? app.auditSession.pending.map(i => `<div class="bg-yellow-50 p-2 rounded border-l-4 border-yellow-500"><p class="font-bold text-sm">${i.codigo} ${i.patrimonio ? `<span class="text-xs text-blue-600">(Pat: ${i.patrimonio})</span>` : ''}</p><p class="text-xs text-gray-600">${i.descricao}</p><p class="text-xs text-gray-500">Resp: ${i.responsavel || 'N/A'}</p></div>`).join('') : '<p class="text-center text-green-600 py-4">✅ Todos devolvidos!</p>';
            }
            const ret = document.getElementById('audit-returned-list');
            if (ret) {
                ret.innerHTML = app.auditSession.returned.length ? app.auditSession.returned.map(i => `<div class="bg-green-50 p-2 rounded border-l-4 border-green-500"><p class="font-bold text-sm">${i.codigo} ${i.patrimonio ? `<span class="text-xs text-blue-600">(Pat: ${i.patrimonio})</span>` : ''}</p><p class="text-xs text-gray-600">${i.descricao}</p><p class="text-xs text-green-600">Devolvido: ${i.returnedAt}</p></div>`).join('') : '<p class="text-center text-gray-500 py-4">Nenhum devolvido ainda</p>';
            }
        } catch (error) { alert('Erro render audit: ' + error.message); }
    },

    startAuditScanner: () => {
        try {
            document.getElementById('audit-reader-container').classList.remove('hidden');
            app.auditScanner = new Html5Qrcode("audit-reader");
            app.auditScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, async (code) => { await app.processAuditScan(code); }, () => { }).catch(err => { alert('Erro câmera: ' + err); app.stopAuditScanner(); });
        } catch (error) { alert('Erro scanner: ' + error.message); }
    },

    stopAuditScanner: () => {
        if (app.auditScanner) { app.auditScanner.stop().catch(() => {}); app.auditScanner = null; }
        document.getElementById('audit-reader-container').classList.add('hidden');
    },

    processAuditScan: async (codigo) => {
        try {
            const item = await db.get(codigo);
            if (!item) { alert(`❌ ${codigo} não encontrado.`); return; }
            const idx = app.auditSession.pending.findIndex(p => p.codigo === codigo);
            if (idx === -1) {
                if (app.auditSession.returned.find(r => r.codigo === codigo)) alert(`⚠️ ${codigo} já devolvido.`);
                else alert(`⚠️ ${codigo} não está pendente.`);
                return;
            }
            const info = app.auditSession.pending[idx];
            if (!confirm(`✅ Confirmar devolução?\n${info.codigo}\n${info.descricao}${info.patrimonio ? '\nPat: ' + info.patrimonio : ''}\nResp: ${info.responsavel || 'N/A'}`)) return;
            const dataDev = new Date().toLocaleString('pt-BR');
            item.status = 'Ativo'; item.historico.push(`Devolvido em ${dataDev} por ${app.currentUser.nome || app.currentUser.name} (Conferência)`); item.responsavel = null;
            await db.save(item);
            app.auditSession.pending.splice(idx, 1);
            app.auditSession.returned.push({ ...info, returnedAt: dataDev });
            if (navigator.vibrate) navigator.vibrate(200);
            alert(`✅ Devolvido!\n${info.codigo}\n${info.descricao}`);
            app.renderAudit(); app.updateDashboard();
            if (!app.auditSession.pending.length) setTimeout(() => alert('🎉 Todos devolvidos!'), 500);
        } catch (error) { alert('Erro scan: ' + error.message); }
    },

    generateAuditReport: async () => {
        try {
            if (!app.auditSession.returned.length && !app.auditSession.pending.length) { alert('Nenhuma conferência.'); return; }
            const fmt = prompt('Formato:\n1-PDF\n2-XLSX\n3-CSV', '1');
            if (!['1','2','3'].includes(fmt)) { alert('Inválido.'); return; }
            const data = [];
            app.auditSession.returned.forEach(i => data.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Categoria': i.categoria, 'Responsável': i.responsavel || '-', 'Status': 'Devolvido', 'Data/Hora': i.returnedAt, 'Conferido por': app.currentUser.nome || app.currentUser.name }));
            app.auditSession.pending.forEach(i => data.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Categoria': i.categoria, 'Responsável': i.responsavel || '-', 'Status': 'PENDENTE', 'Data/Hora': '-', 'Conferido por': app.currentUser.nome || app.currentUser.name }));
            if (!data.length) { alert('Sem dados.'); return; }
            const name = `Conferencia_${new Date().toISOString().split('T')[0]}`;
            if (fmt === '3') utils.exportCSVReport(data, name);
            else if (fmt === '2') utils.exportXLSX(data, name, 'Conferência', app.currentInstituicao?.nome || '', new Date().toLocaleString('pt-BR'), app.currentUser.nome || app.currentUser.name, app.currentInstituicao?.logo);
            else utils.exportPDFReport(data, name, 'Conferência', app.currentInstituicao?.nome || '', new Date().toLocaleString('pt-BR'), app.currentUser.nome || app.currentUser.name, app.currentInstituicao?.logo);
            alert(`✅ Gerado!\nDevolvidos: ${app.auditSession.returned.length}\nPendentes: ${app.auditSession.pending.length}`);
        } catch (error) { alert('Erro relatório: ' + error.message); }
    },

    resetAudit: () => { if (confirm('Nova conferência?')) app.startAudit(); },
    stopAudit: () => { app.stopAuditScanner(); },

    renderReports: () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); app.navigate('dashboard'); return; }
        const reports = [
            { id: 'completo', icon: '📋', title: 'Inventário Completo', desc: 'Todos os itens', color: 'blue' },
            { id: 'emprestados', icon: '📤', title: 'Emprestados', desc: 'Itens emprestados', color: 'yellow' },
            { id: 'manutencao', icon: '🔧', title: 'Manutenção', desc: 'Status manutenção', color: 'orange' },
            { id: 'baixados', icon: '🗑️', title: 'Baixados', desc: 'Itens retirados', color: 'red' },
            { id: 'observacoes', icon: '📝', title: 'Observações', desc: 'Pendências', color: 'amber' },
            { id: 'categorias', icon: '📊', title: 'Por Categoria', desc: 'Quantitativo', color: 'purple' },
            { id: 'historico', icon: '📜', title: 'Histórico', desc: 'Log alterações', color: 'indigo' }
        ];
        const cont = document.getElementById('reports-list');
        if (!cont) return;
        cont.innerHTML = '';
        reports.forEach(r => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow border-l-4 border-' + r.color + '-500';
            card.innerHTML = `<div class="flex items-start gap-3 mb-3"><div class="text-3xl">${r.icon}</div><div class="flex-1"><h3 class="font-bold text-gray-800">${r.title}</h3><p class="text-xs text-gray-600 mt-1">${r.desc}</p></div></div><div class="flex gap-2"><button onclick="app.generateReport('${r.id}','pdf')" class="flex-1 bg-red-600 text-white text-xs py-2 rounded font-bold">📄 PDF</button><button onclick="app.generateReport('${r.id}','xlsx')" class="flex-1 bg-green-600 text-white text-xs py-2 rounded font-bold">📊 XLSX</button><button onclick="app.generateReport('${r.id}','csv')" class="flex-1 bg-blue-600 text-white text-xs py-2 rounded font-bold"> CSV</button></div>`;
            cont.appendChild(card);
        });
    },

    generateReport: async (reportId, format) => {
        const items = await db.getAll(app.currentInstituicao?.id);
        const inst = app.currentInstituicao?.nome || 'Inventário';
        const dataGer = new Date().toLocaleString('pt-BR');
        const user = app.currentUser?.nome || app.currentUser?.name || 'Sistema';
        const logo = app.currentInstituicao?.logo || null;
        let data = [], titulo = '';
        switch(reportId) {
            case 'completo': titulo = 'Inventário Completo'; data = items.map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Status': i.status, 'Responsável': i.responsavel || '-', 'Entrada': i.dataEntrada || '-', 'Observações': i.observacao || '-' })); break;
            case 'emprestados': titulo = 'Emprestados'; data = items.filter(i => i.status === 'Emprestado').map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-', 'Entrada': i.dataEntrada || '-' })); if (!data.length) { alert('Nenhum.'); return; } break;
            case 'manutencao': titulo = 'Manutenção'; data = items.filter(i => i.status === 'Manutenção').map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-' })); if (!data.length) { alert('Nenhum.'); return; } break;
            case 'baixados': titulo = 'Baixados'; data = items.filter(i => i.status === 'Baixado').map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao })); if (!data.length) { alert('Nenhum.'); return; } break;
            case 'observacoes': titulo = 'Observações'; data = items.filter(i => i.observacao?.trim()).map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Observação': i.observacao })); if (!data.length) { alert('Nenhum.'); return; } break;
            case 'categorias': titulo = 'Por Categoria'; const cats = {}; items.forEach(i => { const c = i.categoria || 'Outro'; if (!cats[c]) cats[c] = { total: 0, ativos: 0, emp: 0, man: 0, baix: 0 }; cats[c].total++; if (i.status === 'Ativo') cats[c].ativos++; else if (i.status === 'Emprestado') cats[c].emp++; else if (i.status === 'Manutenção') cats[c].man++; else if (i.status === 'Baixado') cats[c].baix++; }); data = Object.keys(cats).map(c => ({ 'Categoria': c, 'Total': cats[c].total, 'Ativos': cats[c].ativos, 'Emprestados': cats[c].emp, 'Manutenção': cats[c].man, 'Baixados': cats[c].baix })); break;
            case 'historico': titulo = 'Histórico'; items.forEach(i => { if (i.historico?.length) i.historico.forEach(h => data.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Evento': h })); }); if (!data.length) { alert('Nenhum.'); return; } break;
        }
        if (!data.length) { alert('Sem dados.'); return; }
        const name = `${titulo.replace(/\s+/g,'_')}_${inst}_${new Date().toISOString().split('T')[0]}`;
        if (format === 'csv') utils.exportCSVReport(data, name);
        else if (format === 'xlsx') utils.exportXLSX(data, name, titulo, inst, dataGer, user, logo);
        else utils.exportPDFReport(data, name, titulo, inst, dataGer, user, logo);
        alert(`✅ "${titulo}" gerado!\n${data.length} registros em ${format.toUpperCase()}`);
    },

    // ===== CORREÇÃO: Lista de usuários sempre abre =====
    openUserManagement: () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        
        const cont = document.getElementById('users-list');
        if (!cont) { alert('Erro: container não encontrado'); return; }
        cont.innerHTML = '';
        
        // Lista TODOS os usuários (exceto admin master local)
        const allUsers = [...app.localUsers];
        
        if (allUsers.length === 0) {
            cont.innerHTML = '<p class="text-center text-gray-500 py-4">Nenhum usuário cadastrado ainda.<br>Crie o primeiro abaixo.</p>';
        } else {
            allUsers.forEach(u => {
                // Não mostra o admin master local na lista
                if (u.username === 'admin' && u.master) return;
                
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center p-2 bg-gray-100 rounded mb-2';
                div.innerHTML = `<div class="flex-1"><p class="font-bold">${u.nome || u.name || u.username}</p><p class="text-xs text-gray-600">@${u.username} - ${app.accessLevels[u.nivel || u.level]?.name || u.nivel || u.level}</p></div><div class="flex gap-2"><button onclick="app.editUser('${u.username}')" class="text-blue-600 text-xs">Editar</button><button onclick="app.deleteUser('${u.username}')" class="text-red-600 text-xs">Excluir</button></div>`;
                cont.appendChild(div);
            });
        }
        
        document.getElementById('user-management-modal').classList.remove('hidden');
    },

    closeUserManagement: () => { document.getElementById('user-management-modal').classList.add('hidden'); },

    createUser: async () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        const name = document.getElementById('new-user-name').value.trim();
        const username = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value;
        const level = document.getElementById('new-user-level').value;
        if (!name || !username || !password) { alert('Preencha tudo'); return; }
        if (username.includes(' ')) { alert('Sem espaços'); return; }
        if (app.localUsers.find(u => u.username === username)) { alert('Já existe'); return; }
        
        const hash = await utils.hashPassword(password);
        const newUser = { username, nome: name, senhaHash: hash, nivel: level, ativo: true, master: false };
        
        app.localUsers.push(newUser);
        localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
        
        const res = await sync.syncUsers([newUser]);
        if (res.status === 'success') {
            alert(`✅ Criado!\nNome: ${name}\nUsuário: ${username}\nNível: ${app.accessLevels[level]?.name || level}`);
            document.getElementById('new-user-name').value = '';
            document.getElementById('new-user-username').value = '';
            document.getElementById('new-user-password').value = '';
            app.openUserManagement();
        } else {
            alert('Usuário criado localmente, mas erro ao sincronizar: ' + res.message);
            app.openUserManagement();
        }
    },

    editUser: async (username) => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return;
        const user = app.localUsers.find(u => u.username === username);
        if (!user) { alert('Usuário não encontrado'); return; }
        
        const newLevel = prompt(`Alterar nível de ${user.nome || user.name}?\nAtual: ${app.accessLevels[user.nivel || user.level]?.name || user.nivel || user.level}\n\nDigite: admin, editor ou viewer`, user.nivel || user.level);
        if (newLevel && ['admin', 'editor', 'viewer'].includes(newLevel)) {
            user.nivel = newLevel;
            const res = await sync.syncUsers([user]);
            if (res.status === 'success') {
                localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                alert(`Nível alterado para: ${app.accessLevels[newLevel]?.name || newLevel}`);
            } else alert('Erro ao atualizar: ' + res.message);
        } else if (newLevel) alert('Nível inválido');
        
        if (confirm('Alterar senha?')) {
            const newPass = prompt('Nova senha:');
            if (newPass?.trim()) {
                user.senhaHash = await utils.hashPassword(newPass.trim());
                const res = await sync.syncUsers([user]);
                if (res.status === 'success') {
                    localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                    alert('Senha alterada!');
                } else alert('Erro: ' + res.message);
            }
        }
        app.openUserManagement();
    },

    deleteUser: async (username) => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return;
        if (confirm(`Excluir ${username}?\nAcesso será revogado.`)) {
            const idx = app.localUsers.findIndex(u => u.username === username);
            if (idx > -1) {
                app.localUsers.splice(idx, 1);
                localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                await sync.syncUsers([{ username, ativo: false }]);
                alert('Excluído e revogado.');
            }
            app.openUserManagement();
        }
    },

    openInstituicaoManagement: () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        app.instituicoes.init();
        const insts = app.instituicoes.getAll();
        const cont = document.getElementById('instituicoes-list');
        if (!cont) return;
        cont.innerHTML = '';
        insts.forEach(inst => {
            const logoPrev = inst.logo ? `<img src="${inst.logo}" class="w-8 h-8 rounded mr-2">` : '';
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2 bg-gray-100 rounded mb-2';
            div.innerHTML = `<div class="flex items-center">${logoPrev}<div><p class="font-bold">${inst.nome}</p><p class="text-xs text-gray-600">${inst.cidade || ''}</p></div></div>${inst.id !== 'default' ? `<button onclick="app.deleteInstituicao('${inst.id}')" class="text-red-600 text-sm">Excluir</button>` : ''}`;
            cont.appendChild(div);
        });
        document.getElementById('instituicao-management-modal').classList.remove('hidden');
    },

    closeInstituicaoManagement: () => { document.getElementById('instituicao-management-modal').classList.add('hidden'); },

    createInstituicao: async () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return;
        const nome = document.getElementById('new-inst-nome').value.trim();
        const cidade = document.getElementById('new-inst-cidade').value.trim();
        const logoInput = document.getElementById('new-inst-logo');
        if (!nome) { alert('Informe o nome'); return; }
        let logoBase64 = null;
        if (logoInput.files[0]) {
            try { logoBase64 = await utils.compressImage(logoInput.files[0], 200, 200, 0.7); } catch(e) { alert('Erro logo: ' + e.message); return; }
        }
        app.instituicoes.create({ nome, cidade, logo: logoBase64 });
        alert(`Unidade criada!\n${nome}${cidade ? ' - ' + cidade : ''}${logoBase64 ? '\n✅ Logo ok' : '\n⚠️ Sem logo'}`);
        document.getElementById('new-inst-nome').value = '';
        document.getElementById('new-inst-cidade').value = '';
        logoInput.value = '';
        app.openInstituicaoManagement();
    },

    deleteInstituicao: (id) => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return;
        if (confirm('Excluir unidade?')) { app.instituicoes.delete(id); app.openInstituicaoManagement(); }
    },

    users: {
        init: async () => {
            // Garante admin local master
            if (!localStorage.getItem('user_admin')) {
                localStorage.setItem('user_admin', JSON.stringify({ username: 'admin', password: 'musica2026', level: 'admin', name: 'Administrador', master: true }));
            }
            
            // MIGRAÇÃO: Converte usuários antigos para hash e envia para nuvem
            if (!localStorage.getItem('usersMigrated')) {
                const oldKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('user_') && key !== 'user_admin') oldKeys.push(key);
                }
                
                if (oldKeys.length > 0) {
                    const usersToMigrate = [];
                    for (const key of oldKeys) {
                        try {
                            const u = JSON.parse(localStorage.getItem(key));
                            if (u.username && u.password) {
                                const hash = await utils.hashPassword(u.password);
                                usersToMigrate.push({ username: u.username, nome: u.name || u.username, senhaHash: hash, nivel: u.level || 'viewer', ativo: true, master: false });
                            }
                        } catch(e) {}
                    }
                    
                    if (usersToMigrate.length > 0) {
                        // Adiciona ao cache local (sem sobrescrever)
                        for (const u of usersToMigrate) {
                            if (!app.localUsers.find(x => x.username === u.username)) {
                                app.localUsers.push(u);
                            }
                        }
                        localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                        
                        // Envia para planilha
                        await sync.syncUsers(usersToMigrate);
                        
                        // Limpa chaves antigas
                        oldKeys.forEach(k => localStorage.removeItem(k));
                        localStorage.setItem('usersMigrated', 'true');
                        console.log(`✅ Migrados ${usersToMigrate.length} usuários.`);
                    } else {
                        localStorage.setItem('usersMigrated', 'true');
                    }
                } else {
                    localStorage.setItem('usersMigrated', 'true');
                }
            }
        },
        getLocal: (username) => {
            const data = localStorage.getItem(`user_${username}`);
            return data ? JSON.parse(data) : null;
        }
    },

    instituicoes: {
        init: () => {
            if (!localStorage.getItem('inst_default')) localStorage.setItem('inst_default', JSON.stringify({ id: 'default', nome: 'Escola de Música', cidade: 'Sede' }));
        },
        create: (d) => { const id = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); localStorage.setItem(`inst_${id}`, JSON.stringify({ id, ...d })); },
        getAll: () => { const arr = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('inst_')) try { arr.push(JSON.parse(localStorage.getItem(k))); } catch(e) {} } return arr; },
        get: (id) => { const d = localStorage.getItem(`inst_${id}`); return d ? JSON.parse(d) : null; },
        delete: (id) => { if (id === 'default') { alert('Não pode excluir padrão'); return; } localStorage.removeItem(`inst_${id}`); }
    },

    accessLevels: {
        admin: { name: 'Administrador', canCreate: true, canEdit: true, canDelete: true, canBorrow: true, canMaintenance: true, canSync: true, canManageUsers: true },
        editor: { name: 'Editor', canCreate: true, canEdit: true, canDelete: false, canBorrow: true, canMaintenance: true, canSync: false, canManageUsers: false },
        viewer: { name: 'Visualizador', canCreate: false, canEdit: false, canDelete: false, canBorrow: false, canMaintenance: false, canSync: false, canManageUsers: false }
    }
};

document.addEventListener('DOMContentLoaded', app.init);
