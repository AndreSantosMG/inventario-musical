/**
 * CONFIG.JS — Configuração da instância
 * ======================================
 * Preencha este arquivo para cada nova instalação.
 * Este arquivo está no .gitignore e NÃO deve ser commitado.
 * Use config.example.js como referência.
 */

const APP_CONFIG = {
    // URL do Apps Script Web App (obrigatório)
    // Após publicar o Code.gs, cole a URL aqui
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxX40Cj4xveniBJ-yPYIw8QiTxbWlKMTV1vX2hA_Wn08azTm3KmgvsDd3A0_YFDBCHjQg/exec',

    // Instituição padrão (criada automaticamente na primeira abertura)
    INSTITUICAO_PADRAO: {
        id: 'default',
        nome: 'Fundação Dirce da Silva Figueiredo',
        cidade: 'Pedro Leopoldo',
    },

    // Prefixo dos códigos de inventário gerados automaticamente
    CODIGO_PREFIXO: 'FDSF',

    // Nome do app (aparece no título da página e no PWA)
    APP_NOME: 'Inventário Musical',
    APP_NOME_CURTO: 'Inventário',
};
