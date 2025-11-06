// srv/server.js
const cds = require('@sap/cds');
require('./subscriber');   
require('./fiscalization-service'); 

cds.on('bootstrap', (app) => {
  app.get('/health', (_req, res) => res.status(200).type('text/plain').send('OK'));
  app.get('/emitTest', async (_req, res) => {
    try {
      const messaging = await cds.connect.to('messaging');
      await messaging.emit('itelis/fiscal/test/invoice/created', { ts: Date.now(), by: 'emitTest' });
      res.type('text/plain').send('emitted');
    } catch (e) {
      res.status(500).send(e.message || 'emit error');
    }
  });
});

module.exports = cds.server;
