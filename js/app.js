const app = {
    isLoggedIn: false,
    currentUser: null,
    currentInstituicao: null,
    scanner: null,
    currentItem: null,

    init: async () => {
        await db.init();
        app.users.init();
        app.instituicoes.init();
        
        const savedSession = localStorage.getItem('sessionData');
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                const user = app.users.get(session.username);
                if (user && session.instituicao) {
                    app.isLoggedIn = true;
                    app.currentUser = user;
                    app.currentInstituicao = session.instituicao;
                    document.getElementById('btn-login-toggle').textContent = `🔓 ${user.name}`;
                    app.applyPermissions(app.accessLevels[user.level]);
                }
            } catch (e) {
                localStorage.removeItem('sessionData');
            }
        }

        app.navigate('dashboard');
        app.updateDashboard();
        app.updateInstituicaoDisplay();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    },

    forceUpdate: () => {
        if (confirm('Isso vai limpar o cache e recarregar. OK?')) {
            localStorage.clear();
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(n => caches.delete(n)));
            }
            window.location.reload(true);
        }
    },

    navigate: (viewId) => {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        if (viewId === 'dashboard') {
            app.renderList();
            app.updateInstituicaoDisplay();
        }
        if (viewId === 'add') {
            if (!app.isLoggedIn) {
                alert('Faça login para cadastrar itens');
                app.navigate('dashboard');
                return;
            }
            document.getElementById('item-codigo').value = utils.generateCode();
        }
        if (viewId === 'scanner') app.startScanner();
    },

    updateInstituicaoDisplay: () => {
        const display = document.getElementById('current-instituicao-display');
        if (app.currentInstituicao) {
            display.textContent = `📍 ${app.currentInstituicao.nome} - ${app.currentInstituicao.cidade || ''}`;
            display.classList.remove('hidden');
        } else {
            display.textContent = '⚠️ Nenhuma unidade selecionada. Faça login.';
            display.classList.remove('hidden');
        }
    },

    toggleLogin: () => {
        if (app.isLoggedIn) {
            if (confirm('Deseja sair do sistema?')) {
                app.isLoggedIn = false;
                app.currentUser = null;
                app.currentInstituicao = null;
                localStorage.removeItem('sessionData');
                document.getElementById('btn-login-toggle').textContent = '🔒';
                document.getElementById('admin-actions').classList.add('hidden');
                app.applyPermissions({ canCreate: false, canSync: false, canManageUsers: false });
                app.updateDashboard();
                app.updateInstituicaoDisplay();
            }
        } else {
            app.openLoginModal();
        }
    },

    openLoginModal: () => {
        const instituicoes = app.instituicoes.getAll();
        const select = document.getElementById('login-instituicao');
        select.innerHTML = '<option value="">-- Selecione sua unidade --</option>';
        instituicoes.forEach(inst => {
            const option = document.createElement('option');
            option.value = inst.id;
            option.textContent = `${inst.nome} - ${inst.cidade || ''}`;
            select.appendChild(option);
        });
        document.getElementById('login-modal').classList.remove('hidden');
    },

    doLogin: () => {
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value;
        const instId = document.getElementById('login-instituicao').value;
        
        if (!instId) {
            alert('Selecione sua unidade/instituição');
            return;
        }
        
        const user = app.users.get(u);
        
        if (user && user.password === p) {
            const instituicao = app.instituicoes.get(instId);
            if (!instituicao) {
                alert('Unidade não encontrada');
                return;
            }
            
            app.isLoggedIn = true;
            app.currentUser = user;
            app.currentInstituicao = instituicao;
            
            localStorage.setItem('sessionData', JSON.stringify({
                username: u,
                instituicao: instituicao
            }));
            
            document.getElementById('btn-login-toggle').textContent = `🔓 ${user.name}`;
            document.getElementById('login-modal').classList.add('hidden');
            
            app.applyPermissions(app.accessLevels[user.level]);
            app.updateDashboard();
            app.updateInstituicaoDisplay();
            
            if (app.currentItem) app.renderDetail(app.currentItem.codigo);
        } else {
            alert('Credenciais inválidas!');
        }
    },

    closeLogin: () => {
        document.getElementById('login-modal').classList.add('hidden');
    },

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
    },

    saveItem: async (e) => {
        e.preventDefault();
        if (!app.isLoggedIn || !app.currentInstituicao) {
            alert('Faça login e selecione uma unidade');
            return;
        }
        
        const fileInput = document.getElementById('item-foto');
        let fotoBase64 = '';
        if (fileInput.files[0]) {
            fotoBase64 = await utils.compressImage(fileInput.files[0]);
        }

        const item = {
            codigo: document.getElementById('item-codigo').value,
            categoria: document.getElementById('item-categoria').value,
            descricao: document.getElementById('item-descricao').value,
            foto: fotoBase64,
            observacao: document.getElementById('item-obs').value.trim(),
            status: 'Ativo',
            dataEntrada: new Date().toISOString().split('T')[0],
            historico: [`Criado em ${new Date().toLocaleString()} por ${app.currentUser.name}`],
            instituicao: app.currentInstituicao.id,
            instituicaoNome: app.currentInstituicao.nome,
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
        container.innerHTML = '';
        
        const filter = document.getElementById('search-input').value.toLowerCase();
        const filtered = items.filter(i => i.codigo.toLowerCase().includes(filter) || i.descricao.toLowerCase().includes(filter));

        if (filtered.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">Nenhum item cadastrado nesta unidade</p>';
            return;
        }

        filtered.forEach(item => {
            const temObs = item.observacao && item.observacao.trim() !== '';
            const div = document.createElement('div');
            div.className = 'bg-white p-3 rounded shadow border-l-4 ' + (item.status === 'Ativo' ? 'border-green-500' : 'border-red-500');
            div.innerHTML = `
                <div class="flex justify-between items-center cursor-pointer" onclick="app.renderDetail('${item.codigo}')">
                    <div>
                        <p class="font-bold text-sm">${item.codigo} ${temObs ? '📝' : ''}</p>
                        <p class="text-xs text-gray-600">${item.descricao}</p>
                    </div>
                    <span class="text-xs px-2 py-1 rounded bg-gray-200">${item.status}</span>
                </div>
            `;
            container.appendChild(div);
        });
    },

    filterItems: () => { app.renderList(); },

    renderDetail: async (codigo) => {
        const item = await db.get(codigo);
        if (!item) {
            alert('Item não encontrado');
            app.navigate('dashboard');
            return;
        }
        
        app.currentItem = item;
        const container = document.getElementById('detail-content');
        
        let historicoHtml = item.historico.map(h => `<li class="text-xs text-gray-600">• ${h}</li>`).join('');
        const obsText = (item.observacao && item.observacao.trim() !== '') ? item.observacao : 'Nenhuma observação registrada.';

        let fotoUrl = item.foto || '';
        if (fotoUrl.includes('lh3.googleusercontent.com/d/')) {
            const fileId = fotoUrl.match(/\/d\/([^\/\?]+)/)?.[1];
            if (fileId) fotoUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
        }

        const fotoHtml = fotoUrl ? `<img src="${fotoUrl}" class="w-full h-48 object-cover rounded-lg mb-4" onerror="this.style.display='none'">` : '';

        container.innerHTML = `
            ${fotoHtml}
            <h2 class="text-2xl font-bold">${item.codigo}</h2>
            <p class="text-gray-600">${item.categoria} | ${item.descricao}</p>
            <p class="text-xs text-blue-600 font-bold">📍 ${item.instituicaoNome || 'Unidade não identificada'} ${item.instituicaoCidade ? '- ' + item.instituicaoCidade : ''}</p>
            <div class="bg-gray-100 p-3 rounded mt-2">
                <p><strong>Status:</strong> ${item.status}</p>
                <p><strong>Responsável:</strong> ${item.responsavel || 'N/A'}</p>
            </div>
            
            <div class="bg-yellow-50 p-3 rounded mt-2 border border-yellow-200">
                <div class="flex justify-between items-center mb-1">
                    <p class="font-bold text-sm text-yellow-800">📝 Observações:</p>
                    <button id="btn-edit-obs" onclick="app.editObservation()" class="hidden text-xs bg-yellow-600 text-white px-3 py-1 rounded shadow">Editar</button>
                </div>
                <p id="detail-obs-text" class="text-sm text-gray-700 whitespace-pre-wrap">${obsText}</p>
            </div>
            
            <div class="mt-4 bg-white p-4 rounded-lg shadow text-center border">
                <p class="text-sm font-bold mb-2">QR Code</p>
                <div id="detail-qrcode" class="flex justify-center mb-2"></div>
                <p class="text-xs font-mono text-gray-600 break-all">${item.codigo}</p>
                <p class="text-xs text-gray-500 mt-1">${item.descricao}</p>
            </div>
            
            <div class="mt-4">
                <h4 class="font-bold text-sm mb-2">Histórico</h4>
                <ul class="space-y-1">${historicoHtml}</ul>
            </div>
        `;

        setTimeout(() => {
            new QRCode(document.getElementById("detail-qrcode"), {
                text: item.codigo,
                width: 150,
                height: 150
            });
        }, 100);

        const btnEditObs = document.getElementById('btn-edit-obs');
        if (app.isLoggedIn && app.currentUser && app.currentUser.level === 'admin') {
            btnEditObs.classList.remove('hidden');
        } else {
            btnEditObs.classList.add('hidden');
        }

        if (app.isLoggedIn) {
            document.getElementById('admin-actions').classList.remove('hidden');
        } else {
            document.getElementById('admin-actions').classList.add('hidden');
        }
        app.navigate('detail');
    },

    editObservation: async () => {
        if (!app.isLoggedIn || !app.currentUser || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem editar observações.');
            return;
        }
        
        const currentObs = app.currentItem.observacao || '';
        const newObs = prompt('Editar observação (deixe vazio para apagar):', currentObs);
        
        if (newObs !== null) {
            app.currentItem.observacao = newObs.trim();
            const acao = newObs.trim() !== '' ? 'Observação atualizada' : 'Observação limpa';
            app.currentItem.historico.push(`${acao} em ${new Date().toLocaleString()} por ${app.currentUser.name}.`);
            
            await db.save(app.currentItem);
            app.renderDetail(app.currentItem.codigo);
            app.renderList();
        }
    },

    updateStatus: async (newStatus) => {
        if (!app.isLoggedIn) return;
        let responsavel = app.currentUser.name || app.currentUser.username;
        let obs = '';

        if (newStatus === 'Emprestado') {
            responsavel = prompt('Nome do responsável:') || responsavel;
            obs = prompt('Previsão de devolução:') || '-';
        } else if (newStatus === 'Manutenção') {
            obs = prompt('Motivo / Nº OS:') || '-';
        }

        app.currentItem.status = newStatus;
        app.currentItem.responsavel = responsavel;
        app.currentItem.historico.push(`${newStatus} em ${new Date().toLocaleString()} por ${responsavel}. Obs: ${obs}`);
        
        await db.save(app.currentItem);
        alert(`Status: ${newStatus}`);
        app.renderDetail(app.currentItem.codigo);
        app.updateDashboard();
    },

    baixarItem: async () => {
        if (!app.isLoggedIn) return;
        const motivo = prompt('Motivo da baixa:');
        if (!motivo) return;

        app.currentItem.status = 'Baixado';
        app.currentItem.historico.push(`BAIXA em ${new Date().toLocaleString()} por ${app.currentUser.name}. Motivo: ${motivo}`);
        await db.save(app.currentItem);
        alert('Baixado.');
        app.navigate('dashboard');
        app.updateDashboard();
    },

    updateDashboard: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        document.getElementById('dash-total').textContent = items.length;
        document.getElementById('dash-emprestados').textContent = items.filter(i => i.status === 'Emprestado').length;
        document.getElementById('dash-manutencao').textContent = items.filter(i => i.status === 'Manutenção').length;
        document.getElementById('dash-ativos').textContent = items.filter(i => i.status === 'Ativo').length;
    },

    printLabels: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        if (items.length === 0) {
            alert('Nenhum item cadastrado nesta unidade.');
            return;
        }

        const printWindow = window.open('', '_blank');
        
        let labelsHtml = '';
        items.forEach(item => {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(item.codigo)}`;
            labelsHtml += `
                <div class="label">
                    <img src="${qrUrl}" alt="QR Code" class="qr-img">
                    <div class="label-text">
                        <div class="label-code">${item.codigo}</div>
                        <div class="label-desc">${item.descricao}</div>
                        <div class="label-inst">${item.instituicaoNome || ''}</div>
                    </div>
                </div>
            `;
        });

        printWindow.document.write(`
            <html>
            <head>
                <title>Etiquetas - ${app.currentInstituicao?.nome || ''}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    .container { display: flex; flex-wrap: wrap; gap: 15px; }
                    .label { border: 1px dashed #ccc; padding: 10px; width: 180px; text-align: center; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; }
                    .qr-img { width: 120px; height: 120px; margin-bottom: 8px; }
                    .label-code { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
                    .label-desc { font-size: 10px; color: #555; word-wrap: break-word; }
                    .label-inst { font-size: 9px; color: #888; margin-top: 4px; font-style: italic; }
                    @media print { body { padding: 0; } .label { border: 1px solid #000; } .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="no-print" style="text-align:center; margin-bottom:20px;">
                    <h2>Etiquetas - ${app.currentInstituicao?.nome || ''} (${items.length} itens)</h2>
                    <button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer;">🖨️ Imprimir Agora</button>
                </div>
                <div class="container">${labelsHtml}</div>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    startScanner: () => {
        app.scanner = new Html5Qrcode("reader");
        app.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                app.stopScanner();
                if (!app.isLoggedIn) {
                    alert(`Código: ${decodedText}\n(Faça login para ver detalhes)`);
                    app.navigate('dashboard');
                } else {
                    const item = await db.get(decodedText);
                    if (item) app.renderDetail(decodedText);
                    else { alert('Item não encontrado.'); app.navigate('dashboard'); }
                }
            }, () => { }).catch(err => { alert('Erro na câmera.'); app.navigate('dashboard'); });
    },

    stopScanner: () => { if (app.scanner) { app.scanner.stop().catch(() => {}); app.scanner = null; } },

    exportCSV: async () => { utils.exportCSV(await db.getAll(app.currentInstituicao?.id)); },
    exportPDF: async () => { utils.exportPDF(await db.getAll(app.currentInstituicao?.id)); },

    clearData: async () => {
        if (confirm('TEM CERTEZA? Apagará TUDO do celular.')) {
            await db.clear();
            localStorage.clear();
            window.location.reload();
        }
    },

    // ===== GESTÃO DE USUÁRIOS =====
    openUserManagement: () => {
        app.users.init();
        const users = app.users.getAll();
        const container = document.getElementById('users-list');
        container.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2 bg-gray-100 rounded';
            div.innerHTML = `
                <div>
                    <p class="font-bold">${user.name}</p>
                    <p class="text-xs text-gray-600">@${user.username} - ${app.accessLevels[user.level].name}</p>
                </div>
                ${user.username !== 'admin' ? `<button onclick="app.deleteUser('${user.username}')" class="text-red-600 text-sm">Excluir</button>` : ''}
            `;
            container.appendChild(div);
        });
        document.getElementById('user-management-modal').classList.remove('hidden');
    },

    closeUserManagement: () => { document.getElementById('user-management-modal').classList.add('hidden'); },

    createUser: () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem criar usuários');
            return;
        }
        
        const name = document.getElementById('new-user-name').value.trim();
        const username = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value;
        const level = document.getElementById('new-user-level').value;
        
        if (!name || !username || !password) { alert('Preencha todos os campos'); return; }
        if (username.includes(' ')) { alert('Usuário não pode ter espaços'); return; }
        
        app.users.create({ name, username, password, level });
        alert(`Usuário criado com sucesso!\n\nNome: ${name}\nUsuário: ${username}\nNível: ${app.accessLevels[level].name}`);
        
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-username').value = '';
        document.getElementById('new-user-password').value = '';
        
        app.openUserManagement();
    },

    deleteUser: (username) => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem excluir usuários');
            return;
        }
        if (confirm(`Excluir usuário ${username}?`)) {
            app.users.delete(username);
            app.openUserManagement();
        }
    },

    // ===== GESTÃO DE INSTITUIÇÕES =====
    openInstituicaoManagement: () => {
        app.instituicoes.init();
        const instituicoes = app.instituicoes.getAll();
        const container = document.getElementById('instituicoes-list');
        container.innerHTML = '';
        instituicoes.forEach(inst => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2 bg-gray-100 rounded';
            div.innerHTML = `
                <div>
                    <p class="font-bold">${inst.nome}</p>
                    <p class="text-xs text-gray-600">${inst.cidade || 'Cidade não informada'}</p>
                </div>
                ${inst.id !== 'default' ? `<button onclick="app.deleteInstituicao('${inst.id}')" class="text-red-600 text-sm">Excluir</button>` : ''}
            `;
            container.appendChild(div);
        });
        document.getElementById('instituicao-management-modal').classList.remove('hidden');
    },

    closeInstituicaoManagement: () => { document.getElementById('instituicao-management-modal').classList.add('hidden'); },

    createInstituicao: () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem criar unidades');
            return;
        }
        
        const nome = document.getElementById('new-inst-nome').value.trim();
        const cidade = document.getElementById('new-inst-cidade').value.trim();
        
        if (!nome) { alert('Informe o nome da unidade'); return; }
        
        app.instituicoes.create({ nome, cidade });
        alert(`Unidade criada com sucesso!\n\n${nome}${cidade ? ' - ' + cidade : ''}`);
        
        document.getElementById('new-inst-nome').value = '';
        document.getElementById('new-inst-cidade').value = '';
        
        app.openInstituicaoManagement();
    },

    deleteInstituicao: (id) => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem excluir unidades');
            return;
        }
        if (confirm('Excluir esta unidade? Os itens cadastrados nela NÃO serão apagados, mas ficarão sem vínculo.')) {
            app.instituicoes.delete(id);
            app.openInstituicaoManagement();
        }
    },

    users: {
        init: () => {
            if (!localStorage.getItem('user_admin')) {
                localStorage.setItem('user_admin', JSON.stringify({
                    username: 'admin', password: 'musica2026', level: 'admin', name: 'Administrador'
                }));
            }
        },
        create: (userData) => { localStorage.setItem(`user_${userData.username}`, JSON.stringify(userData)); },
        getAll: () => {
            const users = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('user_')) users.push(JSON.parse(localStorage.getItem(key)));
            }
            return users;
        },
        get: (username) => { const data = localStorage.getItem(`user_${username}`); return data ? JSON.parse(data) : null; },
        delete: (username) => { if (username === 'admin') { alert('Não pode excluir o admin'); return; } localStorage.removeItem(`user_${username}`); }
    },

    instituicoes: {
        init: () => {
            if (!localStorage.getItem('inst_default')) {
                localStorage.setItem('inst_default', JSON.stringify({
                    id: 'default',
                    nome: 'Escola de Música',
                    cidade: 'Sede'
                }));
            }
        },
        create: (instData) => {
            const id = utils.generateId();
            const instituicao = { id, ...instData };
            localStorage.setItem(`inst_${id}`, JSON.stringify(instituicao));
        },
        getAll: () => {
            const instituicoes = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('inst_')) instituicoes.push(JSON.parse(localStorage.getItem(key)));
            }
            return instituicoes;
        },
        get: (id) => { const data = localStorage.getItem(`inst_${id}`); return data ? JSON.parse(data) : null; },
        delete: (id) => { if (id === 'default') { alert('Não pode excluir a unidade padrão'); return; } localStorage.removeItem(`inst_${id}`); }
    },

    accessLevels: {
        admin: { name: 'Administrador', canCreate: true, canEdit: true, canDelete: true, canBorrow: true, canMaintenance: true, canSync: true, canManageUsers: true },
        editor: { name: 'Editor', canCreate: true, canEdit: true, canDelete: false, canBorrow: true, canMaintenance: true, canSync: false, canManageUsers: false },
        viewer: { name: 'Visualizador', canCreate: false, canEdit: false, canDelete: false, canBorrow: false, canMaintenance: false, canSync: false, canManageUsers: false }
    }
};

document.addEventListener('DOMContentLoaded', app.init);
