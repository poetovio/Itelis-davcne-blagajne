// srv/subscriber.js
const cds = require('@sap/cds');

cds.once('served', async () => {
  const messaging = await cds.connect.to('messaging');

  messaging.on('itelis/fiscal/test/invoice/created', async (msg) => {
    try {
      const data = msg?.data;
      console.log('👂 RECEIVED itelis/fiscal/test/invoice/created =>', JSON.stringify(data));
      // ovde radi šta ti treba (DB upis itd.)
    } catch (e) {
      console.error('subscriber error:', e);
    }
  });

  console.log('✅ Subscriber registered for itelis/fiscal/test/invoice/created');
});
