const app = {
    isLoggedIn: false,
    currentUser: null,
    scanner: null,
    currentItem: null,

    init: async () => {
        await db.init();
        app.users.init();
        
        const savedUserKey = localStorage.getItem('sessionUser');
        if (savedUserKey) {
            const user = app.users.get(savedUserKey);
            if (user) {
                app.isLoggedIn = true;
                app.currentUser = user;
                document.getElementById('btn-login-toggle').textContent = `🔓 ${user.name}`;
                app.applyPermissions(app.accessLevels[user.level]);
            }
        }

        app.navigate('dashboard');
        app.updateDashboard();
    },

    forceUpdate: () => {
        if (confirm('Isso vai limpar o cache e recarregar a página. OK?')) {
            localStorage.removeItem('sessionUser');
            if ('caches' in window) {
                caches.keys().then(names => {
                    names.forEach(name => caches.delete(name));
                });
            }
            window.location.reload(true);
        }
    },

    navigate: (viewId) => {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        if (viewId === 'dashboard') app.renderList();
        if (viewId === 'add') {
            document.getElementById('item-codigo').value = utils.generateCode();
        }
        if (viewId === 'scanner') app.startScanner();
    },

    toggleLogin: () => {
        if (app.isLoggedIn) {
            app.isLoggedIn = false;
            app.currentUser = null;
            localStorage.removeItem('sessionUser');
            document.getElementById('btn-login-toggle').textContent = '';
            document.getElementById('admin-actions').classList.add('hidden');
            app.applyPermissions({ canCreate: false, canSync: false, canManageUsers: false });
            alert('Deslogado.');
        } else {
            document.getElementById('login-modal').classList.remove('hidden');
        }
    },

    doLogin: () => {
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value;
        
        const user = app.users.get(u);
        
        if (user && user.password === p) {
            app.isLoggedIn = true;
            app.currentUser = user;
            localStorage.setItem('sessionUser', u);
            document.getElementById('btn-login-toggle').textContent = `🔓 ${user.name}`;
            document.getElementById('login-modal').classList.add('hidden');
            
            app.applyPermissions(app.accessLevels[user.level]);
            
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

        const printBtn = document.querySelector('button[onclick="app.printLabels()"]');
        if (printBtn) printBtn.style.display = perms.canCreate ? 'block' : 'none';
    },

    saveItem: async (e) => {
        e.preventDefault();
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
            status: 'Ativo',
            dataEntrada: new Date().toISOString().split('T')[0],
            historico: [`Criado em ${new Date().toLocaleString()}`]
        };

        await db.save(item);
        alert('Item salvo!');
        document.getElementById('form-add').reset();
        app.navigate('dashboard');
        app.updateDashboard();
    },

    renderList: async () => {
        const items = await db.getAll();
        const container = document.getElementById('items-list');
        container.innerHTML = '';
        
        const filter = document.getElementById('search-input').value.toLowerCase();
        const filtered = items.filter(i => i.codigo.toLowerCase().includes(filter) || i.descricao.toLowerCase().includes(filter));

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'bg-white p-3 rounded shadow border-l-4 ' + (item.status === 'Ativo' ? 'border-green-500' : 'border-red-500');
            div.innerHTML = `
                <div class="flex justify-between items-center cursor-pointer" onclick="app.renderDetail('${item.codigo}')">
                    <div>
                        <p class="font-bold text-sm">${item.codigo}</p>
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
        app.currentItem = item;
        const container = document.getElementById('detail-content');
        
        let historicoHtml = item.historico.map(h => `<li class="text-xs text-gray-600">• ${h}</li>`).join('');

        container.innerHTML = `
            ${item.foto ? `<img src="${item.foto}" class="w-full h-48 object-cover rounded-lg mb-4">` : ''}
            <h2 class="text-2xl font-bold">${item.codigo}</h2>
            <p class="text-gray-600">${item.categoria} | ${item.descricao}</p>
            <div class="bg-gray-100 p-3 rounded mt-2">
                <p><strong>Status:</strong> ${item.status}</p>
                <p><strong>Responsável:</strong> ${item.responsavel || 'N/A'}</p>
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

        if (app.isLoggedIn) {
            document.getElementById('admin-actions').classList.remove('hidden');
        } else {
            document.getElementById('admin-actions').classList.add('hidden');
        }
        app.navigate('detail');
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
        const items = await db.getAll();
        document.getElementById('dash-total').textContent = items.length;
        document.getElementById('dash-emprestados').textContent = items.filter(i => i.status === 'Emprestado').length;
        document.getElementById('dash-manutencao').textContent = items.filter(i => i.status === 'Manutenção').length;
        document.getElementById('dash-ativos').textContent = items.filter(i => i.status === 'Ativo').length;
    },

    printLabels: async () => {
        const items = await db.getAll();
        if (items.length === 0) {
            alert('Nenhum item cadastrado.');
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
                    </div>
                </div>
            `;
        });

        printWindow.document.write(`
            <html>
            <head>
                <title>Etiquetas de Inventário</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    .container { display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start; }
                    .label { 
                        border: 1px dashed #ccc; 
                        padding: 10px; 
                        width: 180px; 
                        text-align: center; 
                        page-break-inside: avoid;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }
                    .qr-img { width: 120px; height: 120px; margin-bottom: 8px; }
                    .label-code { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
                    .label-desc { font-size: 10px; color: #555; word-wrap: break-word; }
                    
                    @media print {
                        body { padding: 0; }
                        .label { border: 1px solid #000; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="text-align:center; margin-bottom:20px;">
                    <h2>Pré-visualização de Etiquetas (${items.length} itens)</h2>
                    <p>Clique no botão abaixo ou pressione Ctrl+P para imprimir.</p>
                    <button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer;">🖨️ Imprimir Agora</button>
                </div>
                <div class="container">
                    ${labelsHtml}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    startScanner: () => {
        app.scanner = new Html5Qrcode("reader");
        app.scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
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
            },
            () => { }
        ).catch(err => {
            alert('Erro na câmera.');
            app.navigate('dashboard');
        });
    },

    stopScanner: () => {
        if (app.scanner) { app.scanner.stop().catch(() => {}); app.scanner = null; }
    },

    exportCSV: async () => { utils.exportCSV(await db.getAll()); },
    exportPDF: async () => { utils.exportPDF(await db.getAll()); },

    clearData: async () => {
        if (confirm('TEM CERTEZA? Apagará TUDO.')) {
            await db.clear();
            localStorage.clear();
            window.location.reload();
        }
    },

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
        const name = document.getElementById('new-user-name').value.trim();
        const username = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value;
        const level = document.getElementById('new-user-level').value;
        
        if (!name || !username || !password) { alert('Preencha tudo'); return; }
        if (username.includes(' ')) { alert('Usuário não pode ter espaços'); return; }
        
        app.users.create({ name, username, password, level });
        alert('Usuário criado!');
        app.openUserManagement();
    },

    deleteUser: (username) => {
        if (confirm(`Excluir ${username}?`)) {
            app.users.delete(username);
            app.openUserManagement();
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
        get: (username) => {
            const data = localStorage.getItem(`user_${username}`);
            return data ? JSON.parse(data) : null;
        },
        delete: (username) => {
            if (username === 'admin') { alert('Não pode excluir o admin'); return; }
            localStorage.removeItem(`user_${username}`);
        }
    },

    accessLevels: {
        admin: { name: 'Administrador', canCreate: true, canEdit: true, canDelete: true, canBorrow: true, canMaintenance: true, canSync: true, canManageUsers: true },
        editor: { name: 'Editor', canCreate: true, canEdit: true, canDelete: false, canBorrow: true, canMaintenance: true, canSync: false, canManageUsers: false },
        viewer: { name: 'Visualizador', canCreate: false, canEdit: false, canDelete: false, canBorrow: false, canMaintenance: false, canSync: false, canManageUsers: false }
    }
};

document.addEventListener('DOMContentLoaded', app.init);
