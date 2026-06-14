const sync = {
    // SUBSTITUA PELA URL DO SEU WEB APP DO GOOGLE APPS SCRIPT
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxX40Cj4xveniBJ-yPYIw8QiTxbWlKMTV1vX2hA_Wn08azTm3KmgvsDd3A0_YFDBCHjQg/exec', 
    
    runSync: async () => {
        const btn = document.querySelector('button[onclick="sync.runSync()"]');
        btn.textContent = 'Sincronizando...';
        btn.disabled = true;

        try {
            const localItems = await db.getAll();
            // 1. Push: Enviar dados locais para a planilha
            const response = await fetch(sync.GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'sync', items: localItems })
            });
            const result = await response.json();

            if (result.status === 'success') {
                document.getElementById('sync-status').textContent = 'Sincronizado em: ' + new Date().toLocaleString();
                alert('Sincronização concluída com sucesso!');
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error(error);
            alert('Erro na sincronização. Verifique a conexão ou a URL do script.');
        } finally {
            btn.textContent = 'Sincronizar com Google Planilhas';
            btn.disabled = false;
        }
    }
};