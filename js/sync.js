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

            if (!response.ok) {
                throw new Error('Erro HTTP ' + response.status);
            }

            const textResponse = await response.text();
            let result;
            try {
                result = JSON.parse(textResponse);
            } catch (e) {
                throw new Error('Resposta inválida: ' + textResponse.substring(0, 200));
            }

            if (result.status === 'success') {
                document.getElementById('sync-status').textContent = 'Sincronizado em: ' + new Date().toLocaleString();
                
                if (result.updatedItems && result.updatedItems.length > 0) {
                    for (const updatedItem of result.updatedItems) {
                        await db.save(updatedItem);
                    }
                    alert('Sucesso! ' + result.updatedItems.length + ' fotos enviadas para a nuvem.');
                } else {
                    alert('Sincronização concluída!');
                }
            } else {
                throw new Error(result.message || 'Erro desconhecido');
            }
        } catch (error) {
            console.error('Erro detalhado:', error);            alert('ERRO: ' + error.message);
            document.getElementById('sync-status').textContent = 'Erro: ' + error.message;
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    },

    restoreFromCloud: async () => {
        const localItems = await db.getAll(app.currentInstituicao?.id);
        const localCount = localItems.length;
        
        // Primeiro, pergunta o modo de restauração
        const modeMsg = `Você tem ${localCount} itens no celular.\n\n` +
                       `Como deseja restaurar?\n\n` +
                       `OK = MESCLAR (baixa da nuvem e mantém itens locais que não estão na nuvem)\n` +
                       `Cancelar = SUBSTITUIR (apaga tudo local e baixa apenas o que está na nuvem)`;
        
        const mode = confirm(modeMsg) ? 'merge' : 'replace';
        
        if (mode === 'replace') {
            if (!confirm(`⚠️ ATENÇÃO!\n\nTodos os ${localCount} itens locais serão APAGADOS e substituídos pelos dados da planilha.\n\nDeseja continuar?`)) {
                return;
            }
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

            if (!response.ok) {
                throw new Error('Erro HTTP ' + response.status);
            }

            const textResponse = await response.text();
            let result;
            try {
                result = JSON.parse(textResponse);
            } catch (e) {
                throw new Error('Resposta inválida do servidor');
            }

            if (result.status === 'success' && result.data) {                const instNome = app.currentInstituicao?.nome;
                
                // Filtra itens da instituição atual
                const itemsToRestore = result.data.filter(row => 
                    !instNome || row.Instituicao === instNome
                );

                if (itemsToRestore.length === 0) {
                    alert('A planilha está vazia ou não tem itens desta unidade.\n\nNenhum dado foi restaurado.');
                    return;
                }

                if (mode === 'replace') {
                    // Modo substituir: limpa tudo e baixa
                    await db.clear();
                }
                // Modo mesclar: não limpa, apenas adiciona/atualiza

                let count = 0;
                for (const row of itemsToRestore) {
                    const item = {
                        codigo: row.Codigo,
                        instituicao: row.Instituicao || 'default',
                        instituicaoNome: row.Instituicao,
                        instituicaoCidade: row.Cidade,
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
                
                const modeText = mode === 'merge' ? 'mesclados' : 'restaurados';
                alert(`✅ Concluído!\n\n${count} itens ${modeText} da nuvem.`);
                app.navigate('dashboard');
                app.updateDashboard();
            } else {
                throw new Error(result.message || 'Nenhum dado encontrado na nuvem');
            }
        } catch (error) {
            console.error('Erro na restauração:', error);
            alert('ERRO NA RESTAURAÇÃO: ' + error.message);
        } finally {
            btn.textContent = originalText;            btn.disabled = false;
        }
    }
};