const axios = require('axios');
const oracledb = require('oracledb');
require('dotenv').config();
const CryptoJS = require("crypto-js");


// Configuração do banco de dados Oracle
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
};

// Habilitar o modo Thick do node-oracledb e configurar o local do Oracle Instant Client,
// Necessário por conta de versão 11 do banco de dados atual SCMM
async function initOracleClient() {
    try {
        let clientOpts = {};
        if (process.platform === 'win32') {
            // Windows
            clientOpts = { libDir: 'C:\\Program Files\\Oracle Client for Microsoft Tools' };
        }
        await oracledb.initOracleClient(clientOpts);
    } catch (err) {
        console.error('Erro ao inicializar o Oracle Client:', err);
        process.exit(1);
    }
};


async function run() {
    await initOracleClient();
    let connection;
    try {
        // Estabeleça a conexão com o banco de dados
        connection = await oracledb.getConnection(dbConfig);

        // URL da API para SMS
        const url = "http://scmweb09/webservice/api/sms_get_lista/select/json/param_json";
        const response = await axios.get(url);
        const smsData = response.data;

        //Para cada paciente com registro disponivel faremos o envio do SMS e a postagem no banco de dados para 
        //criação do exame no site disponivel para público.
        for (const item of smsData) {
            try {
                const urlPdf = `http://cielab.lisnet.com.br/laudos/integra/pdf/?link=282222&zso=${item.CD_PED_LAB}`;
                const responsePdf = await axios.get(urlPdf, { responseType: 'arraybuffer' });

                if (responsePdf.status === 200) {
                    const pdfContent = responsePdf.data;

                    // Simulação do envio de SMS
                    console.log('enviou!!!');

                    const dataAtual = new Date();
                    const dataEnvio = dataAtual.toLocaleString('pt-BR', { timeZone: 'UTC', hour12: false }).replace(/,/, "");

                    // Montar a instrução SQL para inserção no banco de dados
                    const sqlInsert = `
            INSERT INTO DBAMV.SCMM_SMS_EXAMES
            (CD_ATENDIMENTO, NM_PACIENTE, NR_FONE, CD_PED_LAB, DT_CONFIRMA_LAB, SMS_ENVIADO, DT_ENVIO, PDF_ARQUIVO, CD_PACIENTE)
            VALUES
            (:cd_atendimento, :nm_paciente, :nr_fone, :cd_ped_lab, TO_DATE(:dt_confirma_lab, 'DD/MM/YYYY HH24:MI'), 'S', TO_DATE(:dt_envio, 'DD/MM/YYYY HH24:MI:SS'), :pdf_blob, :cd_paciente)
          `;

                    await connection.execute(sqlInsert, {
                        cd_atendimento: item.CD_ATENDIMENTO,
                        nm_paciente: item.NM_PACIENTE,
                        nr_fone: item.NR_FONE,
                        cd_ped_lab: item.CD_PED_LAB,
                        dt_confirma_lab: item.DT_CONFIRMA_LAB,
                        dt_envio: dataEnvio,
                        pdf_blob: pdfContent,
                        cd_paciente: item.CD_PACIENTE
                    });
                    await connection.commit();
                    console.log(`Registro inserido no banco de dados para ${item.NM_PACIENTE}`);
                }
            } catch (error) {
                console.error(`Erro ao enviar SMS e inserir registro no banco de dados: ${error}`);
            }
        }
    } catch (error) {
        console.error(`Erro ao conectar ao banco de dados Oracle: ${error}`);
    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log('Fim da lista de exames disponiveis para envio de SMS, o script parará agora.')
            } catch (error) {
                console.error(`Erro ao fechar a conexão com o banco de dados Oracle: ${error}`);
            }
        }
    }
}

run();
