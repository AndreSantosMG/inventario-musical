/**
 * CONFIG.EXAMPLE.JS — Modelo de configuração
 * ============================================
 * Copie este arquivo para config.js e preencha os valores.
 * O config.js real está no .gitignore e não aparece no repositório.
 *
 * Passos para nova instância:
 *  1. Copie este arquivo: cp config.example.js config.js
 *  2. Configure o Apps Script (Code.gs) e publique como Web App
 *  3. Cole a URL gerada em GAS_URL abaixo
 *  4. Ajuste os demais campos para a instituição
 *  5. Suba no GitHub Pages e teste
 */

const APP_CONFIG = {
    // URL do Apps Script Web App (obrigatório)
    GAS_URL: 'COLE_AQUI_A_URL_DO_APPS_SCRIPT',

    // Instituição padrão (criada automaticamente na primeira abertura)
    INSTITUICAO_PADRAO: {
        id: 'default',
        nome: 'Nome da Instituição',
        cidade: 'Cidade',
    },

    // Prefixo dos códigos de inventário (ex: FDSF, INST, INV)
    CODIGO_PREFIXO: 'INV',

    // Nome do app (aparece no título e no ícone PWA)
    APP_NOME: 'Inventário de Bens',
    APP_NOME_CURTO: 'Inventário',
};
