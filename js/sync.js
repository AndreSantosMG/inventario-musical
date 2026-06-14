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
        // AVISO CLARO ANTES DE RESTAURAR
        const localItems = await db.getAll(app.currentInstituicao?.id);
        const localCount = localItems.length;
        
        const confirmMsg = `⚠️ ATENÇÃO!\n\n` +
                          `Você tem ${localCount} itens no celular.\n\n` +
                          `A restauração vai SUBSTITUIR todos os dados locais pelos dados da planilha do Google.\n\n` +
                          `Se a planilha estiver vazia ou com menos itens, você PERDERÁ dados locais.\n\n` +
                          `Deseja continuar mesmo assim?`;
        
        if (!confirm(confirmMsg)) {
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

            if (result.status === 'success' && result.data) {
                // Filtra apenas itens da instituição atual
                const instId = app.currentInstituicao?.id;
                const itemsToRestore = result.data.filter(row =>                     !instId || row.Instituicao === app.currentInstituicao?.nome
                );

                if (itemsToRestore.length === 0) {
                    alert('️ A planilha está vazia ou não tem itens desta unidade.\n\nNenhum dado foi restaurado. Seus dados locais foram mantidos.');
                    return;
                }

                // Confirmação final antes de sobrescrever
                const finalConfirm = `A planilha tem ${itemsToRestore.length} itens.\n\n` +
                                    `Seus ${localCount} itens locais serão SUBSTITUÍDOS.\n\n` +
                                    `Deseja prosseguir?`;
                
                if (!confirm(finalConfirm)) {
                    alert('Restauração cancelada. Seus dados locais foram mantidos.');
                    return;
                }

                // Limpa banco local e restaura
                await db.clear();
                
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
                
                alert(`✅ Restauração concluída!\n\n${count} itens baixados da nuvem.`);
                app.navigate('dashboard');
                app.updateDashboard();
            } else {
                throw new Error(result.message || 'Nenhum dado encontrado na nuvem');
            }
        } catch (error) {
            console.error('Erro na restauração:', error);
            alert('ERRO NA RESTAURAÇÃO: ' + error.message);        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};