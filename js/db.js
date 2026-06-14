const db = {
    init: async () => {
        await localforage.config({ name: 'InventarioMusicalDB', storeName: 'items' });
    },
    getAll: async () => {
        const keys = await localforage.keys();
        const items = [];
        for (const key of keys) {
            items.push(await localforage.getItem(key));
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