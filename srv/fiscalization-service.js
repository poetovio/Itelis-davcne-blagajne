const crypto = require('crypto');
const cds = require('@sap/cds');
const https = require('https');
const fs = require('fs');
const { calculateZoi } = require('./furs/zoi');

function makeIdemKey(p) {
  const taxNumber = (p?.taxNumber || p?.TaxNumber || '').toString().replace(/\s+/g, '').toUpperCase();
  const invoiceId = (p?.invoiceId || p?.InvoiceId || p?.billingDocument || '').toString().trim();
  const companyCode = (p?.companyCode || p?.CompanyCode || '').toString().trim();
  const rawTs = p?.issueDateTime || p?.timestamp || '';
  const ts = rawTs ? new Date(rawTs).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
  let amt = p?.amount ?? p?.Amount ?? '';
  if (typeof amt === 'string') amt = amt.replace(',', '.');
  const amount = amt === '' || isNaN(+amt) ? '' : (+amt).toFixed(2);
  const docType = (p?.documentType || '').toString().trim();
  const canonical = [taxNumber, companyCode, invoiceId, ts, amount, docType].join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function makeZoi(p) {
  const taxNumber =
    (p?.taxNumber || p?.TaxNumber || '')
      .toString()
      .replace(/\s+/g, '')
      .toUpperCase();

  const invoiceNumber =
    (p?.invoiceId || p?.InvoiceId || p?.billingDocument || '')
      .toString()
      .trim();

  const issueDateTime =
    p?.issueDateTime ||
    p?.timestamp ||
    '';

  const businessPremiseId =
    (p?.premiseId || p?.PremiseId || '')
      .toString()
      .trim();

  const electronicDeviceId =
    (p?.deviceId || p?.DeviceId || '')
      .toString()
      .trim();

  let amount = p?.amount ?? p?.Amount ?? '';

  if (typeof amount === 'string') {
    amount = amount.replace(',', '.');
  }

  if (amount !== '' && !isNaN(+amount)) {
    amount = (+amount).toFixed(2);
  }

  return calculateZoi({
    taxNumber,
    issueDateTime,
    invoiceNumber,
    businessPremiseId,
    electronicDeviceId,
    invoiceAmount: amount
  });
}

function normalizeFursResponse(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try { return JSON.parse(body); } catch (_) { return { raw: body }; }
}

function callFurs(payload, zoi) {
  return new Promise((resolve, reject) => {
    const host = process.env.FURS_HOST;
    const path = process.env.FURS_PATH;
    const certPath = process.env.FURS_CERT_PATH;
    const keyPath = process.env.FURS_KEY_PATH;
    const caPath = process.env.FURS_CA_PATH;
    const passphrase = process.env.FURS_CERT_PASSPHRASE;

    if (!host || !path || !certPath || !keyPath) {
      return reject(new Error('Missing FURS_HOST, FURS_PATH, FURS_CERT_PATH or FURS_KEY_PATH'));
    }

    const options = {
      hostname: host,
      path,
      method: 'POST',
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      ca: caPath ? fs.readFileSync(caPath) : undefined,
      passphrase: passphrase || undefined,
      rejectUnauthorized: true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);

    req.write(JSON.stringify({
      ...payload,
      zoi
    }));

    req.end();
  });
}

module.exports = (srv) => {
  const { Invoices, Responses } = srv.entities;

  srv.on('submitFromEvent', async (req) => {
    const raw = req.data?.payload;
    let p = {};

    try {
      p = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    } catch (e) {
      return req.error(400, `Invalid JSON payload: ${e.message}`);
    }

    const tx = srv.transaction(req);
    const idem = makeIdemKey(p);
    const corr = req.headers?.['x-correlation-id'] || cds.utils.uuid();

    const existing = await tx.run(
      SELECT.one.from(Invoices).columns('InvoiceId', 'Status', 'ZOI', 'EOR').where({ IdempotencyKey: idem })
    );

    if (existing) {
      return {
        InvoiceId: existing.InvoiceId,
        Status: existing.Status,
        ZOI: existing.ZOI,
        EOR: existing.EOR || null
      };
    }

    const invoiceId = p.invoiceId || cds.utils.uuid();
    const now = new Date().toISOString();
    const issueDateTime = p.issueDateTime || p.timestamp || now;
    const zoi = makeZoi({ ...p, invoiceId, issueDateTime });

    await tx.run(INSERT.into(Invoices).entries({
      InvoiceId: invoiceId,
      TaxNumber: p.taxNumber ?? null,
      IssueDateTime: issueDateTime,
      Amount: p.amount ?? null,
      PremiseId: p.premiseId ?? null,
      DeviceId: p.deviceId ?? null,
      ZOI: zoi,
      EOR: null,
      Status: 'PENDING',
      CorrelationID: corr,
      IdempotencyKey: idem
    }));

    try {
      const fursPayload = {
        invoiceId,
        taxNumber: p.taxNumber ?? null,
        issueDateTime: issueDateTime,
        amount: p.amount ?? null,
        premiseId: p.premiseId ?? null,
        deviceId: p.deviceId ?? null,
        companyCode: p.companyCode ?? null,
        documentType: p.documentType ?? null
      };

      const fursResp = await callFurs(fursPayload, zoi);
      const parsed = normalizeFursResponse(fursResp.body);

      const eor =
        parsed?.EOR ||
        parsed?.eor ||
        parsed?.UniqueInvoiceID ||
        parsed?.uniqueInvoiceID ||
        parsed?.invoiceEor ||
        null;

      const status = fursResp.statusCode >= 200 && fursResp.statusCode < 300 && eor
        ? 'CONFIRMED'
        : 'ERROR';

      await tx.run(
        UPDATE(Invoices).set({
          Status: status,
          ZOI: zoi,
          EOR: eor
        }).where({ InvoiceId: invoiceId })
      );

      await tx.run(INSERT.into(Responses).entries({
        InvoiceId_InvoiceId: { InvoiceId: invoiceId },
        EOR: eor,
        ReceivedAt: new Date(),
        RawPayload: typeof fursResp.body === 'string' ? fursResp.body : JSON.stringify(fursResp.body)
      }));

      return {
        InvoiceId: invoiceId,
        Status: status,
        ZOI: zoi,
        EOR: eor
      };
    } catch (err) {
      await tx.run(
        UPDATE(Invoices).set({
          Status: 'ERROR',
          ZOI: zoi
        }).where({ InvoiceId: invoiceId })
      );

      return req.error(502, `FURS call failed: ${err.message}`);
    }
  });

  srv.on('ackEOR', async (req) => {
    const d = req.data?.data || {};
    const { invoiceId, eor, receivedAt, rawResponse } = d;
    if (!invoiceId || !eor) return req.reject(400, 'invoiceId and eor are required');

    const tx = srv.transaction(req);

    const exists = await tx.run(
      SELECT.one.from(Responses).where({ InvoiceId_InvoiceId: { InvoiceId: invoiceId } })
    );

    if (!exists) {
      await tx.run(INSERT.into(Responses).entries({
        InvoiceId_InvoiceId: { InvoiceId: invoiceId },
        EOR: eor,
        ReceivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        RawPayload: rawResponse || null
      }));
    }

    await tx.run(
      UPDATE(Invoices).set({ Status: 'CONFIRMED', EOR: eor }).where({ InvoiceId: invoiceId })
    );

    return { ok: true };
  });

  srv.on('status', async (req) => {
    const { InvoiceId } = req.data;
    const inv = await SELECT.one.from(Invoices).columns('Status', 'ZOI', 'EOR').where({ InvoiceId });
    if (!inv) return { Status: null, ZOI: null, EOR: null };
    return { Status: inv.Status, ZOI: inv.ZOI, EOR: inv.EOR ?? null };
  });

  srv.on('resend', async (req) => {
    const { InvoiceId } = req.data || {};
    if (!InvoiceId) return req.reject(400, 'InvoiceId is required');

    const tx = srv.transaction(req);
    const inv = await tx.run(SELECT.one.from(Invoices).where({ InvoiceId }));
    if (!inv) return req.reject(404, 'Invoice not found');

    const zoi = inv.ZOI || makeZoi(inv);

    try {
      const fursPayload = {
        invoiceId: inv.InvoiceId,
        taxNumber: inv.TaxNumber,
        issueDateTime: inv.IssueDateTime,
        amount: inv.Amount,
        premiseId: inv.PremiseId,
        deviceId: inv.DeviceId
      };

      const fursResp = await callFurs(fursPayload, zoi);
      const parsed = normalizeFursResponse(fursResp.body);

      const eor =
        parsed?.EOR ||
        parsed?.eor ||
        parsed?.UniqueInvoiceID ||
        parsed?.uniqueInvoiceID ||
        null;

      await tx.run(
        UPDATE(Invoices).set({
          Status: eor ? 'CONFIRMED' : 'ERROR',
          ZOI: zoi,
          EOR: eor
        }).where({ InvoiceId })
      );

      return {
        ok: true,
        InvoiceId,
        ZOI: zoi,
        EOR: eor
      };
    } catch (err) {
      return req.error(502, `Resend failed: ${err.message}`);
    }
  });
};