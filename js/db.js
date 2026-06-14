const db = {
    init: async () => {
        await localforage.config({ name: 'InventarioMusicalDB', storeName: 'items' });
    },
    getAll: async (instituicaoId = null) => {
        const keys = await localforage.keys();
        const items = [];
        for (const key of keys) {
            const item = await localforage.getItem(key);
            if (!item || !item.codigo) continue;
            
            // Se não tem instituicao (item antigo), inclui em todas as consultas
            if (!item.instituicao) {
                items.push(item);
            } else if (!instituicaoId || item.instituicao === instituicaoId) {
                items.push(item);
            }
        }
        return items.sort((a, b) => (b.dataEntrada || '').localeCompare(a.dataEntrada || ''));
    },
    save: async (item) => {
        await localforage.setItem(item.codigo, item);
    },
    get: async (codigo) => {
        return await localforage.getItem(codigo);
    },
    clear: async () => {
        await localforage.clear();
    }
};
