const cds = require('@sap/cds');

cds.once('served', async () => {
  const results = await cds.connect.to('fiscalization-results');

  results.on('itelis/fiscal/test/invoice/fiscalized', async (msg) => {
    const { zoi, eor } = msg.data || {};
    console.log(`ZOI: ${zoi} EOR: ${eor}`);
  });

  console.log('✅ Poslušalec za fiscalization-results queue je registriran');
});