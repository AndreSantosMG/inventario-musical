const app = {
    isLoggedIn: false,
    currentUser: null,
    scanner: null,
    currentItem: null,

    init: async () => {
        await db.init();
        app.users.init();
        
        // Restaurar sessão automaticamente
        const savedUser = localStorage.getItem('sessionUser');
        if (savedUser) {
            const user = app.users.get(savedUser);
            if (user) {
                app.isLoggedIn = true;
                app.currentUser = user;
                document.getElementById('btn-login-toggle').textContent = ` ${user.name}`;
                app.applyPermissions(app.accessLevels[user.level]);
            }
        }

        app.navigate('dashboard');
        app.updateDashboard();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    },

    navigate: (viewId) => {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        if (viewId === 'dashboard') app.renderList();
        if (viewId === 'add') {
            document.getElementById('item-codigo').value = utils.generateCode();
            document.getElementById('qrcode-container').innerHTML = '';
            new QRCode(document.getElementById("qrcode-container"), {
                text: document.getElementById('item-codigo').value,
                width: 128, height: 128
            });
        }
        if (viewId === 'scanner') app.startScanner();
    },

    toggleLogin: () => {
        if (app.isLoggedIn) {
            app.isLoggedIn = false;
            app.currentUser = null;
            localStorage.removeItem('sessionUser'); // Limpa a sessão salva
            document.getElementById('btn-login-toggle').textContent = '🔒';
            document.getElementById('admin-actions').classList.add('hidden');
            app.applyPermissions({ canCreate: false, canSync: false, canManageUsers: false });
            alert('Deslogado.');
        } else {
            document.getElementById('login-modal').classList.remove('hidden');
        }
    },

    doLogin: () => {
        const u = document.getElementById('login-user').value;
        const p = document.getElementById('login-pass').value;
        
        const user = app.users.get(u);
        
        if (user && user.password === p) {
            app.isLoggedIn = true;
            app.currentUser = user;
            localStorage.setItem('sessionUser', u); // Salva a sessão
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
        alert('Item salvo com sucesso!');
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
                        <p class="text-xs text-gray-600">${item.descricao} (${item.categoria})</p>
                    </div>
                    <span class="text-xs px-2 py-1 rounded bg-gray-200">${item.status}</span>
                </div>
            `;
            container.appendChild(div);
        });
    },

    filterItems: () => {
        app.renderList();
    },

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
                <p><strong>Data Entrada:</strong> ${item.dataEntrada}</p>
            </div>
            
            <div class="mt-4 bg-white p-4 rounded-lg shadow text-center">
                <p class="text-sm font-bold mb-2">QR Code do Item</p>
                <div id="detail-qrcode" class="flex justify-center mb-2"></div>
                <p class="text-xs text-gray-600">${item.codigo}</p>
            </div>
            
            <div class="mt-4">
                <h4 class="font-bold text-sm mb-2">Histórico</h4>
                <ul class="space-y-1">${historicoHtml}</ul>
            </div>
        `;

        new QRCode(document.getElementById("detail-qrcode"), {
            text: item.codigo,
            width: 150,
            height: 150
        });

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
            responsavel = prompt('Nome do responsável pelo empréstimo:') || responsavel;
            obs = prompt('Data prevista de devolução (DD/MM/AAAA):') || 'Não definida';
        } else if (newStatus === 'Manutenção') {
            obs = prompt('Motivo da Manutenção / Nº OS:') || 'OS pendente';
        }

        app.currentItem.status = newStatus;
        app.currentItem.responsavel = responsavel;
        app.currentItem.historico.push(`${newStatus} em ${new Date().toLocaleString()} por ${responsavel}. Obs: ${obs}`);
        
        await db.save(app.currentItem);
        alert(`Status atualizado para: ${newStatus}`);
        app.renderDetail(app.currentItem.codigo);
        app.updateDashboard();
    },

    baixarItem: async () => {
        if (!app.isLoggedIn) return;
        const motivo = prompt('Motivo da baixa (Extravio, Sucata, Doação):');
        if (!motivo) return;

        app.currentItem.status = 'Baixado';
        app.currentItem.historico.push(`BAIXA em ${new Date().toLocaleString()} por ${app.currentUser.name || app.currentUser.username}. Motivo: ${motivo}`);
        await db.save(app.currentItem);
        alert('Item baixado com sucesso.');
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

    startScanner: () => {
        app.scanner = new Html5Qrcode("reader");
        app.scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                app.stopScanner();
                if (!app.isLoggedIn) {
                    alert(`Código Escaneado:\n\n${decodedText}\n\n(Faça login para ver detalhes)`);
                    app.navigate('dashboard');
                } else {
                    const item = await db.get(decodedText);
                    if (item) {
                        app.renderDetail(decodedText);
                    } else {
                        alert('Item não encontrado no banco local.');
                        app.navigate('dashboard');
                    }
                }
            },
            (errorMessage) => { }
        ).catch(err => {
            alert('Erro ao iniciar câmera. Verifique as permissões.');
            app.navigate('dashboard');
        });
    },

    stopScanner: () => {
        if (app.scanner) {
            app.scanner.stop().catch(() => {});
            app.scanner = null;
        }
    },

    exportCSV: async () => {
        const items = await db.getAll();
        utils.exportCSV(items);
    },

    exportPDF: async () => {
        const items = await db.getAll();
        utils.exportPDF(items);
    },

    clearData: async () => {
        if (confirm('TEM CERTEZA? Isso apagará TODOS os dados, fotos e o login. Esta ação não pode ser desfeita.')) {
            await db.clear();
            localStorage.clear(); // Limpa também a sessão e usuários
            alert('Dados limpos. Recarregando...');
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

    closeUserManagement: () => {
        document.getElementById('user-management-modal').classList.add('hidden');
    },

    createUser: () => {
        const name = document.getElementById('new-user-name').value;
        const username = document.getElementById('new-user-username').value;
        const password = document.getElementById('new-user-password').value;
        const level = document.getElementById('new-user-level').value;
        
        if (!name || !username || !password) {
            alert('Preencha todos os campos');
            return;
        }
        
        app.users.create({ name, username, password, level });
        alert('Usuário criado com sucesso!');
        app.openUserManagement();
    },

    deleteUser: (username) => {
        if (confirm(`Excluir usuário ${username}?`)) {
            app.users.delete(username);
            app.openUserManagement();
        }
    },

    users: {
        init: () => {
            if (!localStorage.getItem('user_admin')) {
                localStorage.setItem('user_admin', JSON.stringify({
                    username: 'admin',
                    password: 'musica2026',
                    level: 'admin',
                    name: 'Administrador'
                }));
            }
        },
        
        create: (userData) => {
            localStorage.setItem(`user_${userData.username}`, JSON.stringify(userData));
        },
        
        getAll: () => {
            const users = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('user_')) {
                    users.push(JSON.parse(localStorage.getItem(key)));
                }
            }
            return users;
        },

        get: (username) => {
            const data = localStorage.getItem(`user_${username}`);
            return data ? JSON.parse(data) : null;
        },
        
        delete: (username) => {
            if (username === 'admin') {
                alert('Não é possível remover o usuário admin principal');
                return;
            }
            localStorage.removeItem(`user_${username}`);
        }
    },

    accessLevels: {
        admin: {
            name: 'Administrador',
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canBorrow: true,
            canMaintenance: true,
            canSync: true,
            canManageUsers: true
        },
        editor: {
            name: 'Editor',
            canCreate: true,
            canEdit: true,
            canDelete: false,
            canBorrow: true,
            canMaintenance: true,
            canSync: false,
            canManageUsers: false
        },
        viewer: {
            name: 'Visualizador',
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canBorrow: false,
            canMaintenance: false,
            canSync: false,
            canManageUsers: false
        }
    }
};

document.addEventListener('DOMContentLoaded', app.init);
