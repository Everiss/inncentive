const axios = require('axios');
const token = "1c2b868fbd14b499e24a4732937c569628c67a0af38526855c6bbf5608e8c017";
const cnpj = "27865757000102";

async function test() {
  const configs = [
    { name: "CNPJ.ws (Header x-token)", url: `https://publica.cnpj.ws/v1/cnpj/${cnpj}`, headers: { "x-token": token } },
    { name: "CNPJ.ws (Raw Header)", url: `https://publica.cnpj.ws/v1/cnpj/${cnpj}`, headers: { "Authorization": token } },
    { name: "ReceitaWS (v1)", url: `https://www.receitaws.com.br/v1/cnpj/${cnpj}`, headers: { "Authorization": `Bearer ${token}` } }
  ];

  for (const cfg of configs) {
    try {
      console.log(`Testing: ${cfg.name}...`);
      const res = await axios.get(cfg.url, { headers: cfg.headers || {} });
      console.log(`${cfg.name}: SUCCESS (CNPJ: ${res.data.cnpj || res.data.cnpj})`);
      break;
    } catch (e) {
      console.log(`${cfg.name}: FAILED (${e.response?.status} - ${e.response?.data?.message || e.message})`);
    }
  }
}

test();
