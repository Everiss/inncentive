const axios = require('axios');
const token = "1c2b868fbd14b499e24a4732937c569628c67a0af38526855c6bbf5608e8c017";
const cnpj = "27865757000102";

async function test() {
  try {
    const url = `https://www.receitaws.com.br/v1/cnpj/${cnpj}/days/30`;
    const res = await axios.get(url, { headers: { "Authorization": `Bearer ${token}` } });
    console.log(`STATUS: ${res.data.status}`);
    console.log(`BILLING FREE: ${res.data.billing?.free}`);
  } catch (e) {
    console.log(`FAILED: ${e.response?.status} - ${e.response?.data?.message || e.message}`);
  }
}

test();
