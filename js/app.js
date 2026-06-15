const app = {
    isLoggedIn: false,
    currentUser: null,
    currentInstituicao: null,
    scanner: null,
    auditScanner: null,
    currentItem: null,
    auditSession: { pending: [], returned: [], startTime: null },
    localUsers: [],

    init: async function() {
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
                    app.isLoggedIn = true;
                    app.currentUser = user;
                    app.currentInstituicao = session.instituicao;
                    document.getElementById('btn-login-toggle').textContent = '🔓 ' + (user.nome || user.name);
                }
            } catch (e) {
                localStorage.removeItem('sessionData');
            }
        }

        if (!app.isLoggedIn) {
            app.showLoginScreen();
        } else {
            app.navigate('dashboard');
            app.updateDashboard();
            app.updateInstituicaoDisplay();
            app.updateLogoDisplay();
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    },

    showLoginScreen: function() {
        document.querySelectorAll('.view').forEach(function(el) { el.classList.add('hidden'); });
        var loginView = document.getElementById('view-login-required');
        if (loginView) loginView.classList.remove('hidden');
        app.updateLogoDisplay();
    },

    updateLogoDisplay: function() {
        var hLogo = document.getElementById('header-logo');
        var lLogo = document.getElementById('login-logo');
        if (app.currentInstituicao && app.currentInstituicao.logo) {
            if (hLogo) { hLogo.src = app.currentInstituicao.logo; hLogo.style.display = 'block'; }
            if (lLogo) { lLogo.src = app.currentInstituicao.logo; lLogo.style.display = 'block'; }
        } else {
            if (hLogo) hLogo.style.display = 'none';
            if (lLogo) lLogo.style.display = 'none';
        }
    },

    forceUpdate: function() {
        if (confirm('Isso vai limpar o cache e recarregar.\n\nUSUÁRIOS e UNIDADES serão PRESERVADOS.\n\nOK?')) {
            var protect = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && (k.startsWith('user_') || k.startsWith('inst_') || k === 'cloudUsersCache' || k === 'cloudUsersLastSync' || k === 'usersMigrated')) {
                    protect.push({ k: k, v: localStorage.getItem(k) });
                }
            }
            localStorage.clear();
            protect.forEach(function(item) { localStorage.setItem(item.k, item.v); });
            if ('caches' in window) {
                caches.keys().then(function(names) { names.forEach(function(c) { caches.delete(c); }); });
            }
            window.location.reload(true);
        }
    },

    navigate: function(viewId) {
        if (!app.isLoggedIn && viewId !== 'login-required') { app.showLoginScreen(); return; }
        document.querySelectorAll('.view').forEach(function(el) { el.classList.add('hidden'); });
        var t = document.getElementById('view-' + viewId);
        if (t) t.classList.remove('hidden');
        if (viewId === 'dashboard') { app.renderList(); app.updateInstituicaoDisplay(); app.showAdminButtons(); }
        if (viewId === 'add') document.getElementById('item-codigo').value = app.generateCode();
        if (viewId === 'scanner') app.startScanner();
        if (viewId === 'audit') app.renderAudit();
        if (viewId === 'reports') app.renderReports();
    },

    showAdminButtons: function() {
        var userLevel = (app.currentUser && (app.currentUser.nivel || app.currentUser.level)) || '';
        var isAdmin = userLevel === 'admin';
        
        var btnUsers = document.getElementById('btn-users-dashboard');
        if (btnUsers) {
            if (isAdmin) { btnUsers.style.display = 'block'; }
            else { btnUsers.style.display = 'none'; }
        }
        
        var btnReports = document.getElementById('btn-reports');
        if (btnReports) {
            if (isAdmin) { btnReports.style.display = 'block'; }
            else { btnReports.style.display = 'none'; }
        }
        
        var btnAudit = document.getElementById('btn-audit');
        if (btnAudit) {
            if (app.currentUser) { btnAudit.style.display = 'block'; }
            else { btnAudit.style.display = 'none'; }
        }
    },

    generateCode: function() {
        return 'FDSF-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
    },

    updateInstituicaoDisplay: function() {
        var d = document.getElementById('current-instituicao-display');
        if (!d) return;
        if (app.currentInstituicao) {
            d.textContent = '📍 ' + app.currentInstituicao.nome + ' - ' + (app.currentInstituicao.cidade || '');
            d.classList.remove('hidden');
        } else {
            d.classList.add('hidden');
        }
    },

    toggleLogin: function() {
        if (app.isLoggedIn) {
            if (confirm('Deseja sair?')) {
                app.isLoggedIn = false;
                app.currentUser = null;
                app.currentInstituicao = null;
                localStorage.removeItem('sessionData');
                var b = document.getElementById('btn-login-toggle');
                if (b) b.textContent = '';
                app.showLoginScreen();
            }
        } else {
            app.openLoginModal();
        }
    },

    openLoginModal: function() {
        try {
            app.instituicoes.init();
            var insts = app.instituicoes.getAll();
            var sInst = document.getElementById('login-instituicao');
            if (sInst) {
                sInst.innerHTML = '<option value="">-- Selecione sua unidade --</option>';
                insts.forEach(function(i) {
                    var o = document.createElement('option');
                    o.value = i.id;
                    o.textContent = i.nome + ' - ' + (i.cidade || '');
                    sInst.appendChild(o);
                });
            }
            var sUser = document.getElementById('login-user-select');
            if (sUser) {
                sUser.innerHTML = '<option value="">-- Selecione ou digite abaixo --</option>';
                var adm = app.users.getLocal('admin');
                if (adm) {
                    var o = document.createElement('option');
                    o.value = 'admin';
                    o.textContent = '🔑 admin (Master)';
                    sUser.appendChild(o);
                }
                if (app.localUsers) {
                    app.localUsers.forEach(function(u) {
                        if (u.username !== 'admin') {
                            var o = document.createElement('option');
                            o.value = u.username;
                            o.textContent = (u.nome || u.username) + ' (' + (app.accessLevels[u.nivel || u.level] ? app.accessLevels[u.nivel || u.level].name : u.nivel) + ')';
                            sUser.appendChild(o);
                        }
                    });
                }
            }
            var p = document.getElementById('login-pass');
            if (p) p.value = '';
            var t = document.getElementById('login-user-text');
            if (t) t.value = '';
            var m = document.getElementById('login-modal');
            if (m) m.classList.remove('hidden');
        } catch (e) {
            alert('Erro login: ' + e.message);
        }
    },

    doLogin: async function() {
        var u = document.getElementById('login-user-select').value.trim();
        var t = document.getElementById('login-user-text').value.trim();
        if (t) u = t;
        var p = document.getElementById('login-pass').value;
        var iId = document.getElementById('login-instituicao').value;
        
        if (!iId) { alert('Selecione a unidade'); return; }
        if (!u) { alert('Selecione ou digite o usuário'); return; }
        
        if (u === 'admin') {
            var la = app.users.getLocal('admin');
            if (!la || la.password !== p) { alert('Senha incorreta!'); return; }
            var inst = app.instituicoes.get(iId);
            if (!inst) { alert('Unidade não encontrada'); return; }
            app.completeLogin(la, inst);
            return;
        }
        
        var cu = app.localUsers.find(function(x) { return x.username === u; });
        if (!cu) { alert('Usuário não encontrado.'); return; }
        var hash = await utils.hashPassword(p);
        if (cu.senhaHash !== hash) { alert('Senha incorreta!'); return; }
        var inst = app.instituicoes.get(iId);
        if (!inst) { alert('Unidade não encontrada'); return; }
        app.completeLogin(cu, inst);
    },

    completeLogin: function(user, inst) {
        app.isLoggedIn = true;
        app.currentUser = user;
        app.currentInstituicao = inst;
        localStorage.setItem('sessionData', JSON.stringify({ username: user.username, instituicao: inst }));
        var b = document.getElementById('btn-login-toggle');
        if (b) b.textContent = '🔓 ' + (user.nome || user.name);
        document.getElementById('login-modal').classList.add('hidden');
        app.navigate('dashboard');
        app.updateDashboard();
        app.updateInstituicaoDisplay();
        app.updateLogoDisplay();
        var h = new Date().getHours();
        var s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
        setTimeout(function() {
            alert(s + ', ' + (user.nome || user.name) + '!\n\nBem-vindo(a).\nUnidade: ' + inst.nome);
        }, 300);
    },

    closeLogin: function() {
        document.getElementById('login-modal').classList.add('hidden');
    },

    saveItem: async function(e) {
        e.preventDefault();
        if (!app.isLoggedIn || !app.currentInstituicao) { alert('Faça login'); return; }
        var f = document.getElementById('item-foto');
        var foto = '';
        if (f.files[0]) {
            foto = await utils.compressImage(f.files[0]);
        } else if (!confirm('Continuar sem foto?')) {
            return;
        }
        var item = {
            codigo: document.getElementById('item-codigo').value,
            patrimonio: document.getElementById('item-patrimonio').value.trim(),
            categoria: document.getElementById('item-categoria').value,
            descricao: document.getElementById('item-descricao').value,
            foto: foto,
            observacao: document.getElementById('item-obs').value.trim(),
            status: 'Ativo',
            dataEntrada: new Date().toISOString().split('T')[0],
            historico: ['Criado em ' + new Date().toLocaleString() + ' por ' + (app.currentUser.nome || app.currentUser.name)],
            instituicao: app.currentInstituicao.id,
            instituicaoNome: app.currentInstituicao.nome,
            instituicaoCidade: app.currentInstituicao.cidade
        };
        await db.save(item);
        alert('Salvo!');
        document.getElementById('form-add').reset();
        app.navigate('dashboard');
        app.updateDashboard();
    },

    renderList: async function() {
        var items = await db.getAll(app.currentInstituicao ? app.currentInstituicao.id : null);
        var c = document.getElementById('items-list');
        if (!c) return;
        c.innerHTML = '';
        var f = document.getElementById('search-input').value.toLowerCase();
        var filt = items.filter(function(i) {
            return i.codigo.toLowerCase().includes(f) || i.descricao.toLowerCase().includes(f) || (i.patrimonio && i.patrimonio.toLowerCase().includes(f));
        });
        if (!filt.length) {
            c.innerHTML = '<p class="text-center text-gray-500 py-8">Nenhum item</p>';
            return;
        }
        filt.forEach(function(i) {
            var pb = i.patrimonio ? '<p class="text-xs text-blue-600 font-mono">Pat: ' + i.patrimonio + '</p>' : '';
            var d = document.createElement('div');
            d.className = 'bg-white p-3 rounded shadow border-l-4 ' + (i.status === 'Ativo' ? 'border-green-500' : 'border-red-500');
            d.innerHTML = '<div class="flex justify-between items-center cursor-pointer" onclick="app.renderDetail(\'' + i.codigo + '\')"><div><p class="font-bold text-sm">' + i.codigo + ' ' + (i.observacao && i.observacao.trim() ? '📝' : '') + '</p><p class="text-xs text-gray-600">' + i.descricao + '</p>' + pb + '</div><span class="text-xs px-2 py-1 rounded bg-gray-200">' + i.status + '</span></div>';
            c.appendChild(d);
        });
    },

    filterItems: function() { app.renderList(); },

    renderDetail: async function(cod) {
        var i = await db.get(cod);
        if (!i) { alert('Não encontrado'); app.navigate('dashboard'); return; }
        app.currentItem = i;
        var c = document.getElementById('detail-content');
        if (!c) return;
        var h = i.historico.map(function(x) { return '<li class="text-xs text-gray-600">• ' + x + '</li>'; }).join('');
        var pd = i.patrimonio ? '<p class="text-sm font-mono bg-blue-50 px-2 py-1 rounded inline-block mt-1">️ Pat: <strong>' + i.patrimonio + '</strong></p>' : '';
        var fu = i.foto || '';
        if (fu.includes('lh3.googleusercontent.com/d/')) {
            var fid = fu.match(/\/d\/([^\/\?]+)/);
            if (fid && fid[1]) fu = 'https://drive.google.com/thumbnail?id=' + fid[1] + '&sz=w1000';
        }
        var fh = fu ? '<img src="' + fu + '" class="w-full h-48 object-cover rounded-lg mb-4" onerror="this.style.display=\'none\'">' : '';
        c.innerHTML = fh + '<h2 class="text-2xl font-bold">' + i.codigo + '</h2>' + pd + '<p class="text-gray-600">' + i.categoria + ' | ' + i.descricao + '</p><p class="text-xs text-blue-600 font-bold">📍 ' + (i.instituicaoNome || '') + ' ' + (i.instituicaoCidade ? '- ' + i.instituicaoCidade : '') + '</p><div class="bg-gray-100 p-3 rounded mt-2"><p><strong>Status:</strong> ' + i.status + '</p><p><strong>Responsável:</strong> ' + (i.responsavel || 'N/A') + '</p></div><div class="bg-yellow-50 p-3 rounded mt-2 border border-yellow-200"><div class="flex justify-between items-center mb-1"><p class="font-bold text-sm text-yellow-800">Observações:</p><button id="btn-edit-obs" onclick="app.editObservation()" class="hidden text-xs bg-yellow-600 text-white px-3 py-1 rounded shadow">Editar</button></div><p id="detail-obs-text" class="text-sm text-gray-700 whitespace-pre-wrap">' + (i.observacao && i.observacao.trim() ? i.observacao : 'Nenhuma.') + '</p></div><div class="mt-4 bg-white p-4 rounded-lg shadow text-center border"><p class="text-sm font-bold mb-2">QR Code</p><div id="detail-qrcode" class="flex justify-center mb-2"></div><p class="text-xs font-mono text-gray-600 break-all">' + i.codigo + '</p></div><div class="mt-4"><h4 class="font-bold text-sm mb-2">Histórico</h4><ul class="space-y-1">' + h + '</ul></div>';
        setTimeout(function() {
            var q = document.getElementById('detail-qrcode');
            if (q) { q.innerHTML = ''; new QRCode(q, { text: i.codigo, width: 150, height: 150 }); }
        }, 100);
        var be = document.getElementById('btn-edit-obs');
        if (app.isLoggedIn && app.currentUser && (app.currentUser.nivel || app.currentUser.level) === 'admin') {
            be.classList.remove('hidden');
        } else {
            be.classList.add('hidden');
        }
        var aa = document.getElementById('admin-actions');
        if (aa) {
            if (app.isLoggedIn) aa.classList.remove('hidden');
            else aa.classList.add('hidden');
        }
        app.navigate('detail');
    },

    editObservation: async function() {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        var n = prompt('Editar (vazio para limpar):', app.currentItem.observacao || '');
        if (n !== null) {
            app.currentItem.observacao = n.trim();
            app.currentItem.historico.push((n.trim() ? 'Atualizada' : 'Limpa') + ' em ' + new Date().toLocaleString() + ' por ' + (app.currentUser.nome || app.currentUser.name));
            await db.save(app.currentItem);
            app.renderDetail(app.currentItem.codigo);
            app.renderList();
        }
    },

    updateStatus: async function(s) {
        if (!app.isLoggedIn) return;
        var r = app.currentUser.nome || app.currentUser.username;
        var o = '';
        if (s === 'Emprestado') { r = prompt('Responsável:') || r; o = prompt('Previsão:') || '-'; }
        else if (s === 'Manutenção') o = prompt('Motivo/OS:') || '-';
        app.currentItem.status = s;
        app.currentItem.responsavel = r;
        app.currentItem.historico.push(s + ' em ' + new Date().toLocaleString() + ' por ' + r + '. Obs: ' + o);
        await db.save(app.currentItem);
        alert('Status: ' + s);
        app.renderDetail(app.currentItem.codigo);
        app.updateDashboard();
    },

    baixarItem: async function() {
        if (!app.isLoggedIn) return;
        var m = prompt('Motivo:');
        if (!m) return;
        app.currentItem.status = 'Baixado';
        app.currentItem.historico.push('BAIXA em ' + new Date().toLocaleString() + ' por ' + (app.currentUser.nome || app.currentUser.name) + '. Motivo: ' + m);
        await db.save(app.currentItem);
        alert('Baixado.');
        app.navigate('dashboard');
        app.updateDashboard();
    },

    editItem: async function() {
        if (!app.isLoggedIn) { alert('Faça login'); return; }
        var i = app.currentItem;
        document.getElementById('edit-codigo').value = i.codigo;
        document.getElementById('edit-patrimonio').value = i.patrimonio || '';
        document.getElementById('edit-categoria').value = i.categoria;
        document.getElementById('edit-descricao').value = i.descricao;
        document.getElementById('edit-obs').value = i.observacao || '';
        var p = document.getElementById('edit-foto-preview');
        if (i.foto) { p.src = i.foto; p.style.display = 'block'; }
        else p.style.display = 'none';
        document.getElementById('edit-item-modal').classList.remove('hidden');
    },

    saveEditItem: async function() {
        if (!app.isLoggedIn) return;
        var f = document.getElementById('edit-foto');
        var foto = app.currentItem.foto;
        if (f.files[0]) {
            foto = await utils.compressImage(f.files[0]);
            app.currentItem.historico.push('Foto atualizada em ' + new Date().toLocaleString() + ' por ' + (app.currentUser.nome || app.currentUser.name));
        }
        var np = document.getElementById('edit-patrimonio').value.trim();
        if (np !== (app.currentItem.patrimonio || '')) {
            app.currentItem.historico.push('Patrimônio alterado para "' + (np || 'vazio') + '"');
        }
        app.currentItem.patrimonio = np;
        app.currentItem.categoria = document.getElementById('edit-categoria').value;
        app.currentItem.descricao = document.getElementById('edit-descricao').value;
        app.currentItem.observacao = document.getElementById('edit-obs').value.trim();
        app.currentItem.foto = foto;
        app.currentItem.historico.push('Editado em ' + new Date().toLocaleString() + ' por ' + (app.currentUser.nome || app.currentUser.name));
        await db.save(app.currentItem);
        alert('Atualizado!');
        document.getElementById('edit-item-modal').classList.add('hidden');
        app.renderDetail(app.currentItem.codigo);
        app.renderList();
    },

    cancelEditItem: function() {
        document.getElementById('edit-item-modal').classList.add('hidden');
    },

    deleteItem: async function() {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        if (!confirm('Excluir ' + app.currentItem.codigo + '?\nIRREVERSÍVEL!')) return;
        if (!confirm('TEM CERTEZA?')) return;
        await localforage.removeItem(app.currentItem.codigo);
        alert('Excluído.');
        app.navigate('dashboard');
        app.updateDashboard();
    },

    updateDashboard: async function() {
        var i = await db.getAll(app.currentInstituicao ? app.currentInstituicao.id : null);
        var s = function(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
        s('dash-total', i.length);
        s('dash-emprestados', i.filter(function(x) { return x.status === 'Emprestado'; }).length);
        s('dash-manutencao', i.filter(function(x) { return x.status === 'Manutenção'; }).length);
        s('dash-ativos', i.filter(function(x) { return x.status === 'Ativo'; }).length);
    },

    printLabels: async function() {
        var i = await db.getAll(app.currentInstituicao ? app.currentInstituicao.id : null);
        if (!i.length) { alert('Nenhum item'); return; }
        var w = window.open('', '_blank');
        var h = i.map(function(x) {
            var q = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(x.codigo);
            var p = x.patrimonio ? '<div class="label-pat">Pat: ' + x.patrimonio + '</div>' : '';
            return '<div class="label"><img src="' + q + '" class="qr-img"><div class="label-text"><div class="label-code">' + x.codigo + '</div><div class="label-desc">' + x.descricao + '</div>' + p + '<div class="label-inst">' + (x.instituicaoNome || '') + '</div></div></div>';
        }).join('');
        w.document.write('<html><head><title>Etiquetas</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px}.container{display:flex;flex-wrap:wrap;gap:15px}.label{border:1px dashed #ccc;padding:10px;width:180px;text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center}.qr-img{width:120px;height:120px;margin-bottom:8px}.label-code{font-weight:bold;font-size:12px;margin-bottom:4px}.label-desc{font-size:10px;color:#555;word-wrap:break-word}.label-pat{font-size:9px;color:#1e40af;font-weight:bold;margin-top:2px}.label-inst{font-size:9px;color:#888;margin-top:4px;font-style:italic}@media print{body{padding:0}.label{border:1px solid #000}.no-print{display:none}}</style></head><body><div class="no-print" style="text-align:center;margin-bottom:20px"><h2>Etiquetas (' + i.length + ' itens)</h2><button onclick="window.print()" style="padding:10px 20px;font-size:16px;cursor:pointer">🖨️ Imprimir</button></div><div class="container">' + h + '</div></body></html>');
        w.document.close();
    },

    startScanner: function() {
        app.scanner = new Html5Qrcode('reader');
        app.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, async function(c) {
            app.stopScanner();
            if (!app.isLoggedIn) { alert('Código: ' + c + '\nFaça login'); app.navigate('dashboard'); }
            else {
                var i = await db.get(c);
                if (i) app.renderDetail(c);
                else { alert('Não encontrado.'); app.navigate('dashboard'); }
            }
        }, function() {}, function(e) { alert('Erro câmera.'); app.navigate('dashboard'); });
    },

    stopScanner: function() {
        if (app.scanner) { app.scanner.stop().catch(function() {}); app.scanner = null; }
    },

    exportCSV: async function() { utils.exportCSV(await db.getAll(app.currentInstituicao ? app.currentInstituicao.id : null)); },
    exportPDF: async function() { utils.exportPDF(await db.getAll(app.currentInstituicao ? app.currentInstituicao.id : null)); },

    clearData: async function() {
        var i = await db.getAll();
        if (i.length > 0) {
            if (confirm('Backup ' + i.length + ' itens?\nOK = Sim\nCancelar = Não')) {
                try { await sync.runSync(); alert('Backup ok.'); }
                catch(e) { if (!confirm('Erro backup. Limpar mesmo assim?')) return; }
            } else return;
        }
        if (confirm('APAGAR TUDO? USUÁRIOS E UNIDADES PRESERVADOS.')) {
            await db.clear();
            var p = [];
            for (var x = 0; x < localStorage.length; x++) {
                var k = localStorage.key(x);
                if (k && (k.startsWith('user_') || k.startsWith('inst_') || k.includes('cloudUsers') || k === 'usersMigrated')) {
                    p.push({ k: k, v: localStorage.getItem(k) });
                }
            }
            localStorage.clear();
            p.forEach(function(item) { localStorage.setItem(item.k, item.v); });
            window.location.reload();
        }
    },

    startAudit: async function() {
        if (!app.isLoggedIn) { alert('Faça login'); app.navigate('dashboard'); return; }
        if (!app.currentInstituicao) { alert('Selecione instituição'); app.navigate('dashboard'); return; }
        try {
            var a = await db.getAll(app.currentInstituicao.id);
            var e = a.filter(function(x) { return x.status === 'Emprestado'; });
            if (!e.length && !confirm('Sem itens emprestados. Iniciar mesmo assim?')) { app.navigate('dashboard'); return; }
            app.auditSession = {
                pending: e.map(function(x) { return { codigo: x.codigo, patrimonio: x.patrimonio, descricao: x.descricao, responsavel: x.responsavel, categoria: x.categoria }; }),
                returned: [],
                startTime: new Date().toISOString()
            };
            app.navigate('audit');
        } catch (e) { alert('Erro: ' + e.message); }
    },

    renderAudit: function() {
        try {
            document.getElementById('audit-pendentes').textContent = app.auditSession.pending.length;
            document.getElementById('audit-devolvidos').textContent = app.auditSession.returned.length;
            document.getElementById('audit-total').textContent = app.auditSession.pending.length + app.auditSession.returned.length;
            var p = document.getElementById('audit-pending-list');
            if (p) {
                if (app.auditSession.pending.length) {
                    p.innerHTML = app.auditSession.pending.map(function(i) {
                        return '<div class="bg-yellow-50 p-2 rounded border-l-4 border-yellow-500"><p class="font-bold text-sm">' + i.codigo + ' ' + (i.patrimonio ? '<span class="text-xs text-blue-600">(Pat: ' + i.patrimonio + ')</span>' : '') + '</p><p class="text-xs text-gray-600">' + i.descricao + '</p><p class="text-xs text-gray-500">Resp: ' + (i.responsavel || 'N/A') + '</p></div>';
                    }).join('');
                } else {
                    p.innerHTML = '<p class="text-center text-green-600 py-4">✅ Todos devolvidos!</p>';
                }
            }
            var r = document.getElementById('audit-returned-list');
            if (r) {
                if (app.auditSession.returned.length) {
                    r.innerHTML = app.auditSession.returned.map(function(i) {
                        return '<div class="bg-green-50 p-2 rounded border-l-4 border-green-500"><p class="font-bold text-sm">' + i.codigo + ' ' + (i.patrimonio ? '<span class="text-xs text-blue-600">(Pat: ' + i.patrimonio + ')</span>' : '') + '</p><p class="text-xs text-gray-600">' + i.descricao + '</p><p class="text-xs text-green-600">Devolvido: ' + i.returnedAt + '</p></div>';
                    }).join('');
                } else {
                    r.innerHTML = '<p class="text-center text-gray-500 py-4">Nenhum devolvido ainda</p>';
                }
            }
        } catch (e) { alert('Erro render: ' + e.message); }
    },

    startAuditScanner: function() {
        try {
            document.getElementById('audit-reader-container').classList.remove('hidden');
            app.auditScanner = new Html5Qrcode('audit-reader');
            app.auditScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, async function(c) { await app.processAuditScan(c); }, function() {}, function(e) { alert('Erro câmera: ' + e); app.stopAuditScanner(); });
        } catch (e) { alert('Erro scanner: ' + e.message); }
    },

    stopAuditScanner: function() {
        if (app.auditScanner) { app.auditScanner.stop().catch(function() {}); app.auditScanner = null; }
        document.getElementById('audit-reader-container').classList.add('hidden');
    },

    processAuditScan: async function(c) {
        try {
            var i = await db.get(c);
            if (!i) { alert('❌ ' + c + ' não encontrado.'); return; }
            var idx = app.auditSession.pending.findIndex(function(p) { return p.codigo === c; });
            if (idx === -1) {
                if (app.auditSession.returned.find(function(r) { return r.codigo === c; })) alert('️ ' + c + ' já devolvido.');
                else alert('⚠️ ' + c + ' não está pendente.');
                return;
            }
            var info = app.auditSession.pending[idx];
            if (!confirm('✅ Confirmar?\n' + info.codigo + '\n' + info.descricao + (info.patrimonio ? '\nPat: ' + info.patrimonio : '') + '\nResp: ' + (info.responsavel || 'N/A'))) return;
            var d = new Date().toLocaleString('pt-BR');
            i.status = 'Ativo';
            i.historico.push('Devolvido em ' + d + ' por ' + (app.currentUser.nome || app.currentUser.name) + ' (Conferência)');
            i.responsavel = null;
            await db.save(i);
            app.auditSession.pending.splice(idx, 1);
            app.auditSession.returned.push(Object.assign({}, info, { returnedAt: d }));
            if (navigator.vibrate) navigator.vibrate(200);
            alert('✅ Devolvido!\n' + info.codigo + '\n' + info.descricao);
            app.renderAudit();
            app.updateDashboard();
            if (!app.auditSession.pending.length) setTimeout(function() { alert('🎉 Todos devolvidos!'); }, 500);
        } catch (e) { alert('Erro scan: ' + e.message); }
    },

    generateAuditReport: async function() {
        try {
            if (!app.auditSession.returned.length && !app.auditSession.pending.length) { alert('Nenhuma conferência.'); return; }
            var f = prompt('Formato:\n1-PDF\n2-XLSX\n3-CSV', '1');
            if (!['1','2','3'].includes(f)) { alert('Inválido.'); return; }
            var d = [];
            app.auditSession.returned.forEach(function(i) {
                d.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Categoria': i.categoria, 'Responsável': i.responsavel || '-', 'Status': 'Devolvido', 'Data/Hora': i.returnedAt, 'Conferido por': app.currentUser.nome || app.currentUser.name });
            });
            app.auditSession.pending.forEach(function(i) {
                d.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Categoria': i.categoria, 'Responsável': i.responsavel || '-', 'Status': 'PENDENTE', 'Data/Hora': '-', 'Conferido por': app.currentUser.nome || app.currentUser.name });
            });
            if (!d.length) { alert('Sem dados.'); return; }
            var n = 'Conferencia_' + new Date().toISOString().split('T')[0];
            if (f === '3') utils.exportCSVReport(d, n);
            else if (f === '2') utils.exportXLSX(d, n, 'Conferência', app.currentInstituicao ? app.currentInstituicao.nome : '', new Date().toLocaleString('pt-BR'), app.currentUser.nome || app.currentUser.name, app.currentInstituicao ? app.currentInstituicao.logo : null);
            else utils.exportPDFReport(d, n, 'Conferência', app.currentInstituicao ? app.currentInstituicao.nome : '', new Date().toLocaleString('pt-BR'), app.currentUser.nome || app.currentUser.name, app.currentInstituicao ? app.currentInstituicao.logo : null);
            alert('✅ Gerado!\nDevolvidos: ' + app.auditSession.returned.length + '\nPendentes: ' + app.auditSession.pending.length);
        } catch (e) { alert('Erro relatório: ' + e.message); }
    },

    resetAudit: function() { if (confirm('Nova conferência?')) app.startAudit(); },
    stopAudit: function() { app.stopAuditScanner(); },

    renderReports: function() {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); app.navigate('dashboard'); return; }
        var r = [
            { id: 'completo', icon: '📋', title: 'Completo', desc: 'Todos os itens', color: 'blue' },
            { id: 'emprestados', icon: '📤', title: 'Emprestados', desc: 'Itens emprestados', color: 'yellow' },
            { id: 'manutencao', icon: '🔧', title: 'Manutenção', desc: 'Status manutenção', color: 'orange' },
            { id: 'baixados', icon: '🗑️', title: 'Baixados', desc: 'Itens retirados', color: 'red' },
            { id: 'observacoes', icon: '', title: 'Observações', desc: 'Pendências', color: 'amber' },
            { id: 'categorias', icon: '📊', title: 'Por Categoria', desc: 'Quantitativo', color: 'purple' },
            { id: 'historico', icon: '📜', title: 'Histórico', desc: 'Log alterações', color: 'indigo' }
        ];
        var c = document.getElementById('reports-list');
        if (!c) return;
        c.innerHTML = '';
        r.forEach(function(x) {
            var d = document.createElement('div');
            d.className = 'bg-white p-4 rounded-lg shadow border-l-4 border-' + x.color + '-500';
            d.innerHTML = '<div class="flex items-start gap-3 mb-3"><div class="text-3xl">' + x.icon + '</div><div class="flex-1"><h3 class="font-bold text-gray-800">' + x.title + '</h3><p class="text-xs text-gray-600 mt-1">' + x.desc + '</p></div></div><div class="flex gap-2"><button onclick="app.generateReport(\'' + x.id + '\',\'pdf\')" class="flex-1 bg-red-600 text-white text-xs py-2 rounded font-bold">📄 PDF</button><button onclick="app.generateReport(\'' + x.id + '\',\'xlsx\')" class="flex-1 bg-green-600 text-white text-xs py-2 rounded font-bold">📊 XLSX</button><button onclick="app.generateReport(\'' + x.id + '\',\'csv\')" class="flex-1 bg-blue-600 text-white text-xs py-2 rounded font-bold"> CSV</button></div>';
            c.appendChild(d);
        });
    },

    generateReport: async function(rid, fmt) {
        var items = await db.getAll(app.currentInstituicao ? app.currentInstituicao.id : null);
        var inst = app.currentInstituicao ? app.currentInstituicao.nome : 'Inventário';
        var dg = new Date().toLocaleString('pt-BR');
        var usr = (app.currentUser && (app.currentUser.nome || app.currentUser.name)) || 'Sistema';
        var logo = (app.currentInstituicao && app.currentInstituicao.logo) || null;
        var d = [];
        var t = '';
        switch(rid) {
            case 'completo': t = 'Completo'; d = items.map(function(i) { return { 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Status': i.status, 'Responsável': i.responsavel || '-', 'Entrada': i.dataEntrada || '-', 'Observações': i.observacao || '-' }; }); break;
            case 'emprestados': t = 'Emprestados'; d = items.filter(function(i) { return i.status === 'Emprestado'; }).map(function(i) { return { 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-', 'Entrada': i.dataEntrada || '-' }; }); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'manutencao': t = 'Manutenção'; d = items.filter(function(i) { return i.status === 'Manutenção'; }).map(function(i) { return { 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-' }; }); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'baixados': t = 'Baixados'; d = items.filter(function(i) { return i.status === 'Baixado'; }).map(function(i) { return { 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Categoria': i.categoria, 'Descrição': i.descricao }; }); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'observacoes': t = 'Observações'; d = items.filter(function(i) { return i.observacao && i.observacao.trim(); }).map(function(i) { return { 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Observação': i.observacao }; }); if (!d.length) { alert('Nenhum.'); return; } break;
            case 'categorias':
                t = 'Por Categoria';
                var c = {};
                items.forEach(function(i) {
                    var x = i.categoria || 'Outro';
                    if (!c[x]) c[x] = { total: 0, a: 0, e: 0, m: 0, b: 0 };
                    c[x].total++;
                    if (i.status === 'Ativo') c[x].a++;
                    else if (i.status === 'Emprestado') c[x].e++;
                    else if (i.status === 'Manutenção') c[x].m++;
                    else if (i.status === 'Baixado') c[x].b++;
                });
                d = Object.keys(c).map(function(x) { return { 'Categoria': x, 'Total': c[x].total, 'Ativos': c[x].a, 'Emprestados': c[x].e, 'Manutenção': c[x].m, 'Baixados': c[x].b }; });
                break;
            case 'historico':
                t = 'Histórico';
                items.forEach(function(i) {
                    if (i.historico && i.historico.length) {
                        i.historico.forEach(function(h) {
                            d.push({ 'Código': i.codigo, 'Patrimônio': i.patrimonio || '-', 'Descrição': i.descricao, 'Evento': h });
                        });
                    }
                });
                if (!d.length) { alert('Nenhum.'); return; }
                break;
        }
        if (!d.length) { alert('Sem dados.'); return; }
        var n = t.replace(/\s+/g, '_') + '_' + inst + '_' + new Date().toISOString().split('T')[0];
        if (fmt === 'csv') utils.exportCSVReport(d, n);
        else if (fmt === 'xlsx') utils.exportXLSX(d, n, t, inst, dg, usr, logo);
        else utils.exportPDFReport(d, n, t, inst, dg, usr, logo);
        alert('✅ "' + t + '" gerado!\n' + d.length + ' registros em ' + fmt.toUpperCase());
    },

    openUserManagementDirect: function() {
        if (!app.isLoggedIn) { alert('❌ Faça login primeiro'); return; }
        var userLevel = (app.currentUser && (app.currentUser.nivel || app.currentUser.level)) || '';
        if (userLevel !== 'admin') {
            alert(' Apenas administradores.\n\nSeu nível: ' + (userLevel || 'não definido'));
            return;
        }
        var c = document.getElementById('users-list');
        if (!c) { alert('❌ Erro: container não encontrado'); return; }
        c.innerHTML = '';
        var usersToShow = (app.localUsers || []).filter(function(u) { return !(u.username === 'admin' && u.master); });
        if (usersToShow.length === 0) {
            c.innerHTML = '<p class="text-center text-gray-500 py-4">Nenhum usuário cadastrado ainda.<br>Crie o primeiro abaixo.</p>';
        } else {
            usersToShow.forEach(function(u) {
                var d = document.createElement('div');
                d.className = 'flex justify-between items-center p-2 bg-gray-100 rounded mb-2';
                d.innerHTML = '<div class="flex-1"><p class="font-bold">' + (u.nome || u.name || u.username) + '</p><p class="text-xs text-gray-600">@' + u.username + ' - ' + (app.accessLevels[u.nivel || u.level] ? app.accessLevels[u.nivel || u.level].name : (u.nivel || u.level)) + '</p></div><div class="flex gap-2"><button onclick="app.editUserDirect(\'' + u.username + '\')" class="text-blue-600 text-xs">Editar</button><button onclick="app.deleteUserDirect(\'' + u.username + '\')" class="text-red-600 text-xs">Excluir</button></div>';
                c.appendChild(d);
            });
        }
        var modal = document.getElementById('user-management-modal');
        if (modal) { modal.classList.remove('hidden'); }
        else { alert('❌ Erro: modal não encontrado no HTML'); }
    },

        createUserDirect: async function() {
        alert('🔍 Passo 1: Função chamada');
        
        if (!app.isLoggedIn) { alert('❌ Não está logado'); return; }
        alert('✅ Passo 2: Logado');
        
        var name = document.getElementById('new-user-name').value.trim();
        var username = document.getElementById('new-user-username').value.trim();
        var password = document.getElementById('new-user-password').value;
        var level = document.getElementById('new-user-level').value;
        
        alert('🔍 Passo 3: Dados - ' + name + ', ' + username + ', nível: ' + level);
        
        if (!name || !username || !password) { alert('❌ Preencha todos os campos'); return; }
        if (username.includes(' ')) { alert('❌ Sem espaços no usuário'); return; }
        if (app.localUsers.find(function(x) { return x.username === username; })) { alert('❌ Já existe'); return; }
        
        alert('✅ Passo 4: Validações OK. Tentando hash...');
        
        var hash = '';
        try {
            // Tenta usar crypto.subtle (seguro)
            if (typeof utils !== 'undefined' && typeof utils.hashPassword === 'function') {
                hash = await utils.hashPassword(password);
                alert('✅ Passo 5: Hash criptográfico gerado');
            } else {
                throw new Error('utils.hashPassword não disponível');
            }
        } catch (e) {
            alert('⚠️ Hash criptográfico falhou: ' + e.message + '\nUsando fallback...');
            // Fallback: hash simples (não seguro, mas funcional para teste)
            hash = 'fallback_' + btoa(username + ':' + password).replace(/[^a-zA-Z0-9]/g, '');
            alert('✅ Passo 5 (fallback): Hash simples gerado');
        }
        
        try {
            var newUser = {
                username: username,
                nome: name,
                senhaHash: hash,
                nivel: level,
                ativo: true,
                master: false
            };
            
            alert('🔍 Passo 6: Criando objeto usuário...');
            
            app.localUsers.push(newUser);
            localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
            
            alert('✅ Passo 7: Salvo localmente. Total de usuários: ' + app.localUsers.length);
            
            // Tenta sincronizar (silenciosamente)
            try {
                if (typeof sync !== 'undefined' && typeof sync.syncUsers === 'function') {
                    await sync.syncUsers([newUser]);
                    alert('✅ Passo 8: Sincronizado com nuvem');
                } else {
                    alert('⚠️ Passo 8: sync.syncUsers não disponível (offline)');
                }
            } catch (syncErr) {
                alert('⚠️ Passo 8: Sync falhou: ' + syncErr.message);
            }
            
            alert('✅ USUÁRIO CRIADO COM SUCESSO!\n\nNome: ' + name + '\nUsuário: ' + username + '\nNível: ' + (app.accessLevels[level] ? app.accessLevels[level].name : level));
            
            // Limpa formulário
            document.getElementById('new-user-name').value = '';
            document.getElementById('new-user-username').value = '';
            document.getElementById('new-user-password').value = '';
            
            // Reabre modal
            app.openUserManagementDirect();
        } catch (error) {
            alert('❌ ERRO FINAL: ' + error.message + '\n\nStack: ' + error.stack);
        }
    },

    editUserDirect: async function(username) {
        var user = app.localUsers.find(function(x) { return x.username === username; });
        if (!user) { alert('❌ Usuário não encontrado'); return; }
        var newLevel = prompt('Alterar nível de ' + (user.nome || user.username) + '?\n\nAtual: ' + (app.accessLevels[user.nivel || user.level] ? app.accessLevels[user.nivel || user.level].name : (user.nivel || user.level)) + '\n\nDigite: admin, editor ou viewer', user.nivel || user.level);
        if (newLevel && ['admin', 'editor', 'viewer'].includes(newLevel)) {
            user.nivel = newLevel;
            localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
            try { await sync.syncUsers([user]); } catch(e) {}
            alert('✅ Nível alterado para: ' + (app.accessLevels[newLevel] ? app.accessLevels[newLevel].name : newLevel));
        } else if (newLevel) { alert('❌ Nível inválido'); }
        if (confirm('Deseja alterar a senha?')) {
            var newPass = prompt('Nova senha:');
            if (newPass && newPass.trim()) {
                user.senhaHash = await utils.hashPassword(newPass.trim());
                localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                try { await sync.syncUsers([user]); } catch(e) {}
                alert('✅ Senha alterada!');
            }
        }
        app.openUserManagementDirect();
    },

    deleteUserDirect: async function(username) {
        if (confirm('Excluir usuário ' + username + '?\n\nEsta ação revoga o acesso permanentemente.')) {
            var idx = app.localUsers.findIndex(function(x) { return x.username === username; });
            if (idx > -1) {
                app.localUsers.splice(idx, 1);
                localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                try { await sync.syncUsers([{ username: username, ativo: false }]); } catch(e) {}
                alert('✅ Usuário excluído e acesso revogado.');
            }
            app.openUserManagementDirect();
        }
    },

    closeUserManagement: function() {
        document.getElementById('user-management-modal').classList.add('hidden');
    },

    openInstituicaoManagement: function() {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') { alert('Apenas admins'); return; }
        app.instituicoes.init();
        var is = app.instituicoes.getAll();
        var c = document.getElementById('instituicoes-list');
        if (!c) return;
        c.innerHTML = '';
        is.forEach(function(i) {
            var lp = i.logo ? '<img src="' + i.logo + '" class="w-8 h-8 rounded mr-2">' : '';
            var d = document.createElement('div');
            d.className = 'flex justify-between items-center p-2 bg-gray-100 rounded mb-2';
            d.innerHTML = '<div class="flex items-center">' + lp + '<div><p class="font-bold">' + i.nome + '</p><p class="text-xs text-gray-600">' + (i.cidade || '') + '</p></div></div>' + (i.id !== 'default' ? '<button onclick="app.deleteInstituicao(\'' + i.id + '\')" class="text-red-600 text-sm">Excluir</button>' : '');
            c.appendChild(d);
        });
        document.getElementById('instituicao-management-modal').classList.remove('hidden');
    },

    closeInstituicaoManagement: function() {
        document.getElementById('instituicao-management-modal').classList.add('hidden');
    },

    createInstituicao: async function() {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return;
        var n = document.getElementById('new-inst-nome').value.trim();
        var ci = document.getElementById('new-inst-cidade').value.trim();
        var li = document.getElementById('new-inst-logo');
        if (!n) { alert('Informe o nome'); return; }
        var lb = null;
        if (li.files[0]) {
            try { lb = await utils.compressImage(li.files[0], 200, 200, 0.7); }
            catch(e) { alert('Erro logo: ' + e.message); return; }
        }
        app.instituicoes.create({ nome: n, cidade: ci, logo: lb });
        alert('Unidade criada!\n' + n + (ci ? ' - ' + ci : '') + (lb ? '\n✅ Logo ok' : '\n️ Sem logo'));
        document.getElementById('new-inst-nome').value = '';
        document.getElementById('new-inst-cidade').value = '';
        li.value = '';
        app.openInstituicaoManagement();
    },

    deleteInstituicao: function(id) {
        if (!app.isLoggedIn || (app.currentUser.nivel || app.currentUser.level) !== 'admin') return;
        if (confirm('Excluir unidade?')) { app.instituicoes.delete(id); app.openInstituicaoManagement(); }
    },

    users: {
        init: async function() {
            if (!localStorage.getItem('user_admin')) {
                localStorage.setItem('user_admin', JSON.stringify({ username: 'admin', password: 'musica2026', level: 'admin', name: 'Administrador', master: true }));
            }
            if (!localStorage.getItem('usersMigrated')) {
                var ok = [];
                for (var i = 0; i < localStorage.length; i++) {
                    var k = localStorage.key(i);
                    if (k && k.startsWith('user_') && k !== 'user_admin') ok.push(k);
                }
                if (ok.length > 0) {
                    var mig = [];
                    for (var j = 0; j < ok.length; j++) {
                        try {
                            var u = JSON.parse(localStorage.getItem(ok[j]));
                            if (u.username && u.password) {
                                var h = await utils.hashPassword(u.password);
                                mig.push({ username: u.username, nome: u.name || u.username, senhaHash: h, nivel: u.level || 'viewer', ativo: true, master: false });
                            }
                        } catch(e) {}
                    }
                    if (mig.length > 0) {
                        for (var k = 0; k < mig.length; k++) {
                            if (!app.localUsers.find(function(x) { return x.username === mig[k].username; })) {
                                app.localUsers.push(mig[k]);
                            }
                        }
                        localStorage.setItem('cloudUsersCache', JSON.stringify(app.localUsers));
                        await sync.syncUsers(mig);
                        ok.forEach(function(k) { localStorage.removeItem(k); });
                        localStorage.setItem('usersMigrated', 'true');
                    } else {
                        localStorage.setItem('usersMigrated', 'true');
                    }
                } else {
                    localStorage.setItem('usersMigrated', 'true');
                }
            }
        },
        getLocal: function(u) {
            var d = localStorage.getItem('user_' + u);
            return d ? JSON.parse(d) : null;
        }
    },

    instituicoes: {
        init: function() {
            if (!localStorage.getItem('inst_default')) {
                localStorage.setItem('inst_default', JSON.stringify({ id: 'default', nome: 'Escola de Música', cidade: 'Sede' }));
            }
        },
        create: function(d) {
            var id = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('inst_' + id, JSON.stringify(Object.assign({ id: id }, d)));
        },
        getAll: function() {
            var a = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.startsWith('inst_')) {
                    try { a.push(JSON.parse(localStorage.getItem(k))); } catch(e) {}
                }
            }
            return a;
        },
        get: function(id) {
            var d = localStorage.getItem('inst_' + id);
            return d ? JSON.parse(d) : null;
        },
        delete: function(id) {
            if (id === 'default') { alert('Não pode excluir padrão'); return; }
            localStorage.removeItem('inst_' + id);
        }
    },

    accessLevels: {
        admin: { name: 'Administrador', canCreate: true, canEdit: true, canDelete: true, canBorrow: true, canMaintenance: true, canSync: true, canManageUsers: true },
        editor: { name: 'Editor', canCreate: true, canEdit: true, canDelete: false, canBorrow: true, canMaintenance: true, canSync: false, canManageUsers: false },
        viewer: { name: 'Visualizador', canCreate: false, canEdit: false, canDelete: false, canBorrow: false, canMaintenance: false, canSync: false, canManageUsers: false }
    }
};

document.addEventListener('DOMContentLoaded', app.init);
