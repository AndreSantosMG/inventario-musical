const sync = {
    GAS_URL: 'https://script.google.com/macros/s/SEU_ID_DE_IMPLANTACAO_AQUI/exec', 
    
    runSync: async () => {
        const btn = document.querySelector('button[onclick="sync.runSync()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Sincronizando...';
        btn.disabled = true;
        document.getElementById('sync-status').textContent = 'Tentando conectar...';

        try {
            // Verifica se a URL está configurada
            if (!sync.GAS_URL || sync.GAS_URL.includes('SEU_ID')) {
                throw new Error('URL do script não configurada no arquivo sync.js');
            }

            const localItems = await db.getAll();
            console.log('Enviando itens:', localItems.length);

            const response = await fetch(sync.GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'sync', items: localItems }),
                // Importante para evitar erros de CORS em alguns navegadores
                headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
            });

            // Verifica se a resposta é OK (status 200)
            if (!response.ok) {
                throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
            }

            // Tenta ler o texto primeiro para ver se é JSON válido
            const textResponse = await response.text();
            let result;
            try {
                result = JSON.parse(textResponse);
            } catch (e) {
                // Se não for JSON, mostra o que o Google retornou (geralmente HTML de erro)
                throw new Error('Resposta inválida do servidor. Retorno: ' + textResponse.substring(0, 200));
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
                throw new Error(result.message || 'Erro desconhecido no script');
            }
        } catch (error) {
            console.error('Erro detalhado:', error);
            // Mostra o erro real na tela para podermos corrigir
            alert('❌ ERRO NA SINCRONIZAÇÃO:\n\n' + error.message + '\n\nTire um print desta mensagem e envie para suporte.');
            document.getElementById('sync-status').textContent = 'Erro: ' + error.message;
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};
