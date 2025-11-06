// srv/handler.js
const cds = require('@sap/cds');

module.exports = async (srv) => {
  srv.on('submitFromEvent', async (req) => {
    const p = req.data.payload;
    if (!p || !p.invoiceId || !p.taxNumber || !p.timestamp) {
      return req.reject(400, 'Missing required fields in payload');
    }

    const { Invoices } = srv.entities;
    const idemKey = `${p.taxNumber}|${p.invoiceId}|${p.timestamp}|${p.amount}`;

    const existing = await SELECT.one.from(Invoices).where({
      or: [{ InvoiceId: p.invoiceId }, { IdempotencyKey: idemKey }]
    });
    if (existing) return { InvoiceId: existing.InvoiceId, Status: existing.Status };

    await INSERT.into(Invoices).entries({
      InvoiceId:      p.invoiceId,
      TaxNumber:      p.taxNumber,
      IssueDateTime:  new Date(p.timestamp),
      Amount:         p.amount,
      ZOI:            null,
      Status:         'PENDING',
      CorrelationID:  req.headers?.['x-correlation-id'] || cds.utils.uuid(),
      IdempotencyKey: idemKey,
    });

    return { InvoiceId: p.invoiceId, Status: 'PENDING' };
  });

  srv.on('ackEOR', async (req) => {
    const d = req.data?.data || {};
    const { invoiceId, eor, receivedAt, rawResponse } = d;
    if (!invoiceId || !eor) return req.reject(400, 'invoiceId and eor are required');

    const { Invoices, Responses } = srv.entities;

    const exists = await SELECT.one.from(Responses).where({ InvoiceId_InvoiceId: invoiceId });
    if (!exists) {
      await INSERT.into(Responses).entries({
        InvoiceId_InvoiceId: invoiceId,
        EOR: eor,
        ReceivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        RawPayload: rawResponse || null
      });
    }

    await UPDATE(Invoices).set({ Status: 'CONFIRMED' }).where({ InvoiceId: invoiceId });
    return { ok: true };
  });
};
