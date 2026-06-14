const db = {
    init: async () => {
        await localforage.config({ name: 'InventarioMusicalDB', storeName: 'items' });
    },
    getAll: async (instituicao = null) => {
        const keys = await localforage.keys();
        const items = [];
        for (const key of keys) {
            const item = await localforage.getItem(key);
            if (instituicao) {
                if (item.instituicao === instituicao) items.push(item);
            } else {
                items.push(item);
            }
        }
        return items.sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada));
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
