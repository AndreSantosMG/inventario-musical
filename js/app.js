const app = {
    isLoggedIn: false, currentUser: null, currentInstituicao: null,
    scanner: null, auditScanner: null, currentItem: null,
    auditSession: { pending: [], returned: [], startTime: null },
    localUsers: [],

    init: async () => {
        await db.init();
        app.instituicoes.init();
        app.localUsers = await sync.fetchUsers();
        await app.users.init();
        
        const savedSession = localStorage.getItem('sessionData');
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                const user = app.localUsers.find(u => u.username === session.username) || app.users.getLocal(session.username);
                if (user && session.instituicao) {
                    app.isLoggedIn = true; app.currentUser = user; app.currentInstituicao = session.instituicao;
                    document.getElementById('btn-login-toggle').textContent = `🔓 ${user.nome || user.name}`;
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
        const hLogo = document.getElementById('header-logo');
        const lLogo = document.getElementById('login-logo');
        if (app.currentInstituicao?.logo) {
            if (hLogo) { hLogo.src = app.currentInstituicao.logo; hLogo.style.display = 'block'; }
            if (lLogo) { lLogo.src = app.currentInstituicao.logo; lLogo.style.display = 'block'; }
        } else {
            if (hLogo) hLogo.style.display = 'none';
            if (lLogo) lLogo.style.display = 'none';
        }
    },

    forceUpdate: () => {
        if (confirm('Isso vai limpar o cache e recarregar.\n\nUSUÁRIOS e UNIDADES serão PRESERVADOS.\n\nOK?')) {
            const protect = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('user_') || k.startsWith('inst_') || k === 'cloudUsersCache' || k === 'cloudUsersLastSync' || k === 'usersMigrated')) {
                    protect.push({ k, v: localStorage.getItem(k) });
                }
            }
            localStorage.clear();
            protect.forEach(({ k, v }) => localStorage.setItem(k, v));
            if ('caches' in window) caches.keys().then(n => n.forEach(c => caches.delete(c)));
            window.location.reload(true);
        }
    },

    navigate: (viewId) => {
        if (!app.isLoggedIn && viewId !== 'login-required') { app.showLoginScreen(); return; }
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const t = document.getElementById(`view-${viewId}`);
        if (t) t.classList.remove('hidden');
        if (viewId === 'dashboard') { app.renderList(); app.updateInstituicaoDisplay(); app.showAdminButtons(); }
        if (viewId === 'add') document.getElementById('item-codigo').value = app.generateCode();
        if (viewId === 'scanner') app.startScanner();
        if (viewId === 'audit') app.renderAudit();
        if (viewId === 'reports') app.renderReports();
    },

    // NOVA FUNÇÃO: Mostra botões de admin no dashboard
        showAdminButtons: () => {
        const userLevel = app.currentUser?.nivel || app.currentUser?.level;
        const isAdmin = userLevel === 'admin';
        
        const btnUsers = document.getElementById('btn-users-dashboard');
        if (btnUsers) {
            if (isAdmin) {
                btnUsers.style.display = 'block';
            } else {
                btnUsers.style.display = 'none';
            }
        }
        
        const btnReports = document.getElementById('btn-reports');
        if (btnReports) {
            if (isAdmin) { btnReports.classList.remove('hidden'); btnReports.style.display = 'block'; }
            else { btnReports.classList.add('hidden'); btnReports.style.display = 'none'; }
        }
        
        const btnAudit = document.getElementById('btn-audit');
        if (btnAudit) {
            if (app.currentUser) { btnAudit.classList.remove('hidden'); btnAudit.style.display = 'block'; }
            else { btnAudit.classList.add('hidden'); btnAudit.style.display = 'none'; }
        }
    },

    generateCode: () => `FDSF-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,

    updateInstituicaoDisplay: () => {
        const d = document.getElementById('current-instituicao-display');
        if (!d) return;
        if (app.currentInstituicao) { d.textContent = `📍 ${app.currentInstituicao.nome} - ${app.currentInstituicao.cidade || ''}`; d.classList.remove('hidden'); }
        else d.classList.add('hidden');
    },

    toggleLogin: () => {
        if (app.isLoggedIn) {
            if (confirm('Deseja sair?')) {
                app.isLoggedIn = false; app.currentUser = null; app.currentInstituicao = null;
                localStorage.removeItem('sessionData');
                const b = document.getElementById('btn-login-toggle'); if (b) b.textContent = '';
                app.showLoginScreen();
            }
        } else app.openLoginModal();
    },

    openLoginModal: () => {
        try {
            app.instituicoes.init();
            const insts = app.instituicoes.getAll();
            const sInst = document.getElementById('login-instituicao');
            if (sInst) {
                sInst.innerHTML = '<option value="">-- Selecione sua unidade --</option>';
                insts.forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = `${i.nome} - ${i.cidade || ''}`; sInst.appendChild(o); });
            }
            const sUser = document.getElementById('login-user-select');
            if (sUser) {
                sUser.innerHTML = '<option value="">-- Selecione ou digite abaixo --</option>';
                const adm = app.users.getLocal('admin');
                if (adm) { const o = document.createElement('option'); o.value = 'admin'; o.textContent = ` admin (Master)`; sUser.appendChild(o); }
                if (app.localUsers) {
                    app.localUsers.forEach(u => {
                        if (u.username !== 'admin') { const o = document.createElement('option'); o.value = u.username; o.textContent = `${u.nome || u.username} (${app.accessLevels[u.nivel || u.level]?.name || u.nivel})`; sUser.appendChild(o); }
                    });
                }
            }
            const p = document.getElementById('login-pass'); if (p) p.value = '';
            const t = document.getElementById('login-user-text'); if (t) t.value = '';
            const m = document.getElementById('login-modal'); if (m) m.classList.remove('hidden');
        } catch (e) { alert('Erro login: ' + e.message); }
    },

    doLogin: async () => {
        let u = document.getElementById('login-user-select').value.trim();
        const t = document.getElementById('login-user-text').value.trim();
        if (t) u = t;
        const p = document.getElementById('login-pass').value;
        const iId = document.getElementById('login-instituicao').value;
        
        if (!iId) { alert('Selecione a unidade'); return; }
        if (!u) { alert('Selecione ou digite o usuário'); return; }
        
        if (u === 'admin') {
            const la = app.users.getLocal('admin');
            if (!la || la.password !== p) { alert('Senha incorreta!'); return; }
            const inst = app.instituicoes.get(iId); if (!inst) { alert('Unidade não encontrada'); return; }
            app.completeLogin(la, inst); return;
        }
        
        const cu = app.localUsers.find(x => x.username === u);
        if (!cu) { alert('Usuário não encontrado.'); return; }
        const hash = await utils.hashPassword(p);
        if (cu.senhaHash !== hash) { alert('Senha incorreta!'); return; }
        const inst = app.instituicoes.get(iId); if (!inst) { alert('Unidade não encontrada'); return; }
        app.completeLogin(cu, inst);
    },

    completeLogin: (user, inst) => {
        app.isLoggedIn = true; app.currentUser = user; app.currentInstituicao = inst;
        localStorage.setItem('sessionData', JSON.stringify({ username: user.username, instituicao: inst }));
        const b = document.getElementById('btn-login-toggle'); if (b) b.textContent = `🔓 ${user.nome || user.name}`;
        document.getElementById('login-modal').classList.add('hidden');
        app.navigate('dashboard'); app.updateDashboard(); app.updateInstituicaoDisplay(); app.updateLogoDisplay();
        const h = new Date().getHours(); const s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
        setTimeout(() => alert(`${s}, ${user.nome || user.name}!\n\nBem-vindo(a).\nUnidade: ${inst.nome}`), 300);
    },

    closeLogin: () => { document.getElementById('login-modal').classList.add('hidden'); },

    saveItem: async (e) => {
        e.preventDefault();
        if (!app.isLoggedIn || !app.currentInstituicao) { alert('Faça login'); return; }
        const f = document.getElementById('item-foto'); let foto = '';
        if (f.files[0]) foto = await utils.compressImage(f.files[0]);
        else if (!confirm('Continuar sem foto?')) return;
        const item = { codigo: document.getElementById('item-codigo').value, patrimonio: document.getElementById('item-patrimonio').value.trim(), categoria: document.getElementById('item-categoria').value, descricao: document.getElementById('item-descricao').value, foto: foto, observacao: document.getElementById('item-obs').value.trim(), status: 'Ativo', dataEntrada: new Date().toISOString().split('T')[0], historico: [`Criado em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`], instituicao: app.currentInstituicao.id, instituicaoNome: app.currentInstituicao.nome, instituicaoCidade: app.currentInstituicao.cidade };
        await db.save(item); alert('Salvo!'); document.getElementById('form-add').reset(); app.navigate('dashboard'); app.updateDashboard();
    },

    renderList: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        const c = document.getElementById('items-list'); if (!c) return; c.innerHTML = '';
        const f = document.getElementById('search-input').value.toLowerCase();
        const filt = items.filter(i => i.codigo.toLowerCase().includes(f) || i.descricao.toLowerCase().includes(f) || (i.patrimonio && i.patrimonio.toLowerCase().includes(f)));
        if (!filt.length) { c.innerHTML = '<p class="text-center text-gray-500 py-8">Nenhum item</p>'; return; }
        filt.forEach(i => {
            const pb = i.patrimonio ? `<p class="text-xs text-blue-600 font-mono">Pat: ${i.patrimonio}</p>` : '';
            const d = document.createElement('div'); d.className = 'bg-white p-3 rounded shadow border-l-4 ' + (i.status === 'Ativo' ? 'border-green-500' : 'border-red-500');
            d.innerHTML = `<div class="flex justify-between items-center cursor-pointer" onclick="app.renderDetail('${i.codigo}')"><div><p class="font-bold text-sm">${i.codigo} ${i.observacao?.trim() ? '📝' : ''}</p><p class="text-xs text-gray-600">${i.descricao}</p>${pb}</div><span class="text-xs px-2 py-1 rounded bg-gray-200">${i.status}</span></div>`;
            c.appendChild(d);
        });
    },
    filterItems: () => { app.renderList(); },

    renderDetail: async (cod) => {
        const i = await db.get(cod); if (!i) { alert('Não encontrado'); app.navigate('dashboard'); return; }
        app.currentItem = i; const c = document.getElementById('detail-content'); if (!c) return;
        const h = i.historico.map(x => `<li class="text-xs text-gray-600">• ${x}</li>`).join('');
        const pd = i.patrimonio ? `<p class="text-sm font-mono bg-blue-50 px-2 py-1 rounded inline-block mt-1">🏷️ Pat: <strong>${i.patrimonio}</strong></p>` : '';
        let fu = i.foto || ''; if (fu.includes('lh3.googleusercontent.com/d/')) { const fid = fu.match(/\/d\/([^\/\?]+)/)?.[1]; if (fid) fu = 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w1000'; }
        const fh = fu ? `<img src="${fu}" class="w-full h-48 object-cover rounded-lg mb-4" onerror="this.style.display='none'">` : '';
        c.innerHTML = `${fh}<h2 class="text-2xl font-bold">${i.codigo}</h2>${pd}<p class="text-gray-600">${i.categoria} | ${i.descricao}</p><p class="text-xs text-blue-600 font-bold"> ${i.instituicaoNome || ''} ${i.instituicaoCidade ? '- ' + i.instituicaoCidade : ''}</p><div class="bg-gray-100 p-3 rounded mt-2"><p><strong>Status:</strong> ${i.status}</p><p><strong>Responsável:</strong> ${i.responsavel || 'N/A'}</p></div><div class="bg-yellow-50 p-3 rounded mt-2 border border-yellow-200"><div class="flex justify-between items-center mb-1"><p class="font-bold text-sm text-yellow-800">Observações:</p><button id="btn-edit-obs" onclick="app.editObservation()" class="hidden text-xs bg-yellow-600 text-white px-3 py-1 rounded shadow">Editar</button></div><p id="detail-obs-text" class="text-sm text-gray-700 whitespace-pre-wrap">${i.observacao?.trim() || 'Nenhuma.'}</p></div><div class="mt-4 bg-white p-4 rounded-lg shadow text-center border"><p class="text-sm font-bold mb-2">QR Code</p><div id="detail-qrcode" class="flex justify-center mb-2"></div><p class="text-xs font-mono text-gray-600 break-all">${i.codigo}</p></div><div class="mt-4"><h4 class="font-bold text-sm mb-2">Histórico</h4><ul class="space-y-1">${h}</ul></div>`;
        setTimeout(() => { const q = document.getElementById("detail-qrcode"); if (q) { q.innerHTML = ''; new QRCode(q, { text: i.codigo, width: 150, height: 150 }); } }, 100);
        const be = document.getElementById('btn-edit-obs'); if (app.isLoggedIn && app.currentUser && (app.currentUser.nivel || app.currentUser.level) === 'admin') be.classList.remove('hidden'); else be.classList.add('hidden');
        const aa = document.getElementById('admin-actions'); if (aa) app.isLoggedIn ? aa.classList.remove('hidden') : aa.classList.add('hidden');
        app.navigate('detail');
    },

    editObservation: async () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        const n = prompt('Editar (vazio para limpar):', app.currentItem.observacao || '');
        if (n !== null) { app.currentItem.observacao = n.trim(); app.currentItem.historico.push(`${n.trim() ? 'Atualizada' : 'Limpa'} em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`); await db.save(app.currentItem); app.renderDetail(app.currentItem.codigo); app.renderList(); }
    },

    updateStatus: async (s) => {
        if (!app.isLoggedIn) return;
        let r = app.currentUser.nome || app.currentUser.username; let o = '';
        if (s === 'Emprestado') { r = prompt('Responsável:') || r; o = prompt('Previsão:') || '-'; }
        else if (s === 'Manutenção') o = prompt('Motivo/OS:') || '-';
        app.currentItem.status = s; app.currentItem.responsavel = r;
        app.currentItem.historico.push(`${s} em ${new Date().toLocaleString()} por ${r}. Obs: ${o}`);
        await db.save(app.currentItem); alert(`Status: ${s}`); app.renderDetail(app.currentItem.codigo); app.updateDashboard();
    },

    baixarItem: async () => {
        if (!app.isLoggedIn) return; const m = prompt('Motivo:'); if (!m) return;
        app.currentItem.status = 'Baixado'; app.currentItem.historico.push(`BAIXA em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}. Motivo: ${m}`);
        await db.save(app.currentItem); alert('Baixado.'); app.navigate('dashboard'); app.updateDashboard();
    },

    editItem: async () => {
        if (!app.isLoggedIn) { alert('Faça login'); return; }
        const i = app.currentItem;
        document.getElementById('edit-codigo').value = i.codigo; document.getElementById('edit-patrimonio').value = i.patrimonio || '';
        document.getElementById('edit-categoria').value = i.categoria; document.getElementById('edit-descricao').value = i.descricao;
        document.getElementById('edit-obs').value = i.observacao || '';
        const p = document.getElementById('edit-foto-preview'); if (i.foto) { p.src = i.foto; p.style.display = 'block'; } else p.style.display = 'none';
        document.getElementById('edit-item-modal').classList.remove('hidden');
    },

    saveEditItem: async () => {
        if (!app.isLoggedIn) return;
        const f = document.getElementById('edit-foto'); let foto = app.currentItem.foto;
        if (f.files[0]) { foto = await utils.compressImage(f.files[0]); app.currentItem.historico.push(`Foto atualizada em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`); }
        const np = document.getElementById('edit-patrimonio').value.trim();
        if (np !== (app.currentItem.patrimonio || '')) app.currentItem.historico.push(`Patrimônio alterado para "${np || 'vazio'}"`);
        app.currentItem.patrimonio = np; app.currentItem.categoria = document.getElementById('edit-categoria').value;
        app.currentItem.descricao = document.getElementById('edit-descricao').value; app.currentItem.observacao = document.getElementById('edit-obs').value.trim();
        app.currentItem.foto = foto; app.currentItem.historico.push(`Editado em ${new Date().toLocaleString()} por ${app.currentUser.nome || app.currentUser.name}`);
        await db.save(app.currentItem); alert('Atualizado!'); document.getElementById('edit-item-modal').classList.add('hidden'); app.renderDetail(app.currentItem.codigo); app.renderList();
    },
    cancelEditItem: () => { document.getElementById('edit-item-modal').classList.add('hidden'); },

    deleteItem: async () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        if (!confirm(`Excluir ${app.currentItem.codigo}?\nIRREVERSÍVEL!`)) return; if (!confirm('TEM CERTEZA?')) return;
        await localforage.removeItem(app.currentItem.codigo); alert('Excluído.'); app.navigate('dashboard'); app.updateDashboard();
    },

    updateDashboard: async () => {
        const i = await db.getAll(app.currentInstituicao?.id);
        const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        s('dash-total', i.length); s('dash-emprestados', i.filter(x => x.status === 'Emprestado').length);
        s('dash-manutencao', i.filter(x => x.status === 'Manutenção').length); s('dash-ativos', i.filter(x => x.status === 'Ativo').length);
    },

    printLabels: async () => {
        const i = await db.getAll(app.currentInstituicao?.id); if (!i.length) { alert('Nenhum item'); return; }
        const w = window.open('', '_blank');
        const h = i.map(x => { const q = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(x.codigo)}`; const p = x.patrimonio ? `<div class="label-pat">Pat: ${x.patrimonio}</div>` : ''; return `<div class="label"><img src="${q}" class="qr-img"><div class="label-text"><div class="label-code">${x.codigo}</div><div class="label-desc">${x.descricao}</div>${p}<div class="label-inst">${x.instituicaoNome || ''}</div></div></div>`; }).join('');
        w.document.write(`<html><head><title>Etiquetas</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px}.container{display:flex;flex-wrap:wrap;gap:15px}.label{border:1px dashed #ccc;padding:10px;width:180px;text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center}.qr-img{width:120px;height:120px;margin-bottom:8px}.label-code{font-weight:bold;font-size:12px;margin-bottom:4px}.label-desc{font-size:10px;color:#555;word-wrap:break-word}.label-pat{font-size:9px;color:#1e40af;font-weight:bold;margin-top:2px}.label-inst{font-size:9px;color:#888;margin-top:4px;font-style:italic}@media print{body{padding:0}.label{border:1px solid #000}.no-print{display:none}}</style></head><body><div class="no-print" style="text-align:center;margin-bottom:20px"><h2>Etiquetas (${i.length} itens)</h2><button onclick="window.print()" style="padding:10px 20px;font-size:16px;cursor:pointer">🖨️ Imprimir</button></div><div class="container">${h}</div></body></html>`);
        w.document.close();
    },

    startScanner: () => {
        app.scanner = new Html5Qrcode("reader");
        app.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, async (c) => {
            app.stopScanner();
            if (!app.isLoggedIn) { alert(`Código: ${c}\nFaça login`); app.navigate('dashboard'); }
            else { const i = await db.get(c); if (i) app.renderDetail(c); else { alert('Não encontrado.'); app.navigate('dashboard'); } }
        }, () => { }).catch(e => { alert('Erro câmera.'); app.navigate('dashboard'); });
    },
    stopScanner: () => { if (app.scanner) { app.scanner.stop().catch(() => {}); app.scanner = null; } },
    exportCSV: async () => { utils.exportCSV(await db.getAll(app.currentInstituicao?.id)); },
    exportPDF: async () => { utils.exportPDF(await db.getAll(app.currentInstituicao?.id)); },

    clearData: async () => {
        const i = await db.getAll();
        if (i.length > 0) { if (confirm(`Backup ${i.length} itens?\nOK = Sim\nCancelar = Não`)) { try { await sync.runSync(); alert('Backup ok.'); } catch(e) { if (!confirm('Erro backup. Limpar mesmo assim?')) return; } } else return; }
        if (confirm('APAGAR TUDO? USUÁRIOS E UNIDADES PRESERVADOS.')) {
            await db.clear(); const p = [];
            for (let x = 0; x < localStorage.length; x++) { const k = localStorage.key(x); if (k && (k.startsWith('user_') || k.startsWith('inst_') || k.includes('cloudUsers') || k === 'usersMigrated')) p.push({ k, v: localStorage.getItem(k) }); }
            localStorage.clear(); p.forEach(({ k, v }) => localStorage.setItem(k, v)); window.location.reload();
        }
    },

    startAudit: async () => {
        if (!app.isLoggedIn) { alert('Faça login'); app.navigate('dashboard'); return; }
        if (!app.currentInstituicao) { alert('Selecione instituição'); app.navigate('dashboard'); return; }
        try {
            const a = await db.getAll(app.currentInstituicao.id); const e = a.filter(x => x.status === 'Emprestado');
            if (!e.length && !confirm('Sem itens emprestados. Iniciar mesmo assim?')) { app.navigate('dashboard'); return; }
            app.auditSession = { pending: e.map(x => ({ codigo: x.codigo, patrimonio: x.patrimonio, descricao: x.descricao, responsavel: x.responsavel, categoria: x.categoria })), returned: [], startTime: new Date().toISOString() };
            app.navigate('audit');
        } catch (e) { alert('Erro: ' + e.message); }
    },

    renderAudit: () => {
        try {
            document.getElementById('audit-pendentes').textContent = app.auditSession.pending.length;
            document.getElementById('audit-devolvidos').textContent = app.auditSession.returned.length;
            document.getElementById('audit-total').textContent = app.auditSession.pending.length + app.auditSession.returned.length;
            const p = document.getElementById('audit-pending-list');
            if (p) p.innerHTML = app.auditSession.pending.length ? app.auditSession.pending.map(i => `<div class="bg-yellow-50 p-2 rounded border-l-4 border-yellow-500"><p class="font-bold text-sm">${i.codigo} ${i.patrimonio ? `<span class="text-xs text-blue-600">(Pat: ${i.patrimonio})</span>` : ''}</p><p class="text-xs text-gray-600">${i.descricao}</p><p class="text-xs text-gray-500">Resp: ${i.responsavel || 'N/A'}</p></div>`).join('') : '<p class="text-center text-green-600 py-4">✅ Todos devolvidos!</p>';
            const r = document.getElementById('audit-returned-list');
            if (r) r.innerHTML = app.auditSession.returned.length ? app.auditSession.returned.map(i => `<div class="bg-green-50 p-2 rounded border-l-4 border-green-500"><p class="font-bold text-sm">${i.codigo} ${i.patrimonio ? `<span class="text-xs text-blue-600">(Pat: ${i.patrimonio})</span>` : ''}</p><p class="text-xs text-gray-600">${i.descricao}</p><p class="text-xs text-green-600">Devolvido: ${i.returnedAt}</p></div>`).join('') : '<p class="text-center text-gray-500 py-4">Nenhum devolvido ainda</p>';
        } catch (e) { alert('Erro render: ' + e.message); }
    },

    startAuditScanner: () => {
        try {
            document.getElementById('audit-reader-container').classList.remove('hidden');
            app.auditScanner = new Html5Qrcode("audit-reader");
            app.auditScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, async (c) => { await app.processAuditScan(c); }, () => { }).catch(e => { alert('Erro câmera: ' + e); app.stopAuditScanner(); });
        } catch (e) { alert('Erro scanner: ' + e.message); }
    },
    stopAuditScanner: () => { if (app.auditScanner) { app.auditScanner.stop().catch(() => {}); app.auditScanner = null; } document.getElementById('audit-reader-container').classList.add('hidden'); },

    processAuditScan: async (c) => {
        try {
            const i = await db.get(c); if (!i) { alert(`❌ ${c} não encontrado.`); return; }
            const idx = app.auditSession.pending.findIndex(p => p.codigo === c);
            if (idx === -1) { if (app.auditSession.returned.find(r => r.codigo === c)) alert(`⚠️ ${c} já devolvido.`); else alert(`⚠️ ${c} não está pendente.`); return; }
            const info = app.auditSession.pending[idx];
            if (!confirm(`✅ Confirmar?\n${info.codigo}\n${info.descricao}${info.patrimonio ? '\nPat: ' + info.patrimonio : ''}\nResp: ${info.responsavel || 'N/A'}`)) return;
            const d = new Date().toLocaleString('pt-BR');
            i.status = 'Ativo'; i.historico.push(`Devolvido em ${d} por ${app.currentUser.nome || app.currentUser.name} (Conferência)`); i.responsavel = null;
            await db.save(i); app.auditSession.pending.splice(idx, 1); app.auditSession.returned.push({ ...info, returnedAt: d });
            if (navigator.vibrate) navigator.vibrate(200);
            alert(`✅ Devolvido!\n${info.codigo}\n${info.descricao}`); app.renderAudit(); app.updateDashboard();
            if (!app.auditSession.pending.length) setTimeout(() => alert('🎉 Todos devolvidos!'), 500);
        } catch (e) { alert('Erro scan: ' + e.message); }
    },

    generateAuditReport: async () => {
        try {
            if (!app.auditSession.returned.length && !app.auditSession.pending.length) { alert('Nenhuma conferência.'); return; }
            const f = prompt('Formato:\n1-PDF\n2-XLSX\n3-CSV', '1'); if (!['1','2','3'].includes(f)) { alert('Inválido.'); return; }
            const d = [];
            app.auditSession.returned.forEach(i => d.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Categoria': i.categoria, 'Responsável': i.responsavel || '-', 'Status': 'Devolvido', 'Data/Hora': i.returnedAt, 'Conferido por': app.currentUser.nome || app.currentUser.name }));
            app.auditSession.pending.forEach(i => d.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Categoria': i.categoria, 'Responsável': i.responsavel || '-', 'Status': 'PENDENTE', 'Data/Hora': '-', 'Conferido por': app.currentUser.nome || app.currentUser.name }));
            if (!d.length) { alert('Sem dados.'); return; }
            const n = `Conferencia_${new Date().toISOString().split('T')[0]}`;
            if (f === '3') utils.exportCSVReport(d, n);
            else if (f === '2') utils.exportXLSX(d, n, 'Conferência', app.currentInstituicao?.nome || '', new Date().toLocaleString('pt-BR'), app.currentUser.nome || app.currentUser.name, app.currentInstituicao?.logo);
            else utils.exportPDFReport(d, n, 'Conferência', app.currentInstituicao?.nome || '', new Date().toLocaleString('pt-BR'), app.currentUser.nome || app.currentUser.name, app.currentInstituicao?.logo);
            alert(`✅ Gerado!\nDevolvidos: ${app.auditSession.returned.length}\nPendentes: ${app.auditSession.pending.length}`);
        } catch (e) { alert('Erro relatório: ' + e.message); }
    },
    resetAudit: () => { if (confirm('Nova conferência?')) app.startAudit(); },
    stopAudit: () => { app.stopAuditScanner(); },

    renderReports: () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); app.navigate('dashboard'); return; }
        const r = [ { id: 'completo', icon: '📋', title: 'Completo', desc: 'Todos os itens', color: 'blue' }, { id: 'emprestados', icon: '📤', title: 'Emprestados', desc: 'Itens emprestados', color: 'yellow' }, { id: 'manutencao', icon: '🔧', title: 'Manutenção', desc: 'Status manutenção', color: 'orange' }, { id: 'baixados', icon: '🗑️', title: 'Baixados', desc: 'Itens retirados', color: 'red' }, { id: 'observacoes', icon: '📝', title: 'Observações', desc: 'Pendências', color: 'amber' }, { id: 'categorias', icon: '📊', title: 'Por Categoria', desc: 'Quantitativo', color: 'purple' }, { id: 'historico', icon: '', title: 'Histórico', desc: 'Log alterações', color: 'indigo' } ];
        const c = document.getElementById('reports-list'); if (!c) return; c.innerHTML = '';
        r.forEach(x => { const d = document.createElement('div'); d.className = 'bg-white p-4 rounded-lg shadow border-l-4 border-' + x.color + '-500'; d.innerHTML = `<div class="flex items-start gap-3 mb-3"><div class="text-3xl">${x.icon}</div><div class="flex-1"><h3 class="font-bold text-gray-800">${x.title}</h3><p class="text-xs text-gray-600 mt-1">${x.desc}</p></div></div><div class="flex gap-2"><button onclick="app.generateReport('${x.id}','pdf')" class="flex-1 bg-red-600 text-white text-xs py-2 rounded font-bold"> PDF</button><button onclick="app.generateReport('${x.id}','xlsx')" class="flex-1 bg-green-600 text-white text-xs py-2 rounded font-bold">📊 XLSX</button><button onclick="app.generateReport('${x.id}','csv')" class="flex-1 bg-blue-600 text-white text-xs py-2 rounded font-bold"> CSV</button></div>`; c.appendChild(d); });
    },

    generateReport: async (rid, fmt) => {
        const items = await db.getAll(app.currentInstituicao?.id); const inst = app.currentInstituicao?.nome || 'Inventário'; const dg = new Date().toLocaleString('pt-BR'); const usr = app.currentUser?.nome || app.currentUser?.name || 'Sistema'; const logo = app.currentInstituicao?.logo || null;
        let d = [], t = '';
        switch(rid) {
            case 'completo': t = 'Completo'; d = items.map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Status': i.status, 'Responsável': i.responsavel || '-', 'Entrada': i.dataEntrada || '-', 'Observações': i.observacao || '-' })); break;
            case 'emprestados': t = 'Emprestados'; d = items.filter(i => i.status === 'Emprestado').map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-', 'Entrada': i.dataEntrada || '-' })); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'manutencao': t = 'Manutenção'; d = items.filter(i => i.status === 'Manutenção').map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-' })); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'baixados': t = 'Baixados'; d = items.filter(i => i.status === 'Baixado').map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao })); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'observacoes': t = 'Observações'; d = items.filter(i => i.observacao?.trim()).map(i => ({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Observação': i.observacao })); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'categorias': t = 'Por Categoria'; const c = {}; items.forEach(i => { const x = i.categoria || 'Outro'; if (!c[x]) c[x] = { total: 0, a: 0, e: 0, m: 0, b: 0 }; c[x].total++; if (i.status === 'Ativo') c[x].a++; else if (i.status === 'Emprestado') c[x].e++; else if (i.status === 'Manutenção') c[x].m++; else if (i.status === 'Baixado') c[x].b++; }); d = Object.keys(c).map(x => ({ 'Categoria': x, 'Total': c[x].total, 'Ativos': c[x].a, 'Emprestados': c[x].e, 'Manutenção': c[x].m, 'Baixados': c[x].b })); break;
            case 'historico': t = 'Histórico'; items.forEach(i => { if (i.historico?.length) i.historico.forEach(h => d.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Evento': h })); }); if (!d.length) { alert('Nenhum.'); return; } break;
        }
        if (!d.length) { alert('Sem dados.'); return; }
        const n = `${t.replace(/\s+/g,'_')}_${inst}_${new Date().toISOString().split('T')[0]}`;
        if (fmt === 'csv') utils.exportCSVReport(d, n);
        else if (fmt === 'xlsx') utils.exportXLSX(d, n, t, inst, dg, usr, logo);
        else utils.exportPDFReport(d, n, t, inst, dg, usr, logo);
        alert(`✅ "${t}" gerado!\n${d.length} registros em ${fmt.toUpperCase()}`);
    },

    // ===== FUNÇÕES DE USUÁRIOS (SIMPLIFICADAS) =====
    
        openUserManagementDirect: () => {
        alert('🔍 Botão clicado!\n\nisLoggedIn: ' + app.isLoggedIn + '\nUser: ' + JSON.stringify(app.currentUser));
        
        if (!app.isLoggedIn) { alert('❌ Faça login primeiro'); return; }
        
        const userLevel = app.currentUser?.nivel || app.currentUser?.level;
        alert('🔍 Nível: ' + userLevel);
        
        if (userLevel !== 'admin') { 
            alert('❌ Apenas administradores.\n\nSeu nível: ' + (userLevel || 'não definido')); 
            return; 
        }
        
        const c = document.getElementById('users-list');
        if (!c) { alert('❌ Container não encontrado'); return; }
        
        c.innerHTML = '';
        
        const usersToShow = (app.localUsers || []).filter(u => !(u.username === 'admin' && u.master));
        alert('🔍 Usuários: ' + usersToShow.length);
        
        if (usersToShow.length === 0) {
            c.innerHTML = '<p class="text-center text-gray-500 py-4">Nenhum usuário cadastrado ainda.<br>Crie o primeiro abaixo.</p>';
        } else {
            usersToShow.forEach(u => {
                const d = document.createElement('div');
                d.className = 'flex justify-between items-center p-2 bg-gray-100 rounded mb-2';
                d.innerHTML = `<div class="flex-1"><p class="font-bold">${u.nome || u.name || u.username}</p><p class="text-xs text-gray-600">@${u.username} - ${app.accessLevels[u.nivel || u.level]?.name || u.nivel || u.level}</p></div><div class="flex gap-2"><button onclick="app.editUserDirect('${u.username}')" class="text-blue-600 text-xs">Editar</button><button onclick="app.deleteUserDirect('${u.username}')" class="text-red-600 text-xs">Excluir</button></div>`;
                c.appendChild(d);
            });
        }
        
        const modal = document.getElementById('user-management-modal');
        if (modal) {
            modal.classList.remove('hidden');
            alert('✅ Modal aberto!');
        } else {
            alert('❌ Modal não encontrado');
        }
    },

    createUserDirect: async () => {
        if (!app.isLoggedIn) { alert('❌ Faça login primeiro'); return; }
        
        const name = document.getElementById('new-user-name').value.trim();
        const username = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value;
        const level = document.getElementById('new-user-level').value;
        
        if (!name || !username || !password) { alert('❌ Preencha todos os campos'); return; }
        if (username.includes(' ')) { alert('❌ Usuário não pode ter espaços'); return; }
        if (app.localUsers.find(x => x.username === username)) { alert('❌ Usuário já existe'); return; }
        
        try {
            const hash = await utils.hashPassword(password);
            const newUser = { username, nome: name, senhaHash: hash, nivel: level, ativo: true, master: false };
            
            app.localUsers.push(newUser);
            localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
            
            try { await sync.syncUsers([newUser]); } catch(e) { console.log('Sync falhou, mas usuário criado localmente'); }
            
            alert(`✅ Usuário criado com sucesso!\n\nNome: ${name}\nUsuário: ${username}\nNível: ${app.accessLevels[level]?.name || level}`);
            
            document.getElementById('new-user-name').value = '';
            document.getElementById('new-user-username').value = '';
            document.getElementById('new-user-password').value = '';
            
            app.openUserManagementDirect();
        } catch (error) {
            alert('❌ Erro ao criar usuário: ' + error.message);
        }
    },

    editUserDirect: async (username) => {
        const user = app.localUsers.find(x => x.username === username);
        if (!user) { alert('❌ Usuário não encontrado'); return; }
        
        const newLevel = prompt(`Alterar nível de ${user.nome || user.username}?\n\nAtual: ${app.accessLevels[user.nivel || user.level]?.name || user.nivel || user.level}\n\nDigite: admin, editor ou viewer`, user.nivel || user.level);
        if (newLevel && ['admin', 'editor', 'viewer'].includes(newLevel)) {
            user.nivel = newLevel;
            localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
            try { await sync.syncUsers([user]); } catch(e) {}
            alert(`✅ Nível alterado para: ${app.accessLevels[newLevel]?.name || newLevel}`);
        } else if (newLevel) alert('❌ Nível inválido');
        
        if (confirm('Deseja alterar a senha?')) {
            const newPass = prompt('Nova senha:');
            if (newPass && newPass.trim()) {
                user.senhaHash = await utils.hashPassword(newPass.trim());
                localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                try { await sync.syncUsers([user]); } catch(e) {}
                alert('✅ Senha alterada!');
            }
        }
        app.openUserManagementDirect();
    },

    deleteUserDirect: async (username) => {
        if (confirm(`Excluir usuário ${username}?\n\nEsta ação revoga o acesso permanentemente.`)) {
            const idx = app.localUsers.findIndex(x => x.username === username);
            if (idx > -1) {
                app.localUsers.splice(idx, 1);
                localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                try { await sync.syncUsers([{ username, ativo: false }]); } catch(e) {}
                alert('✅ Usuário excluído e acesso revogado.');
            }
            app.openUserManagementDirect();
        }
    },

    closeUserManagement: () => { document.getElementById('user-management-modal').classList.add('hidden'); },

    openInstituicaoManagement: () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        app.instituicoes.init(); const is = app.instituicoes.getAll(); const c = document.getElementById('instituicoes-list'); if (!c) return; c.innerHTML = '';
        is.forEach(i => { const lp = i.logo ? `<img src="${i.logo}" class="w-8 h-8 rounded mr-2">` : ''; const d = document.createElement('div'); d.className = 'flex justify-between items-center p-2 bg-gray-100 rounded mb-2'; d.innerHTML = `<div class="flex items-center">${lp}<div><p class="font-bold">${i.nome}</p><p class="text-xs text-gray-600">${i.cidade || ''}</p></div></div>${i.id !== 'default' ? `<button onclick="app.deleteInstituicao('${i.id}')" class="text-red-600 text-sm">Excluir</button>` : ''}`; c.appendChild(d); });
        document.getElementById('instituicao-management-modal').classList.remove('hidden');
    },
    closeInstituicaoManagement: () => { document.getElementById('instituicao-management-modal').classList.add('hidden'); },

    createInstituicao: async () => {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return;
        const n = document.getElementById('new-inst-nome').value.trim(); const ci = document.getElementById('new-inst-cidade').value.trim(); const li = document.getElementById('new-inst-logo');
        if (!n) { alert('Informe o nome'); return; }
        let lb = null; if (li.files[0]) { try { lb = await utils.compressImage(li.files[0], 200, 200, 0.7); } catch(e) { alert('Erro logo: ' + e.message); return; } }
        app.instituicoes.create({ nome: n, cidade: ci, logo: lb });
        alert(`Unidade criada!\n${n}${ci ? ' - ' + ci : ''}${lb ? '\n✅ Logo ok' : '\n⚠️ Sem logo'}`);
        document.getElementById('new-inst-nome').value = ''; document.getElementById('new-inst-cidade').value = ''; li.value = '';
        app.openInstituicaoManagement();
    },
    deleteInstituicao: (id) => { if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return; if (confirm('Excluir unidade?')) { app.instituicoes.delete(id); app.openInstituicaoManagement(); } },

    users: {
        init: async () => {
            if (!localStorage.getItem('user_admin')) localStorage.setItem('user_admin', JSON.stringify({ username: 'admin', password: 'musica2026', level: 'admin', name: 'Administrador', master: true }));
            if (!localStorage.getItem('usersMigrated')) {
                const ok = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('user_') && k !== 'user_admin') ok.push(k); }
                if (ok.length > 0) {
                    const mig = []; for (const k of ok) { try { const u = JSON.parse(localStorage.getItem(k)); if (u.username && u.password) { const h = await utils.hashPassword(u.password); mig.push({ username: u.username, nome: u.name || u.username, senhaHash: h, nivel: u.level || 'viewer', ativo: true, master: false }); } } catch(e) {} }
                    if (mig.length > 0) {
                        for (const u of mig) { if (!app.localUsers.find(x => x.username === u.username)) app.localUsers.push(u); }
                        localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                        await sync.syncUsers(mig);
                        ok.forEach(k => localStorage.removeItem(k)); localStorage.setItem('usersMigrated', 'true');
                    } else localStorage.setItem('usersMigrated', 'true');
                } else localStorage.setItem('usersMigrated', 'true');
            }
        },
        getLocal: (u) => { const d = localStorage.getItem(`user_${u}`); return d ? JSON.parse(d) : null; }
    },

    instituicoes: {
        init: () => { if (!localStorage.getItem('inst_default')) localStorage.setItem('inst_default', JSON.stringify({ id: 'default', nome: 'Escola de Música', cidade: 'Sede' })); },
        create: (d) => { const id = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); localStorage.setItem(`inst_${id}`, JSON.stringify({ id, ...d })); },
        getAll: () => { const a = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('inst_')) try { a.push(JSON.parse(localStorage.getItem(k))); } catch(e) {} } return a; },
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
