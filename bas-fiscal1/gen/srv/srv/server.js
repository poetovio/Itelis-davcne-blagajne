const cds = require('@sap/cds');
require('./subscriber');
require('./handler');


// >>> DODAJ OVAJ BLOK <<<
// Handleri se kače kada su servisi spremni
cds.on('served', async () => {
  const srv = await cds.connect.to('fisc.FiscalizationService'); // FQN iz fiscal.cds (namespace fisc)

  const crypto = require('crypto');
  const makeIdemKey = (p) => {
    const taxNumber   = (p?.taxNumber || p?.TaxNumber || '').toString().replace(/\s+/g,'').toUpperCase();
    const invoiceId   = (p?.invoiceId || p?.InvoiceId || p?.billingDocument || '').toString().trim();
    const companyCode = (p?.companyCode || p?.CompanyCode || '').toString().trim();
    const rawTs       = p?.issueDateTime || p?.timestamp || '';
    const ts          = rawTs ? new Date(rawTs).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
    let amt           = p?.amount ?? p?.Amount ?? '';
    if (typeof amt === 'string') amt = amt.replace(',', '.');
    const amount      = amt === '' || isNaN(+amt) ? '' : (+amt).toFixed(2);
    const docType     = (p?.documentType || '').toString().trim();
    const canonical   = [taxNumber, companyCode, invoiceId, ts, amount, docType].join('|');
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  };

  const FISC_INVOICE  = 'fisc.Invoice';
  const FISC_RESPONSE = 'fisc.Response';
  const FISC_ERROR    = 'fisc.ErrorLog';

  // submitFromEvent
  srv.on('submitFromEvent', async (req) => {
    const raw = req.data?.payload;
    let p = {};
    try { p = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); }
    catch (e) { return req.error(400, `Invalid JSON payload: ${e.message}`); }

    const tx   = cds.tx(req);
    const idem = makeIdemKey(p);
    const corr = req.headers['x-correlation-id'] || cds.utils.uuid();

    const existing = await tx.run(SELECT.one`InvoiceId, Status`.from(FISC_INVOICE).where({ IdempotencyKey: idem }));
    if (existing) return { InvoiceId: existing.InvoiceId, Status: existing.Status };

    const invoiceId = p.invoiceId || cds.utils.uuid();
    const now = new Date().toISOString();

    await tx.run(INSERT.into(FISC_INVOICE).entries({
      InvoiceId: invoiceId,
      TaxNumber: p.taxNumber ?? null,
      IssueDateTime: p.issueDateTime ?? p.timestamp ?? now,
      Amount: p.amount ?? null,
      PremiseId: p.premiseId ?? null,
      DeviceId: p.deviceId ?? null,
      ZOI: p.zoi ?? null,
      Status: 'PENDING',
      CorrelationID: corr,
      IdempotencyKey: idem
    }));

    return { InvoiceId: invoiceId, Status: 'PENDING' };
  });

  // status
  srv.on('status', async (req) => {
    const { InvoiceId } = req.data;
    const inv  = await SELECT.one.from(FISC_INVOICE).columns('Status','ZOI').where({ InvoiceId });
    if (!inv) return { Status: null, ZOI: null, EOR: null };
    const resp = await SELECT.one.from(FISC_RESPONSE).columns('EOR').where({ InvoiceId });
    return { Status: inv.Status, ZOI: inv.ZOI, EOR: resp?.EOR ?? null };
  });

  // resend
  srv.on('resend', async (_req) => {
    return { ok: true };
  });
});
// <<< KRAJ BLOKA >>>

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
