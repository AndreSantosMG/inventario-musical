const sync = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxX40Cj4xveniBJ-yPYIw8QiTxbWlKMTV1vX2hA_Wn08azTm3KmgvsDd3A0_YFDBCHjQg/exec',

    // -----------------------------------------------------------------------
    // INICIALIZAÇÃO: busca usuários da nuvem silenciosamente
    // Não exibe alerts, não exige confirmação — só atualiza o localStorage
    // -----------------------------------------------------------------------
    pullUsersOnInit: async () => {
        try {
            const res = await fetch(sync.GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getUsers' }),
            });
            const json = await res.json();
            if (json.status !== 'success') return;

            const NIVEIS_VALIDOS = ['admin', 'editor', 'viewer'];

            for (const u of (json.users || [])) {
                // Ignora qualquer registro com dados inválidos
                if (!u.username || !u.senhaHash || u.senhaHash.length !== 64) continue;
                if (!NIVEIS_VALIDOS.includes(u.nivel)) continue;
                // Admin local nunca é sobrescrito
                if (u.username === 'admin' && app.users.get('admin')) continue;
                // Não sobrescreve usuário que já trocou a senha
                const local = app.users.get(u.username);
                if (local && !local.primeiroAcesso) continue;
                app.users.create({
                    username:      u.username,
                    name:          u.nome,
                    passwordHash:  u.senhaHash,
                    level:         u.nivel,
                    primeiroAcesso: u.primeiroAcesso === true,
                });
            }
        } catch (e) {
            // Falha silenciosa — app funciona offline normalmente
        }
    },

    // -----------------------------------------------------------------------
    // SYNC: envia itens locais → nuvem (upsert por código)
    // -----------------------------------------------------------------------
    runSync: async () => {
        const btn = document.querySelector('button[onclick="sync.runSync()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Sincronizando...';
        btn.disabled = true;

        try {
            const localItems = await db.getAll(app.currentInstituicao?.id);

            const response = await fetch(sync.GAS_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'sync',
                    items: localItems,
                    instituicao: app.currentInstituicao
                }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            if (!response.ok) throw new Error('Erro HTTP ' + response.status);

            const textResponse = await response.text();
            let result;
            try { result = JSON.parse(textResponse); }
            catch (e) { throw new Error('Resposta inválida'); }

            if (result.status === 'success') {
                document.getElementById('sync-status').textContent = 'Sincronizado em: ' + new Date().toLocaleString();

                if (result.updatedItems && result.updatedItems.length > 0) {
                    for (const updatedItem of result.updatedItems) {
                        await db.save(updatedItem);
                    }
                    alert('Sucesso! ' + result.updatedItems.length + ' fotos enviadas.');
                } else {
                    alert('Sincronização concluída!');
                }
            } else {
                throw new Error(result.message || 'Erro desconhecido');
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('ERRO: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    },

    // -----------------------------------------------------------------------
    // MESCLAR COM A NUVEM: merge inteligente por updatedAt
    // -----------------------------------------------------------------------
    restoreFromCloud: async () => {
        const localItems = await db.getAll(app.currentInstituicao?.id);
        const localCount = localItems.length;

        if (!confirm(
            `Você tem ${localCount} itens no celular.\n\n` +
            `A sincronização vai MESCLAR os dados locais com a planilha:\n` +
            `• Itens mais recentes na nuvem serão atualizados aqui\n` +
            `• Itens mais recentes no celular serão preservados\n` +
            `• Nenhum dado local será apagado\n\n` +
            `Deseja continuar?`
        )) return;

        const btn = document.querySelector('button[onclick="sync.restoreFromCloud()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Sincronizando...';
        btn.disabled = true;

        try {
            const response = await fetch(sync.GAS_URL, {
                method: 'GET',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            if (!response.ok) throw new Error('Erro HTTP ' + response.status);

            const textResponse = await response.text();
            let result;
            try { result = JSON.parse(textResponse); }
            catch (e) { throw new Error('Resposta inválida do servidor'); }

            if (result.status === 'success' && result.data) {
                const totalNaNuvem = result.data.length;

                if (totalNaNuvem === 0) {
                    alert('A planilha está VAZIA.\n\nNenhum dado para sincronizar.');
                    return;
                }

                const instId = app.currentInstituicao?.id;
                const stats = await db.mergeFromCloud(result.data, instId);

                alert(
                    `✅ Sincronização concluída!\n\n` +
                    `• ${stats.inserted} itens novos baixados da nuvem\n` +
                    `• ${stats.updated} itens atualizados (nuvem mais recente)\n` +
                    `• ${stats.kept} itens mantidos (celular mais recente)\n\n` +
                    `Nenhum dado local foi perdido.`
                );

                setTimeout(() => { window.location.reload(); }, 500);
            } else {
                throw new Error(result.message || 'Nenhum dado encontrado');
            }
        } catch (error) {
            console.error('Erro na sincronização:', error);
            alert('ERRO: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    },

    // -----------------------------------------------------------------------
    // USUÁRIOS: publicar local → nuvem
    // -----------------------------------------------------------------------
    publishUsers: async () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem sincronizar usuários.');
            return;
        }
        const users = app.users.getAll().map(u => ({
            username:      u.username,
            nome:          u.name,
            senhaHash:     u.passwordHash,
            nivel:         u.level,
            ativo:         true,
            master:        u.username === 'admin',
            primeiroAcesso: u.primeiroAcesso || false,
        }));
        if (!confirm(`Publicar ${users.length} usuário(s) na nuvem?\n\nIsso vai criar ou atualizar os usuários na planilha.`)) return;
        try {
            const res = await fetch(sync.GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'syncUsers', users }),
            });
            const json = await res.json();
            if (json.status === 'success') alert('✅ Usuários publicados na nuvem!');
            else throw new Error(json.message);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    // -----------------------------------------------------------------------
    // USUÁRIOS: baixar nuvem → local (merge: preserva admin local, não apaga ninguém)
    // -----------------------------------------------------------------------
    pullUsers: async () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem sincronizar usuários.');
            return;
        }
        if (!confirm('Baixar usuários da nuvem?\n\nNovos usuários serão adicionados. Usuários locais não serão apagados.')) return;
        try {
            const res = await fetch(sync.GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getUsers' }),
            });
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.message);

            let inserted = 0, updated = 0;
            for (const u of (json.users || [])) {
                if (!u.username || !u.senhaHash) continue;
                // Admin local nunca é sobrescrito pela nuvem
                if (u.username === 'admin' && app.users.get('admin')) continue;
                const existing = app.users.get(u.username);
                app.users.create({
                    username:     u.username,
                    name:         u.nome,
                    passwordHash: u.senhaHash,
                    level:        u.nivel || 'viewer',
                });
                existing ? updated++ : inserted++;
            }
            alert(`✅ Sincronização concluída!\n\n• ${inserted} usuário(s) novo(s) adicionado(s)\n• ${updated} usuário(s) atualizado(s)\n\nNenhum usuário local foi removido.`);
            app.openUserManagement();
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    // -----------------------------------------------------------------------
    // INSTITUIÇÕES: publicar local → nuvem
    // -----------------------------------------------------------------------
    publishInstituicoes: async () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem sincronizar unidades.');
            return;
        }
        const instituicoes = app.instituicoes.getAll();
        if (!confirm(`Publicar ${instituicoes.length} unidade(s) na nuvem?`)) return;
        try {
            const res = await fetch(sync.GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'syncInstituicoes', instituicoes }),
            });
            const json = await res.json();
            if (json.status === 'success') alert('✅ Unidades publicadas na nuvem!');
            else throw new Error(json.message);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    // -----------------------------------------------------------------------
    // INSTITUIÇÕES: baixar nuvem → local (merge: não apaga locais)
    // -----------------------------------------------------------------------
    pullInstituicoes: async () => {
        if (!app.isLoggedIn || app.currentUser.level !== 'admin') {
            alert('Apenas administradores podem sincronizar unidades.');
            return;
        }
        if (!confirm('Baixar unidades da nuvem?\n\nNovas unidades serão adicionadas. Unidades locais não serão apagadas.')) return;
        try {
            const res = await fetch(sync.GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getInstituicoes' }),
            });
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.message);

            let inserted = 0;
            const existing = app.instituicoes.getAll().map(i => i.id);
            for (const inst of (json.instituicoes || [])) {
                if (!inst.id || existing.includes(inst.id)) continue;
                localStorage.setItem(`inst_${inst.id}`, JSON.stringify(inst));
                inserted++;
            }
            alert(`✅ Sincronização concluída!\n\n• ${inserted} unidade(s) nova(s) adicionada(s)\n\nNenhuma unidade local foi removida.`);
            app.openInstituicaoManagement();
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },
};
