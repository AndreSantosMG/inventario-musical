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
        }    },

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
    }
};