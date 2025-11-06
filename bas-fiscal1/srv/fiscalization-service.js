const cds = require('@sap/cds');
const crypto = require('crypto');

function makeIdemKey(p) {
  const taxNumber  = (p?.taxNumber || p?.TaxNumber || '').toString().replace(/\s+/g,'').toUpperCase();
  const invoiceId  = (p?.invoiceId || p?.InvoiceId || p?.billingDocument || '').toString().trim();
  const companyCode= (p?.companyCode || p?.CompanyCode || '').toString().trim();
  const rawTs      = p?.issueDateTime || p?.timestamp || '';
  const ts         = rawTs ? new Date(rawTs).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
  let   amt        = p?.amount ?? p?.Amount ?? '';
  if (typeof amt === 'string') amt = amt.replace(',', '.');
  const amount     = amt === '' || isNaN(+amt) ? '' : (+amt).toFixed(2);
  const docType    = (p?.documentType || '').toString().trim();
  const canonical  = [taxNumber, companyCode, invoiceId, ts, amount, docType].join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

module.exports = (srv) => {
  const FISC_INVOICE  = 'fisc.Invoice';
  const FISC_RESPONSE = 'fisc.Response';
  const FISC_ERROR    = 'fisc.ErrorLog';

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

  srv.on('status', async (req) => {
    const { InvoiceId } = req.data;
    const inv  = await SELECT.one.from(FISC_INVOICE).columns('Status','ZOI').where({ InvoiceId });
    if (!inv) return { Status: null, ZOI: null, EOR: null };
    const resp = await SELECT.one.from(FISC_RESPONSE).columns('EOR').where({ InvoiceId });
    return { Status: inv.Status, ZOI: inv.ZOI, EOR: resp?.EOR ?? null };
  });

  srv.on('resend', async (_req) => {
    return { ok: true };
  });
};
