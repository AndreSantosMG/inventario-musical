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
            
            // Se não especificar instituição, retorna tudo
            if (!instituicaoId) {
                items.push(item);
            }
            // Se especificar, filtra por ID ou por nome (flexível)
            else if (item.instituicao === instituicaoId || 
                     item.instituicaoNome === instituicaoId ||
                     !item.instituicao) {
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