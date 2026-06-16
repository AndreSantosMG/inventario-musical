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
        // Garante que todo item salvo localmente tem um timestamp de modificação
        if (!item.updatedAt) item.updatedAt = new Date().toISOString();
        await localforage.setItem(item.codigo, item);
    },
    get: async (codigo) => {
        return await localforage.getItem(codigo);
    },
    clear: async () => {
        await localforage.clear();
    },

    // Merge inteligente: compara item da nuvem com item local pelo updatedAt.
    // Regra: o mais recente vence. Itens só locais são preservados.
    // Retorna { merged, kept, updated, inserted } para log.
    mergeFromCloud: async (cloudItems, instituicaoId) => {
        const stats = { kept: 0, updated: 0, inserted: 0 };

        for (const row of cloudItems) {
            const codigo = row.Codigo;
            if (!codigo) continue;

            const cloudItem = {
                codigo,
                instituicao: instituicaoId || 'default',
                instituicaoNome: row.Instituicao,
                instituicaoCidade: row.Cidade,
                categoria: row.Categoria,
                descricao: row.Descricao,
                status: row.Status,
                responsavel: row.Responsavel,
                dataEntrada: row.DataEntrada,
                foto: row.FotoURL,
                observacao: row.Observacao,
                historico: row.Historico || [],
                updatedAt: row.UpdatedAt || row.DataEntrada || '1970-01-01T00:00:00.000Z',
            };

            const localItem = await localforage.getItem(codigo);

            if (!localItem) {
                // Item existe só na nuvem → insere localmente
                await localforage.setItem(codigo, cloudItem);
                stats.inserted++;
            } else {
                const localTs = localItem.updatedAt || '1970-01-01T00:00:00.000Z';
                const cloudTs = cloudItem.updatedAt;

                if (cloudTs > localTs) {
                    // Nuvem é mais recente → atualiza, preservando foto local se a nuvem não tiver
                    if (!cloudItem.foto && localItem.foto) cloudItem.foto = localItem.foto;
                    await localforage.setItem(codigo, cloudItem);
                    stats.updated++;
                } else {
                    // Local é mais recente ou igual → mantém o local
                    stats.kept++;
                }
            }
        }
        // Itens só locais não são tocados (preservados automaticamente)
        return stats;
    }
};