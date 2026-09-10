require('dotenv').config();

const cds = require('@sap/cds');
require('./subscriber');
require('./fiscalization-service');
require('./results-listener');

const path = require('path');
const express = require('express');

cds.on('bootstrap', (app) => {
  app.get('/health', (_req, res) => res.status(200).type('text/plain').send('OK'));

  app.get('/emitTest', async (_req, res) => {
    try {
      const messaging = await cds.connect.to('messaging');
      await messaging.emit('itelis/fiscal/test/invoice/created', {
        ts: Date.now(),
        by: 'emitTest'
      });

      res.type('text/plain').send('emitted');
    } catch (e) {
      res.status(500).send(e.message || 'emit error');
    }
  });

  app.use('/ui', express.static(path.join(__dirname, '..', 'app', 'dummy-ui')));
 
  app.post('/ui/api/emit', express.json(), async (req, res) => {
    try {
      const messaging = await cds.connect.to('messaging');
      await messaging.emit('invoice/created', req.body);
      res.status(202).json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'emit error' });
    }
  });
 
  app.get('/ui/api/status/:invoiceId', async (req, res) => {
    try {
      const fiscalization = cds.services['fisc.FiscalizationService'];
      const result = await fiscalization.send('status', {
        InvoiceId: req.params.invoiceId
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message || 'status error' });
    }
  });
});

module.exports = cds.server;