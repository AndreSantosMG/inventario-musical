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
        const instNome = app.currentInstituicao?.nome;
        
        // Primeiro, pergunta o modo de restauração
        const modeMsg = `Você tem ${localCount} itens no celular.\n\n` +
                       `Como deseja restaurar?\n\n` +
                       `OK = MESCLAR (baixa da nuvem e mantém itens locais)\n` +
                       `Cancelar = SUBSTITUIR (apaga tudo local e baixa apenas o que está na nuvem)`;
        
        const mode = confirm(modeMsg) ? 'merge' : 'replace';
        
        if (mode === 'replace') {
            if (!confirm(`ATENÇÃO!\n\nTodos os ${localCount} itens locais serão APAGADOS e substituídos.\n\nDeseja continuar?`)) {
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
            if (result.status === 'success' && result.data) {
                const totalNaNuvem = result.data.length;
                
                // DIAGNÓSTICO: Mostra o que tem na nuvem
                let diagnostico = `📊 DIAGNÓSTICO DA NUVEM:\n\n`;
                diagnostico += `Total de itens na planilha: ${totalNaNuvem}\n`;
                diagnostico += `Sua instituição: "${instNome}"\n\n`;
                
                if (totalNaNuvem === 0) {
                    alert('A planilha está VAZIA.\n\nNão há nada para restaurar.');
                    return;
                }
                
                // Mostra as primeiras 3 linhas para diagnóstico
                diagnostico += `Primeiros itens na planilha:\n`;
                result.data.slice(0, 3).forEach((row, idx) => {
                    diagnostico += `${idx + 1}. ${row.Codigo} - ${row.Descricao} [Inst: "${row.Instituicao}"]\n`;
                });
                
                if (totalNaNuvem > 3) {
                    diagnostico += `... e mais ${totalNaNuvem - 3} itens\n`;
                }
                
                // Filtra itens da instituição atual (filtro mais permissivo)
                let itemsToRestore;
                
                if (!instNome || instNome === 'Escola de Música') {
                    // Se for a instituição padrão, restaura TUDO
                    itemsToRestore = result.data;
                    diagnostico += `\n✅ Usando instituição padrão - restaurando TODOS os itens`;
                } else {
                    // Filtra por nome exato OU contém o nome
                    itemsToRestore = result.data.filter(row => {
                        const rowInst = row.Instituicao || '';
                        return rowInst === instNome || 
                               rowInst.includes(instNome) || 
                               instNome.includes(rowInst);
                    });
                    diagnostico += `\n\nFiltrados por instituição: ${itemsToRestore.length} itens`;
                }
                
                // Se não encontrou nada com filtro, pergunta se quer restaurar tudo
                if (itemsToRestore.length === 0 && totalNaNuvem > 0) {
                    const forcarMsg = diagnostico + `\n\n⚠️ Nenhum item encontrado para sua instituição "${instNome}".\n\nDeseja restaurar TODOS os ${totalNaNuvem} itens da planilha mesmo assim?`;
                    if (confirm(forcarMsg)) {
                        itemsToRestore = result.data;
                    } else {
                        alert('Restauração cancelada.');
                        return;
                    }                } else {
                    alert(diagnostico);
                }

                if (mode === 'replace') {
                    await db.clear();
                }

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
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};