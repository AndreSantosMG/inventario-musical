const sync = {
    // MANTENHA A URL QUE VOCÊ JÁ CONFIGUROU ANTES
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxX40Cj4xveniBJ-yPYIw8QiTxbWlKMTV1vX2hA_Wn08azTm3KmgvsDd3A0_YFDBCHjQg/exec', 
    
    runSync: async () => {
        const btn = document.querySelector('button[onclick="sync.runSync()"]');
        const originalText = btn.textContent;
        btn.textContent = 'Sincronizando (pode demorar)...';
        btn.disabled = true;

        try {
            const localItems = await db.getAll();
            const response = await fetch(sync.GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'sync', items: localItems })
            });
            const result = await response.json();

            if (result.status === 'success') {
                document.getElementById('sync-status').textContent = 'Sincronizado em: ' + new Date().toLocaleString();
                
                // Se o servidor devolveu fotos convertidas em link, atualiza o banco local
                if (result.updatedItems && result.updatedItems.length > 0) {
                    for (const updatedItem of result.updatedItems) {
                        await db.save(updatedItem);
                    }
                    alert(`Sincronização concluída! ${result.updatedItems.length} fotos enviadas para a nuvem.`);
                } else {
                    alert('Sincronização concluída com sucesso!');
                }
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error(error);
            alert('Erro na sincronização. Verifique a conexão.');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};
