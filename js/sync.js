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

    // VERSÃO SIMPLIFICADA: Sempre substitui, sem mesclar
    restoreFromCloud: async () => {
        const localItems = await db.getAll(app.currentInstituicao?.id);
        const localCount = localItems.length;
        
        if (!confirm(`Você tem ${localCount} itens no celular.\n\nA restauração vai SUBSTITUIR tudo pelos dados da planilha.\n\nDeseja continuar?`)) {
            return;
        }

        const btn = document.querySelector('button[onclick="sync.restoreFromCloud()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Restaurando...';
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
            catch (e) { throw new Error('Resposta inválida'); }

            if (result.status === 'success' && result.data) {
                const totalNaNuvem = result.data.length;
                
                if (totalNaNuvem === 0) {
                    alert('A planilha está VAZIA.\n\nNenhum dado para restaurar.');
                    return;
                }

                // Limpa banco local
                await db.clear();

                // Restaura TODOS os itens da planilha
                let count = 0;
                const instId = app.currentInstituicao?.id;
                const instNome = app.currentInstituicao?.nome;
                
                for (const row of result.data) {
                    const item = {
                        codigo: row.Codigo,
                        instituicao: instId || 'default',
                        instituicaoNome: row.Instituicao || instNome,                        instituicaoCidade: row.Cidade || app.currentInstituicao?.cidade,
                        categoria: row.Categoria,
                        descricao: row.Descricao,
                        status: row.Status,
                        responsavel: row.Responsavel,
                        dataEntrada: row.DataEntrada,
                        foto: row.FotoURL,
                        observacao: row.Observacao,
                        historico: row.Historico || []
                    };
                    await db.save(item);
                    count++;
                }
                
                alert(`✅ Restauração concluída!\n\n${count} itens baixados da nuvem.`);
                
                // Recarrega a página para garantir que tudo seja exibido
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else {
                throw new Error(result.message || 'Nenhum dado encontrado');
            }
        } catch (error) {
            console.error('Erro na restauração:', error);
            alert('ERRO NA RESTAURAÇÃO: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};