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

        if (!app.isLoggedIn) {
            app.showLoginScreen();
        } else {
            app.navigate('dashboard');
            app.updateDashboard();
            app.updateInstituicaoDisplay();
        }
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    },

    showLoginScreen: () => {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const loginView = document.getElementById('view-login-required');
        if (loginView) loginView.classList.remove('hidden');
        const display = document.getElementById('current-instituicao-display');
        if (display) display.classList.add('hidden');
    },
    // CORREÇÃO: Não apaga usuários e instituições
    forceUpdate: () => {
        if (confirm('Isso vai limpar o cache e recarregar.\n\nSeus usuários e unidades serão PRESERVADOS.\nApenas a sessão atual será encerrada.\n\nOK?')) {
            // Salva usuários e instituições antes de limpar
            const usersData = {};
            const instData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('user_')) {
                    usersData[key] = localStorage.getItem(key);
                } else if (key && key.startsWith('inst_')) {
                    instData[key] = localStorage.getItem(key);
                }
            }
            
            // Limpa tudo
            localStorage.clear();
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(n => caches.delete(n)));
            }
            
            // Restaura usuários e instituições
            Object.keys(usersData).forEach(key => {
                localStorage.setItem(key, usersData[key]);
            });
            Object.keys(instData).forEach(key => {
                localStorage.setItem(key, instData[key]);
            });
            
            window.location.reload(true);
        }
    },

    navigate: (viewId) => {
        if (!app.isLoggedIn && viewId !== 'login-required') {
            app.showLoginScreen();
            return;
        }

        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${viewId}`);
        if (target) target.classList.remove('hidden');
        
        if (viewId === 'dashboard') {
            app.renderList();
            app.updateInstituicaoDisplay();
        }
        if (viewId === 'add') {
            document.getElementById('item-codigo').value = app.generateCode();
        }        if (viewId === 'scanner') app.startScanner();
        if (viewId === 'reports') app.renderReports();
    },

    generateCode: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(10000 + Math.random() * 90000);
        return `FDSF-${year}-${random}`;
    },

    updateInstituicaoDisplay: () => {
        const display = document.getElementById('current-instituicao-display');
        if (!display) return;
        if (app.currentInstituicao) {
            display.textContent = `📍 ${app.currentInstituicao.nome} - ${app.currentInstituicao.cidade || ''}`;
            display.classList.remove('hidden');
        } else {
            display.classList.add('hidden');
        }
    },

    toggleLogin: () => {
        if (app.isLoggedIn) {
            if (confirm('Deseja sair do sistema?')) {
                app.isLoggedIn = false;
                app.currentUser = null;
                app.currentInstituicao = null;
                localStorage.removeItem('sessionData');
                const btn = document.getElementById('btn-login-toggle');
                if (btn) btn.textContent = '';
                const adminActions = document.getElementById('admin-actions');
                if (adminActions) adminActions.classList.add('hidden');
                app.applyPermissions({ canCreate: false, canSync: false, canManageUsers: false });
                app.showLoginScreen();
            }
        } else {
            app.openLoginModal();
        }
    },

    openLoginModal: () => {
        try {
            app.users.init();
            app.instituicoes.init();

            const instituicoes = app.instituicoes.getAll();
            const selectInst = document.getElementById('login-instituicao');
            if (selectInst) {
                selectInst.innerHTML = '<option value="">-- Selecione sua unidade --</option>';
                instituicoes.forEach(inst => {                    const option = document.createElement('option');
                    option.value = inst.id;
                    option.textContent = `${inst.nome} - ${inst.cidade || ''}`;
                    selectInst.appendChild(option);
                });
            }

            const usuarios = app.users.getAll();
            const selectUser = document.getElementById('login-user-select');
            if (selectUser) {
                selectUser.innerHTML = '<option value="">-- Selecione seu usuário --</option>';
                if (usuarios.length === 0) {
                    app.users.init();
                    const usuariosAtualizados = app.users.getAll();
                    usuariosAtualizados.forEach(user => {
                        const option = document.createElement('option');
                        option.value = user.username;
                        option.textContent = `${user.name} (${app.accessLevels[user.level].name})`;
                        selectUser.appendChild(option);
                    });
                } else {
                    usuarios.forEach(user => {
                        const option = document.createElement('option');
                        option.value = user.username;
                        option.textContent = `${user.name} (${app.accessLevels[user.level].name})`;
                        selectUser.appendChild(option);
                    });
                }
            }

            const passField = document.getElementById('login-pass');
            if (passField) passField.value = '';
            
            const modal = document.getElementById('login-modal');
            if (modal) modal.classList.remove('hidden');
        } catch (error) {
            console.error('Erro ao abrir modal de login:', error);
            alert('Erro ao abrir tela de login. Tente recarregar a página.');
        }
    },

    doLogin: () => {
        const username = document.getElementById('login-user-select').value;
        const p = document.getElementById('login-pass').value;
        const instId = document.getElementById('login-instituicao').value;
        
        if (!instId) { alert('Selecione sua unidade/instituição'); return; }
        if (!username) { alert('Selecione seu usuário'); return; }
        
        const user = app.users.get(username);        if (!user || user.password !== p) { alert('Senha incorreta!'); return; }

        const instituicao = app.instituicoes.get(instId);
        if (!instituicao) { alert('Unidade não encontrada'); return; }
        
        app.isLoggedIn = true;
        app.currentUser = user;
        app.currentInstituicao = instituicao;
        
        localStorage.setItem('sessionData', JSON.stringify({ username: username, instituicao: instituicao }));
        
        const btn = document.getElementById('btn-login-toggle');
        if (btn) btn.textContent = ` ${user.name}`;
        
        document.getElementById('login-modal').classList.add('hidden');
        
        app.applyPermissions(app.accessLevels[user.level]);
        app.navigate('dashboard');
        app.updateDashboard();
        app.updateInstituicaoDisplay();
        
        const hora = new Date().getHours();
        let saudacao = 'Olá';
        if (hora < 12) saudacao = 'Bom dia';
        else if (hora < 18) saudacao = 'Boa tarde';
        else saudacao = 'Boa noite';
        
        setTimeout(() => {
            alert(`${saudacao}, ${user.name}!\n\nBem-vindo(a) ao sistema de Inventário.\nUnidade: ${instituicao.nome}`);
        }, 300);
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
            reportsBtn.style.display = perms.canManageUsers ? 'block' : 'none';
        }
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
        } else {
            if (!confirm('Você não adicionou uma foto. Deseja continuar mesmo assim?')) return;
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
        if (!container) return;
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
                        <p class="font-bold text-sm">${item.codigo} ${temObs ? '' : ''}</p>
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
        if (!item) { alert('Item não encontrado'); app.navigate('dashboard'); return; }
        
        app.currentItem = item;
        const container = document.getElementById('detail-content');
        if (!container) return;
        
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
            <div class="bg-gray-100 p-3 rounded mt-2">                <p><strong>Status:</strong> ${item.status}</p>
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
            const qrContainer = document.getElementById("detail-qrcode");
            if (qrContainer) {
                qrContainer.innerHTML = '';
                new QRCode(qrContainer, { text: item.codigo, width: 150, height: 150 });
            }
        }, 100);

        const btnEditObs = document.getElementById('btn-edit-obs');
        if (app.isLoggedIn && app.currentUser && app.currentUser.level === 'admin') {
            btnEditObs.classList.remove('hidden');
        } else {
            btnEditObs.classList.add('hidden');
        }

        const adminActions = document.getElementById('admin-actions');
        if (adminActions) {
            if (app.isLoggedIn) adminActions.classList.remove('hidden');
            else adminActions.classList.add('hidden');
        }
        app.navigate('detail');
    },

    editObservation: async () => {
        if (!app.isLoggedIn || !app.currentUser || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem editar observações.'); return;
        }
        const currentObs = app.currentItem.observacao || '';        const newObs = prompt('Editar observação (deixe vazio para apagar):', currentObs);
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

    editItem: async () => {
        if (!app.isLoggedIn || !app.currentUser) { alert('Faça login para editar'); return; }
        const item = app.currentItem;
        document.getElementById('edit-codigo').value = item.codigo;
        document.getElementById('edit-categoria').value = item.categoria;
        document.getElementById('edit-descricao').value = item.descricao;
        document.getElementById('edit-obs').value = item.observacao || '';
        const preview = document.getElementById('edit-foto-preview');        if (item.foto) { preview.src = item.foto; preview.style.display = 'block'; }
        else { preview.style.display = 'none'; }
        document.getElementById('edit-item-modal').classList.remove('hidden');
    },

    saveEditItem: async () => {
        if (!app.isLoggedIn || !app.currentUser) return;
        const fileInput = document.getElementById('edit-foto');
        let fotoBase64 = app.currentItem.foto;
        if (fileInput.files[0]) {
            fotoBase64 = await utils.compressImage(fileInput.files[0]);
            app.currentItem.historico.push(`Foto atualizada em ${new Date().toLocaleString()} por ${app.currentUser.name}`);
        }
        app.currentItem.categoria = document.getElementById('edit-categoria').value;
        app.currentItem.descricao = document.getElementById('edit-descricao').value;
        app.currentItem.observacao = document.getElementById('edit-obs').value.trim();
        app.currentItem.foto = fotoBase64;
        app.currentItem.historico.push(`Editado em ${new Date().toLocaleString()} por ${app.currentUser.name}`);
        await db.save(app.currentItem);
        alert('Item atualizado!');
        document.getElementById('edit-item-modal').classList.add('hidden');
        app.renderDetail(app.currentItem.codigo);
        app.renderList();
    },

    cancelEditItem: () => { document.getElementById('edit-item-modal').classList.add('hidden'); },

    deleteItem: async () => {
        if (!app.isLoggedIn || !app.currentUser || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem excluir itens'); return;
        }
        const item = app.currentItem;
        if (!confirm(`ATENÇÃO! Excluir permanentemente o item ${item.codigo}?\n\n${item.descricao}\n\nEsta ação NÃO pode ser desfeita!`)) return;
        if (!confirm('TEM CERTEZA ABSOLUTA? O item será removido do banco local.')) return;
        await localforage.removeItem(item.codigo);
        alert('Item excluído com sucesso.');
        app.navigate('dashboard');
        app.updateDashboard();
    },

    updateDashboard: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        const dashTotal = document.getElementById('dash-total');
        const dashEmp = document.getElementById('dash-emprestados');
        const dashMan = document.getElementById('dash-manutencao');
        const dashAti = document.getElementById('dash-ativos');
        if (dashTotal) dashTotal.textContent = items.length;
        if (dashEmp) dashEmp.textContent = items.filter(i => i.status === 'Emprestado').length;
        if (dashMan) dashMan.textContent = items.filter(i => i.status === 'Manutenção').length;
        if (dashAti) dashAti.textContent = items.filter(i => i.status === 'Ativo').length;    },

    printLabels: async () => {
        const items = await db.getAll(app.currentInstituicao?.id);
        if (items.length === 0) { alert('Nenhum item cadastrado nesta unidade.'); return; }
        const printWindow = window.open('', '_blank');
        let labelsHtml = '';
        items.forEach(item => {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(item.codigo)}`;
            labelsHtml += `<div class="label"><img src="${qrUrl}" alt="QR Code" class="qr-img"><div class="label-text"><div class="label-code">${item.codigo}</div><div class="label-desc">${item.descricao}</div><div class="label-inst">${item.instituicaoNome || ''}</div></div></div>`;
        });
        printWindow.document.write(`<html><head><title>Etiquetas - ${app.currentInstituicao?.nome || ''}</title><style>body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }.container { display: flex; flex-wrap: wrap; gap: 15px; }.label { border: 1px dashed #ccc; padding: 10px; width: 180px; text-align: center; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; }.qr-img { width: 120px; height: 120px; margin-bottom: 8px; }.label-code { font-weight: bold; font-size: 12px; margin-bottom: 4px; }.label-desc { font-size: 10px; color: #555; word-wrap: break-word; }.label-inst { font-size: 9px; color: #888; margin-top: 4px; font-style: italic; }@media print { body { padding: 0; } .label { border: 1px solid #000; } .no-print { display: none; } }</style></head><body><div class="no-print" style="text-align:center; margin-bottom:20px;"><h2>Etiquetas - ${app.currentInstituicao?.nome || ''} (${items.length} itens)</h2><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer;">🖨️ Imprimir Agora</button></div><div class="container">${labelsHtml}</div></body></html>`);
        printWindow.document.close();
    },

    startScanner: () => {
        app.scanner = new Html5Qrcode("reader");
        app.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                app.stopScanner();
                if (!app.isLoggedIn) { alert(`Código: ${decodedText}\n(Faça login para ver detalhes)`); app.navigate('dashboard'); }
                else {
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
        const items = await db.getAll();
        if (items.length > 0) {
            const confirmMsg = `ATENÇÃO! Você tem ${items.length} itens cadastrados localmente.\n\nAntes de limpar, deseja fazer backup na nuvem?\n\nOK = Fazer backup e depois limpar\nCancelar = Abortar operação`;
            if (confirm(confirmMsg)) {
                try { await sync.runSync(); alert('Backup concluído! Agora os dados serão limpos.'); }
                catch (error) { if (!confirm('Erro no backup. Deseja limpar mesmo assim? (Os dados serão PERDIDOS)')) return; }
            } else { return; }
        }
        if (confirm('TEM CERTEZA ABSOLUTA? Isso apagará TUDO do celular.')) {
            await db.clear();
            // Preserva usuários e instituições mesmo no clearData
            const usersData = {};
            const instData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);                if (key && key.startsWith('user_')) usersData[key] = localStorage.getItem(key);
                else if (key && key.startsWith('inst_')) instData[key] = localStorage.getItem(key);
            }
            localStorage.clear();
            Object.keys(usersData).forEach(key => localStorage.setItem(key, usersData[key]));
            Object.keys(instData).forEach(key => localStorage.setItem(key, instData[key]));
            window.location.reload();
        }
    },

    renderReports: () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem acessar relatórios');
            app.navigate('dashboard');
            return;
        }

        const reports = [
            { id: 'completo', icon: '', title: 'Inventário Completo', description: 'Lista todos os itens cadastrados', color: 'blue' },
            { id: 'emprestados', icon: '📤', title: 'Itens Emprestados', description: 'Itens emprestados com responsável', color: 'yellow' },
            { id: 'manutencao', icon: '🔧', title: 'Itens em Manutenção', description: 'Itens com status de manutenção', color: 'orange' },
            { id: 'baixados', icon: '🗑️', title: 'Itens Baixados', description: 'Itens retirados do inventário', color: 'red' },
            { id: 'observacoes', icon: '📝', title: 'Itens com Observações', description: 'Observações pendentes', color: 'amber' },
            { id: 'categorias', icon: '📊', title: 'Resumo por Categoria', description: 'Quantitativo por categoria', color: 'purple' },
            { id: 'historico', icon: '📜', title: 'Histórico de Movimentações', description: 'Log de todas as alterações', color: 'indigo' }
        ];

        const container = document.getElementById('reports-list');
        if (!container) return;
        container.innerHTML = '';

        reports.forEach(report => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow border-l-4 border-' + report.color + '-500';
            card.innerHTML = `
                <div class="flex items-start gap-3 mb-3">
                    <div class="text-3xl">${report.icon}</div>
                    <div class="flex-1">
                        <h3 class="font-bold text-gray-800">${report.title}</h3>
                        <p class="text-xs text-gray-600 mt-1">${report.description}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="app.generateReport('${report.id}', 'pdf')" class="flex-1 bg-red-600 text-white text-xs py-2 rounded font-bold">📄 PDF</button>
                    <button onclick="app.generateReport('${report.id}', 'xlsx')" class="flex-1 bg-green-600 text-white text-xs py-2 rounded font-bold">📊 XLSX</button>
                    <button onclick="app.generateReport('${report.id}', 'csv')" class="flex-1 bg-blue-600 text-white text-xs py-2 rounded font-bold"> CSV</button>
                </div>
            `;
            container.appendChild(card);
        });    },

    generateReport: async (reportId, format) => {
        const items = await db.getAll(app.currentInstituicao?.id);
        const instNome = app.currentInstituicao?.nome || 'Inventário';
        const dataGeracao = new Date().toLocaleString('pt-BR');
        const usuario = app.currentUser?.name || 'Sistema';

        let data = [];
        let titulo = '';

        switch (reportId) {
            case 'completo':
                titulo = 'Inventário Completo';
                data = items.map(i => ({ 'Código': i.codigo, 'Categoria': i.categoria, 'Descrição': i.descricao, 'Status': i.status, 'Responsável': i.responsavel || '-', 'Data Entrada': i.dataEntrada || '-', 'Observações': i.observacao || '-' }));
                break;
            case 'emprestados':
                titulo = 'Itens Emprestados';
                data = items.filter(i => i.status === 'Emprestado').map(i => ({ 'Código': i.codigo, 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-', 'Data Entrada': i.dataEntrada || '-', 'Última Atualização': i.historico ? i.historico[i.historico.length - 1] : '-' }));
                if (data.length === 0) { alert('Nenhum item emprestado no momento.'); return; }
                break;
            case 'manutencao':
                titulo = 'Itens em Manutenção';
                data = items.filter(i => i.status === 'Manutenção').map(i => ({ 'Código': i.codigo, 'Categoria': i.categoria, 'Descrição': i.descricao, 'Responsável': i.responsavel || '-', 'Data Entrada': i.dataEntrada || '-', 'Última Atualização': i.historico ? i.historico[i.historico.length - 1] : '-' }));
                if (data.length === 0) { alert('Nenhum item em manutenção no momento.'); return; }
                break;
            case 'baixados':
                titulo = 'Itens Baixados';
                data = items.filter(i => i.status === 'Baixado').map(i => ({ 'Código': i.codigo, 'Categoria': i.categoria, 'Descrição': i.descricao, 'Data Entrada': i.dataEntrada || '-', 'Última Atualização': i.historico ? i.historico[i.historico.length - 1] : '-' }));
                if (data.length === 0) { alert('Nenhum item baixado no momento.'); return; }
                break;
            case 'observacoes':
                titulo = 'Itens com Observações Pendentes';
                data = items.filter(i => i.observacao && i.observacao.trim() !== '').map(i => ({ 'Código': i.codigo, 'Categoria': i.categoria, 'Descrição': i.descricao, 'Status': i.status, 'Observação': i.observacao }));
                if (data.length === 0) { alert('Nenhum item com observações no momento.'); return; }
                break;
            case 'categorias':
                titulo = 'Resumo por Categoria';
                const categorias = {};
                items.forEach(i => {
                    const cat = i.categoria || 'Outro';
                    if (!categorias[cat]) categorias[cat] = { total: 0, ativos: 0, emprestados: 0, manutencao: 0, baixados: 0 };
                    categorias[cat].total++;
                    if (i.status === 'Ativo') categorias[cat].ativos++;
                    else if (i.status === 'Emprestado') categorias[cat].emprestados++;
                    else if (i.status === 'Manutenção') categorias[cat].manutencao++;
                    else if (i.status === 'Baixado') categorias[cat].baixados++;
                });
                data = Object.keys(categorias).map(cat => ({ 'Categoria': cat, 'Total': categorias[cat].total, 'Ativos': categorias[cat].ativos, 'Emprestados': categorias[cat].emprestados, 'Em Manutenção': categorias[cat].manutencao, 'Baixados': categorias[cat].baixados }));
                break;            case 'historico':
                titulo = 'Histórico de Movimentações';
                items.forEach(i => {
                    if (i.historico && Array.isArray(i.historico)) {
                        i.historico.forEach(h => {
                            data.push({ 'Código': i.codigo, 'Descrição': i.descricao, 'Categoria': i.categoria, 'Evento': h });
                        });
                    }
                });
                if (data.length === 0) { alert('Nenhum histórico registrado.'); return; }
                break;
        }

        if (data.length === 0) { alert('Nenhum dado para gerar este relatório.'); return; }

        const nomeArquivo = `${titulo.replace(/\s+/g, '_')}_${app.currentInstituicao?.nome || 'inventário'}_${new Date().toISOString().split('T')[0]}`;

        if (format === 'csv') utils.exportCSVReport(data, nomeArquivo);
        else if (format === 'xlsx') utils.exportXLSX(data, nomeArquivo, titulo, instNome, dataGeracao, usuario);
        else if (format === 'pdf') utils.exportPDFReport(data, nomeArquivo, titulo, instNome, dataGeracao, usuario);

        alert(`✅ Relatório "${titulo}" gerado com sucesso!\n\n${data.length} registros exportados em ${format.toUpperCase()}`);
    },

    openUserManagement: () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') { alert('Apenas administradores podem gerenciar usuários'); return; }
        app.users.init();
        const users = app.users.getAll();
        const container = document.getElementById('users-list');
        if (!container) return;
        container.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2 bg-gray-100 rounded';
            div.innerHTML = `
                <div class="flex-1">
                    <p class="font-bold">${user.name}</p>
                    <p class="text-xs text-gray-600">@${user.username} - ${app.accessLevels[user.level].name}</p>
                </div>
                <div class="flex gap-2">
                    ${user.username !== 'admin' ? `<button onclick="app.editUser('${user.username}')" class="text-blue-600 text-xs">Editar</button><button onclick="app.deleteUser('${user.username}')" class="text-red-600 text-xs">Excluir</button>` : '<span class="text-xs text-gray-500">Principal</span>'}
                </div>
            `;
            container.appendChild(div);
        });
        document.getElementById('user-management-modal').classList.remove('hidden');
    },

    closeUserManagement: () => { document.getElementById('user-management-modal').classList.add('hidden'); },
    createUser: () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') { alert('Apenas administradores podem criar usuários'); return; }
        const name = document.getElementById('new-user-name').value.trim();
        const username = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value;
        const level = document.getElementById('new-user-level').value;
        if (!name || !username || !password) { alert('Preencha todos os campos'); return; }
        if (username.includes(' ')) { alert('Usuário não pode ter espaços'); return; }
        if (app.users.get(username)) { alert('Este nome de usuário já existe'); return; }
        app.users.create({ name, username, password, level });
        alert(`Usuário criado!\n\nNome: ${name}\nUsuário: ${username}\nNível: ${app.accessLevels[level].name}`);
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-username').value = '';
        document.getElementById('new-user-password').value = '';
        app.openUserManagement();
    },

    editUser: (username) => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') return;
        const user = app.users.get(username);
        if (!user) return;
        const newLevel = prompt(`Alterar nível de acesso para ${user.name}?\n\nAtual: ${app.accessLevels[user.level].name}\n\nDigite:\n- admin\n- editor\n- viewer`, user.level);
        if (newLevel && ['admin', 'editor', 'viewer'].includes(newLevel)) {
            user.level = newLevel;
            app.users.create(user);
            alert(`Nível alterado para: ${app.accessLevels[newLevel].name}`);
        } else if (newLevel) { alert('Nível inválido'); }
        if (confirm('Deseja alterar a senha deste usuário?')) {
            const newPassword = prompt('Digite a nova senha:');
            if (newPassword && newPassword.trim()) {
                user.password = newPassword.trim();
                app.users.create(user);
                alert('Senha alterada com sucesso!');
            }
        }
        app.openUserManagement();
    },

    deleteUser: (username) => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') return;
        if (confirm(`Excluir usuário ${username}?\n\nEsta ação revoga o acesso permanentemente.`)) {
            app.users.delete(username);
            app.openUserManagement();
        }
    },

    openInstituicaoManagement: () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') { alert('Apenas administradores podem gerenciar unidades'); return; }
        app.instituicoes.init();
        const instituicoes = app.instituicoes.getAll();        const container = document.getElementById('instituicoes-list');
        if (!container) return;
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
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') return;
        const nome = document.getElementById('new-inst-nome').value.trim();
        const cidade = document.getElementById('new-inst-cidade').value.trim();
        if (!nome) { alert('Informe o nome da unidade'); return; }
        app.instituicoes.create({ nome, cidade });
        alert(`Unidade criada!\n\n${nome}${cidade ? ' - ' + cidade : ''}`);
        document.getElementById('new-inst-nome').value = '';
        document.getElementById('new-inst-cidade').value = '';
        app.openInstituicaoManagement();
    },

    deleteInstituicao: (id) => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') return;
        if (confirm('Excluir esta unidade? Os itens NÃO serão apagados, mas ficarão sem vínculo.')) {
            app.instituicoes.delete(id);
            app.openInstituicaoManagement();
        }
    },

    users: {
        init: () => {
            if (!localStorage.getItem('user_admin')) {
                localStorage.setItem('user_admin', JSON.stringify({ username: 'admin', password: 'musica2026', level: 'admin', name: 'Administrador' }));
            }
        },
        create: (userData) => { localStorage.setItem(`user_${userData.username}`, JSON.stringify(userData)); },
        getAll: () => {
            const users = [];
            for (let i = 0; i < localStorage.length; i++) {                const key = localStorage.key(i);
                if (key && key.startsWith('user_')) { try { users.push(JSON.parse(localStorage.getItem(key))); } catch (e) {} }
            }
            return users;
        },
        get: (username) => { const data = localStorage.getItem(`user_${username}`); return data ? JSON.parse(data) : null; },
        delete: (username) => { if (username === 'admin') { alert('Não pode excluir o admin principal'); return; } localStorage.removeItem(`user_${username}`); }
    },

    instituicoes: {
        init: () => {
            if (!localStorage.getItem('inst_default')) {
                localStorage.setItem('inst_default', JSON.stringify({ id: 'default', nome: 'Escola de Música', cidade: 'Sede' }));
            }
        },
        create: (instData) => {
            const id = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(`inst_${id}`, JSON.stringify({ id, ...instData }));
        },
        getAll: () => {
            const instituicoes = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('inst_')) { try { instituicoes.push(JSON.parse(localStorage.getItem(key))); } catch (e) {} }
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