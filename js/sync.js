const sync = {
    GAS_URL: 'https://script.google.com/macros/s/SEU_ID_DE_IMPLANTACAO_AQUI/exec', 
    
    runSync: async () => {
        const btn = document.querySelector('button[onclick="sync.runSync()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Sincronizando...';
        btn.disabled = true;

        try {
            if (!sync.GAS_URL || sync.GAS_URL.includes('SEU_ID')) {
                throw new Error('URL do script não configurada');
            }

            // Envia apenas os itens da instituição atual
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
                throw new Error(`Erro HTTP ${response.status}`);
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
                    alert(`✅ Sucesso! ${result.updatedItems.length} fotos enviadas para a nuvem.`);
                } else {
                    alert('✅ Sincronização concluída!');
                }
            } else {
                throw new Error(result.message || 'Erro desconhecido');
            }
        } catch (error) {
            console.error('Erro detalhado:', error);
            alert('❌ ERRO: ' + error.message);
            document.getElementById('sync-status').textContent = 'Erro: ' + error.message;
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};
