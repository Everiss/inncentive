const axios = require('axios');
const token = "1c2b868fbd14b499e24a4732937c569628c67a0af38526855c6bbf5608e8c017";
const cnpj = "27865757000102";

async function test() {
  const configs = [
    { name: "Authorization Bearer", headers: { "Authorization": `Bearer ${token}` } },
    { name: "Authorization Prefixless", headers: { "Authorization": token } },
    { name: "x-auth-token", headers: { "x-auth-token": token } },
    { name: "Token", headers: { "Token": token } },
    { name: "x-api-key", headers: { "x-api-key": token } },
    { name: "v-token", headers: { "v-token": token } },
    { name: "Query token", url: `https://receitaws.com.br/v1/cnpj/${cnpj}/days/30?token=${token}` }
  ];

  for (const cfg of configs) {
    try {
      const url = cfg.url || `https://receitaws.com.br/v1/cnpj/${cnpj}/days/30`;
      const res = await axios.get(url, { headers: cfg.headers || {} });
      console.log(`[${cfg.name}] Status: ${res.data.status}, Billing Free: ${res.data.billing?.free}`);
      if (res.data.billing?.free === false) {
        console.log(`>>> SUCCESS FOUND WITH ${cfg.name} <<<`);
        break;
      }
    } catch (e) {
      console.log(`[${cfg.name}] Error ${e.response?.status}`);
    }
  }
}

test();
