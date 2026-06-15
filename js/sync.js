const sync = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxX40Cj4xveniBJ-yPYIw8QiTxbWlKMTV1vX2hA_Wn08azTm3KmgvsDd3A0_YFDBCHjQg/exec',
    
    runSync: async () => {
        const btn = document.querySelector('button[onclick="sync.runSync()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Sincronizando...';
        btn.disabled = true;

        try {
            const localItems = await db.getAll(app.currentInstituicao?.id);
            const response = await fetch(sync.GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'sync', items: localItems, instituicao: app.currentInstituicao }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
            });
            if (!response.ok) throw new Error('Erro HTTP ' + response.status);
            const result = await response.json();
            
            if (result.status === 'success') {
                document.getElementById('sync-status').textContent = 'Sincronizado em: ' + new Date().toLocaleString();
                if (result.updatedItems?.length) {
                    for (const item of result.updatedItems) await db.save(item);
                    alert('Sucesso! ' + result.updatedItems.length + ' fotos enviadas.');
                } else { alert('Sincronização concluída!'); }
            } else throw new Error(result.message);
        } catch (error) {
            alert('ERRO: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    },

    // NOVO: Sincronizar usuários com a nuvem
    syncUsers: async (usersToSync = []) => {
        try {
            const response = await fetch(sync.GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'syncUsers', users: usersToSync }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao sincronizar usuários:', error);
            return { status: 'error', message: error.message };
        }
    },

    // NOVO: Baixar usuários da nuvem
    fetchUsers: async () => {
        try {
            const response = await fetch(sync.GAS_URL + '?action=getUsers');
            const result = await response.json();
            if (result.status === 'success') {
                // Salva cache local para login offline
                localStorage.setItem('cloudUsersCache', JSON.stringify(result.users));
                localStorage.setItem('cloudUsersLastSync', new Date().toISOString());
                return result.users;
            }
            return [];
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
            // Retorna cache se existir
            const cached = localStorage.getItem('cloudUsersCache');
            return cached ? JSON.parse(cached) : [];
        }
    },

    restoreFromCloud: async () => {
        const localItems = await db.getAll(app.currentInstituicao?.id);
        const localCount = localItems.length;
        if (!confirm(`Você tem ${localCount} itens no celular.\n\nA restauração vai SUBSTITUIR tudo pelos dados da planilha.\n\nDeseja continuar?`)) return;

        const btn = document.querySelector('button[onclick="sync.restoreFromCloud()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Restaurando...';
        btn.disabled = true;

        try {
            const response = await fetch(sync.GAS_URL, { method: 'GET', headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
            if (!response.ok) throw new Error('Erro HTTP ' + response.status);
            const result = await response.json();

            if (result.status === 'success' && result.data) {
                if (result.data.length === 0) { alert('Planilha vazia.'); return; }
                await db.clear();
                const instId = app.currentInstituicao?.id;
                const instNome = app.currentInstituicao?.nome;
                let count = 0;
                for (const row of result.data) {
                    await db.save({
                        codigo: row.Codigo, instituicao: instId || 'default', instituicaoNome: row.Instituicao || instNome,
                        instituicaoCidade: row.Cidade || app.currentInstituicao?.cidade, categoria: row.Categoria,
                        descricao: row.Descricao, status: row.Status, responsavel: row.Responsavel,
                        dataEntrada: row.DataEntrada, foto: row.FotoURL, observacao: row.Observacao,
                        historico: row.Historico || [], patrimonio: row.Patrimonio || ''
                    });
                    count++;
                }
                alert(`✅ ${count} itens restaurados.`);
                setTimeout(() => window.location.reload(), 500);
            } else throw new Error(result.message);
        } catch (error) {
            alert('ERRO: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};
