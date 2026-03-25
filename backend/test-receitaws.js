const axios = require('axios');
const token = "1c2b868fbd14b499e24a4732937c569628c67a0af38526855c6bbf5608e8c017";
const cnpj = "27865757000102";

async function test() {
  const configs = [
    { name: "Bearer Header", headers: { "Authorization": `Bearer ${token}` } },
    { name: "Raw Auth Header", headers: { "Authorization": token } },
    { name: "Token Header", headers: { "Token": token } },
    { name: "X-Auth-Token Header", headers: { "X-Auth-Token": token } },
    { name: "Query Param", url: `https://receitaws.com.br/v1/cnpj/${cnpj}/days/30?token=${token}` }
  ];

  for (const cfg of configs) {
    try {
      console.log(`Testing: ${cfg.name}...`);
      const url = cfg.url || `https://receitaws.com.br/v1/cnpj/${cnpj}/days/30`;
      const res = await axios.get(url, { headers: cfg.headers || {} });
      console.log(`${cfg.name}: SUCCESS (Status: ${res.data.status})`);
      break;
    } catch (e) {
      console.log(`${cfg.name}: FAILED (${e.response?.status} - ${e.response?.data?.message || e.message})`);
    }
  }
}

test();
