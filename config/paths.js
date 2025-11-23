const path = require("path");

// Define root directory (assuming this file is in PowerShop/config)
const ROOT_DIR = path.resolve(__dirname, "../");

const DIRETORIO_DADOS = path.join(ROOT_DIR, "dados");
const DIRETORIO_AUTH = path.join(ROOT_DIR, "tokens");
const DIRETORIO_MEDIA = path.join(ROOT_DIR, "media");
const DIRETORIO_PRODUTOS = path.join(ROOT_DIR, "produtos");
const DIRETORIO_OFERTAS = path.join(DIRETORIO_PRODUTOS, "ofertas");
const DIRETORIO_ESFERAS = path.join(DIRETORIO_PRODUTOS, "esferas");
const DIRETORIO_DESCONTOS = path.join(ROOT_DIR, "descontos");
const DIRETORIO_DUVIDAS = path.join(DIRETORIO_DADOS, "duvidas");
const DIRETORIO_CONTAS_EXCLUSIVAS = path.join(DIRETORIO_PRODUTOS, "contas_exclusivas");
const DIRETORIO_TUTORIAL_VERIFY = path.join(DIRETORIO_MEDIA, "tutorial", "verify");

const ARQUIVO_USUARIOS = path.join(DIRETORIO_DADOS, "usuarios.json");
const ARQUIVO_HISTORICO_COMPRAS = path.join(DIRETORIO_DADOS, "historico_compras.json");
const ARQUIVO_ADMINS = path.join(DIRETORIO_DADOS, "admins.json");
const ARQUIVO_COMPRADORES = path.join(DIRETORIO_DADOS, "compradores.json");
const ARQUIVO_GERENCIADORES_PRODUTO = path.join(DIRETORIO_DADOS, "gerenciadores_produto.json");
const ARQUIVO_GERENCIADORES_CARTAO = path.join(DIRETORIO_DADOS, "gerenciadores_cartao.json");
const ARQUIVO_GERENCIADORES_TROCA_REGIONAL = path.join(DIRETORIO_DADOS, "gerenciadores_troca_regional.json");
const ARQUIVO_DADOS_LOJA = path.join(DIRETORIO_DADOS, "dadosLoja.json");
const ARQUIVO_TICKETS = path.join(DIRETORIO_DADOS, "tickets.json");
const ARQUIVO_CARRINHOS = path.join(DIRETORIO_DADOS, "carrinhos.json");
const ARQUIVO_PEDIDOS = path.join(DIRETORIO_DADOS, "pedidos.json");
const ARQUIVO_PEDIDOS_V = path.join(DIRETORIO_DADOS, "pedidosv.json");
const ARQUIVO_PEDIDOS_ESPERA = path.join(DIRETORIO_DADOS, "pedidos_espera.json");
const ARQUIVO_CUPONS = path.join(DIRETORIO_DESCONTOS, "cupons.json");
const ARQUIVO_CONVITES = path.join(DIRETORIO_DESCONTOS, "convites.json");
const ARQUIVO_CHATS_ATIVOS = path.join(DIRETORIO_DADOS, "active_chats.json");
const ARQUIVO_CONTAS_EXCLUSIVAS_JSON = path.join(DIRETORIO_CONTAS_EXCLUSIVAS, "contas.json");
const ARQUIVO_EMAILS_FINALIZADOS = path.join(DIRETORIO_DADOS, "emails_finalizados.json");
const ARQUIVO_SOLICITACOES_VERIFICACAO = path.join(DIRETORIO_DADOS, "solicitacoes_verificacao.json");
const ARQUIVO_BASES_VALORES = path.join(DIRETORIO_DADOS, "bases_valores.json");
const ARQUIVO_APOIADORES = path.join(DIRETORIO_DADOS, "apoiadores.json");
const ARQUIVO_RANKINGS = path.join(DIRETORIO_DADOS, "rankings.json");
const CAMINHO_IMAGEM_MENU = path.join(DIRETORIO_MEDIA, "menu.jpeg");

module.exports = {
    ROOT_DIR,
    DIRETORIO_DADOS,
    DIRETORIO_AUTH,
    DIRETORIO_MEDIA,
    DIRETORIO_PRODUTOS,
    DIRETORIO_OFERTAS,
    DIRETORIO_ESFERAS,
    DIRETORIO_DESCONTOS,
    DIRETORIO_DUVIDAS,
    DIRETORIO_CONTAS_EXCLUSIVAS,
    DIRETORIO_TUTORIAL_VERIFY,
    ARQUIVO_USUARIOS,
    ARQUIVO_HISTORICO_COMPRAS,
    ARQUIVO_ADMINS,
    ARQUIVO_COMPRADORES,
    ARQUIVO_GERENCIADORES_PRODUTO,
    ARQUIVO_GERENCIADORES_CARTAO,
    ARQUIVO_GERENCIADORES_TROCA_REGIONAL,
    ARQUIVO_DADOS_LOJA,
    ARQUIVO_TICKETS,
    ARQUIVO_CARRINHOS,
    ARQUIVO_PEDIDOS,
    ARQUIVO_PEDIDOS_V,
    ARQUIVO_PEDIDOS_ESPERA,
    ARQUIVO_CUPONS,
    ARQUIVO_CONVITES,
    ARQUIVO_CHATS_ATIVOS,
    ARQUIVO_CONTAS_EXCLUSIVAS_JSON,
    ARQUIVO_EMAILS_FINALIZADOS,
    ARQUIVO_SOLICITACOES_VERIFICACAO,
    ARQUIVO_BASES_VALORES,
    ARQUIVO_APOIADORES,
    ARQUIVO_RANKINGS,
    CAMINHO_IMAGEM_MENU
};
