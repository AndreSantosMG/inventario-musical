const sync = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxX40Cj4xveniBJ-yPYIw8QiTxbWlKMTV1vX2hA_Wn08azTm3KmgvsDd3A0_YFDBCHjQg/exec',
    
    runSync: async () => {
        const btn = document.querySelector('button[onclick="sync.runSync()"]');
        const orig = btn.textContent; btn.textContent = 'Sincronizando...'; btn.disabled = true;
        try {
            const items = await db.getAll(app.currentInstituicao?.id);
            const res = await fetch(sync.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'sync', items: items, instituicao: app.currentInstituicao }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const r = await res.json();
            if (r.status === 'success') {
                document.getElementById('sync-status').textContent = 'Sincronizado em: ' + new Date().toLocaleString();
                if (r.updatedItems?.length) { for (const i of r.updatedItems) await db.save(i); alert('Sucesso! ' + r.updatedItems.length + ' fotos enviadas.'); }
                else alert('Sincronização concluída!');
            } else throw new Error(r.message);
        } catch (e) { alert('ERRO: ' + e.message); }
        finally { btn.textContent = orig; btn.disabled = false; }
    },

    syncUsers: async (users) => {
        try {
            const res = await fetch(sync.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'syncUsers', users: users }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
            return await res.json();
        } catch (e) { console.error(e); return { status: 'error', message: e.message }; }
    },

    fetchUsers: async () => {
        try {
            const res = await fetch(sync.GAS_URL + '?action=getUsers');
            const r = await res.json();
            if (r.status === 'success') { localStorage.setItem('cloudUsersCache', JSON.stringify(r.users)); localStorage.setItem('cloudUsersLastSync', new Date().toISOString()); return r.users; }
            return [];
        } catch (e) { console.error(e); const c = localStorage.getItem('cloudUsersCache'); return c ? JSON.parse(c) : []; }
    },

    restoreFromCloud: async () => {
        const loc = await db.getAll(app.currentInstituicao?.id);
        if (!confirm(`Você tem ${loc.length} itens.\n\nRestaurar vai SUBSTITUIR tudo pela planilha.\n\nContinuar?`)) return;
        const btn = document.querySelector('button[onclick="sync.restoreFromCloud()"]');
        const orig = btn.textContent; btn.textContent = 'Restaurando...'; btn.disabled = true;
        try {
            const res = await fetch(sync.GAS_URL, { method: 'GET', headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const r = await res.json();
            if (r.status === 'success' && r.data) {
                if (!r.data.length) { alert('Planilha vazia.'); return; }
                await db.clear();
                const iId = app.currentInstituicao?.id; const iN = app.currentInstituicao?.nome; let c = 0;
                for (const row of r.data) {
                    await db.save({ codigo: row.Codigo, instituicao: iId || 'default', instituicaoNome: row.Instituicao || iN, instituicaoCidade: row.Cidade || app.currentInstituicao?.cidade, categoria: row.Categoria, descricao: row.Descricao, status: row.Status, responsavel: row.Responsavel, dataEntrada: row.DataEntrada, foto: row.FotoURL, observacao: row.Observacao, historico: row.Historico || [], patrimonio: row.Patrimonio || '' });
                    c++;
                }
                alert(`✅ ${c} itens restaurados.`); setTimeout(() => window.location.reload(), 500);
            } else throw new Error(r.message);
        } catch (e) { alert('ERRO: ' + e.message); }
        finally { btn.textContent = orig; btn.disabled = false; }
    }
};