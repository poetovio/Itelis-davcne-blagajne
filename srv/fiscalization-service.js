const crypto = require('crypto');
const cds = require('@sap/cds');
const https = require('https');
const { calculateZoi } = require('./furs/zoi');
const { createJws } = require('./furs/jws');
const { getFursCertificate } = require('./furs/certificate');

// FURS requires date/time as YYYY-MM-DDTHH:MM:SS — no milliseconds, no
// trailing Z (see TehnicnaDokumentacija, e.g. R_3.2 / example payloads).
// This must be used both for the ZOI input string and for the
// InvoiceRequest.Invoice.IssueDateTime field itself, or FURS will either
// reject the schema or, worse, silently accept a ZOI that doesn't match
// what a verifier recomputes.
const FURS_TIME_ZONE = 'Europe/Ljubljana';

const fursDateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FURS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

function toFursDateTime(value) {
  const d = value ? new Date(value) : new Date();

  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date/time: ${value}`);
  }

  // sv-SE locale formats as "YYYY-MM-DD HH:MM:SS"; swap the space for
  // FURS's required 'T' separator. This resolves to Europe/Ljubljana wall
  // clock time regardless of the server's own system timezone (cloud
  // instances typically run in UTC, which would otherwise silently shift
  // invoice times by 1-2 hours depending on DST).
  return fursDateTimeFormatter.format(d).replace(' ', 'T');
}

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

  return crypto
    .createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
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

  const issueDateTime = toFursDateTime(
    p?.issueDateTime || p?.timestamp
  );

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

function decodeBase64Url(value) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');

  return Buffer.from(normalized, 'base64').toString('utf8');
}

function decodeJwsPayload(token) {
  if (!token || typeof token !== 'string') return {};

  const parts = token.split('.');
  if (parts.length !== 3) return {};

  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch (_) {
    return {};
  }
}

function normalizeFursResponse(body) {
  if (!body) return {};

  if (typeof body === 'object') {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch (_) {
    return { raw: body };
  }
}

// Builds the InvoiceRequest structure exactly as required by FURS
// (TehnicnaDokumentacija 3.1, section 3.1.1 / 9.1). NOTE: BusinessPremiseID
// and ElectronicDeviceID are mandatory here — if p.premiseId/deviceId are
// missing (e.g. the event payload from subscriber.js currently doesn't
// carry them), this throws rather than silently sending an invalid request.
function buildInvoiceRequest(p, invoiceId, issueDateTime, zoi) {
  const taxNumber = String(
    p.taxNumber ?? p.TaxNumber ?? ''
  ).replace(/\s+/g, '');

  if (!/^\d{8}$/.test(taxNumber)) {
    throw new Error(
      'taxNumber is required and must contain exactly 8 digits'
    );
  }

  const premiseId =
    (p.premiseId ?? p.PremiseId ?? '').toString().trim();

  const deviceId =
    (p.deviceId ?? p.DeviceId ?? '').toString().trim();

  if (!premiseId) throw new Error('premiseId is required');
  if (!deviceId) throw new Error('deviceId is required');
  if (!invoiceId) throw new Error('invoiceId is required');

  let amount = p.amount ?? p.Amount ?? '';

  if (typeof amount === 'string') {
    amount = amount.replace(',', '.');
  }

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    throw new Error('amount is required and must be numeric');
  }

  amount = Number(amount.toFixed(2));

  return {
    InvoiceRequest: {
      Header: {
        MessageID: cds.utils.uuid(),
        DateTime: issueDateTime
      },

      Invoice: {
        TaxNumber: Number(taxNumber),

        IssueDateTime: issueDateTime,

        NumberingStructure:
          p.numberingStructure ??
          p.NumberingStructure ??
          'B',

        InvoiceIdentifier: {
          BusinessPremiseID: premiseId,
          ElectronicDeviceID: deviceId,
          InvoiceNumber: String(invoiceId)
        },

        InvoiceAmount: amount,

        PaymentAmount: amount,

        OperatorTaxNumber: Number(taxNumber),

        ProtectedID: zoi
      }
    }
  };
}

async function callFurs(invoiceRequest) {
  const host = process.env.FURS_HOST;
  const port = Number(process.env.FURS_PORT || 9002);
  const path = process.env.FURS_PATH;
  const caPath = process.env.FURS_CA_PATH;

  if (!host || !path) {
    throw new Error('Missing FURS_HOST or FURS_PATH');
  }

  const certificate = getFursCertificate();

  // FURS's invoice endpoint expects the payload wrapped in a signed JWS
  // token: {"token": "<header>.<payload>.<signature>"} — not plain JSON.
  const jws = createJws(invoiceRequest);
  const body = JSON.stringify({ token: jws.token });

  console.log('➡️ JWS created');
  console.log('➡️ JWS token length:', jws.token?.length);

  console.log('\n========== JWS PAYLOAD ==========');
  console.log(
    JSON.stringify(
      decodeJwsPayload(jws.token),
      null,
      2
    )
  );

  const options = {
    hostname: host,
    port,
    path,
    method: 'POST',
    pfx: certificate.pfx,
    passphrase: certificate.passphrase,
    ca: caPath ? require('fs').readFileSync(caPath) : undefined,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  console.log('➡️ Sending HTTPS request to FURS...');

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      console.log('\n========== FURS RESPONSE ==========');
      console.log('⬅️ HTTP status:', res.statusCode);
      console.log('⬅️ Headers:', JSON.stringify(res.headers, null, 2));
      console.log('⬅️ Raw body:', data);

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.setTimeout(15000, () => {
      console.error('❌ FURS request timed out after 15s');
      req.destroy(new Error('FURS request timed out after 15s'));
    });

    req.on('error', (err) => {
      console.error('\n❌ FURS HTTPS ERROR');
      console.error('❌ Error:', err.message);
      console.error(err);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

module.exports = (srv) => {
  const { Invoices, Responses } = srv.entities;

  srv.on('submitFromEvent', async (req) => {
    const raw = req.data?.payload;
    let p = {};

    try {
      p = typeof raw === 'string'
        ? JSON.parse(raw || '{}')
        : (raw || {});
    } catch (e) {
      return req.error(400, `Invalid JSON payload: ${e.message}`);
    }

    const tx = srv.transaction(req);
    const idem = makeIdemKey(p);
    const corr = req.headers?.['x-correlation-id'] || cds.utils.uuid();

    const existing = await tx.run(
      SELECT.one
        .from(Invoices)
        .columns('InvoiceId', 'Status', 'ZOI', 'EOR')
        .where({ IdempotencyKey: idem })
    );

    if (existing) {
      return {
        InvoiceId: existing.InvoiceId,
        Status: existing.Status,
        ZOI: existing.ZOI,
        EOR: existing.EOR || null
      };
    }

    const invoiceId =
      p.invoiceId ||
      p.InvoiceId ||
      p.billingDocument ||
      cds.utils.uuid();

    const now = new Date().toISOString();
    const issueDateTime = toFursDateTime(
      p.issueDateTime ||
      p.timestamp ||
      now
    );

    let zoi;

    try {
      zoi = makeZoi({
        ...p,
        invoiceId,
        issueDateTime
      });
    } catch (err) {
      return req.error(500, `ZOI calculation failed: ${err.message}`);
    }

    await tx.run(
      INSERT.into(Invoices).entries({
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
      })
    );

    try {
      const invoiceRequest = buildInvoiceRequest(p, invoiceId, issueDateTime, zoi);
      const fursResp = await callFurs(invoiceRequest);
      const parsed = normalizeFursResponse(fursResp.body);

      console.log('\n========== FURS PROCESSING ==========');
      console.log('📥 FURS status:', fursResp.statusCode);
      console.log('📥 Parsed FURS response:', JSON.stringify(parsed, null, 2));

      console.log('\n========== FURS REQUEST ==========');
      console.log('➡️ FURS_HOST:', process.env.FURS_HOST);
      console.log('➡️ FURS_PORT:', process.env.FURS_PORT || 9002);
      console.log('➡️ FURS_PATH:', process.env.FURS_PATH);
      console.log(
        '➡️ InvoiceRequest:',
        JSON.stringify(invoiceRequest, null, 2)
      );

      // FURS's response is itself a JWS token: {"token": "<jws>"}. The
      // actual InvoiceResponse (or Error) is base64url-encoded in the
      // payload segment (part 2 of the 3 dot-separated parts).
      const responseBody = parsed?.token
        ? decodeJwsPayload(parsed.token)
        : parsed;

      const invoiceResponse =
        responseBody?.InvoiceResponse ?? responseBody;

      const eor =
        invoiceResponse?.UniqueInvoiceID ||
        invoiceResponse?.EOR ||
        null;

      console.log('🧾 FURS EOR:', eor);

      const status =
        fursResp.statusCode >= 200 &&
        fursResp.statusCode < 300 &&
        eor
          ? 'CONFIRMED'
          : 'ERROR';

      console.log('📊 Fiscalization status:', status);

      await tx.run(
        UPDATE(Invoices)
          .set({
            Status: status,
            ZOI: zoi,
            EOR: eor
          })
          .where({ InvoiceId: invoiceId })
      );

      await tx.run(
        INSERT.into(Responses).entries({
          InvoiceId_InvoiceId: {
            InvoiceId: invoiceId
          },
          EOR: eor,
          ReceivedAt: new Date(),
          RawPayload:
            typeof fursResp.body === 'string'
              ? fursResp.body
              : JSON.stringify(fursResp.body)
        })
      );

      return {
        InvoiceId: invoiceId,
        Status: status,
        ZOI: zoi,
        EOR: eor
      };
    } catch (err) {
      await tx.run(
        UPDATE(Invoices)
          .set({
            Status: 'ERROR',
            ZOI: zoi
          })
          .where({ InvoiceId: invoiceId })
      );

      return req.error(502, `FURS call failed: ${err.message}`);
    }
  });

  srv.on('ackEOR', async (req) => {
    const d = req.data?.data || {};
    const {
      invoiceId,
      eor,
      receivedAt,
      rawResponse
    } = d;

    if (!invoiceId || !eor) {
      return req.reject(
        400,
        'invoiceId and eor are required'
      );
    }

    const tx = srv.transaction(req);

    const exists = await tx.run(
      SELECT.one
        .from(Responses)
        .where({
          InvoiceId_InvoiceId: {
            InvoiceId: invoiceId
          }
        })
    );

    if (!exists) {
      await tx.run(
        INSERT.into(Responses).entries({
          InvoiceId_InvoiceId: {
            InvoiceId: invoiceId
          },
          EOR: eor,
          ReceivedAt: receivedAt
            ? new Date(receivedAt)
            : new Date(),
          RawPayload: rawResponse || null
        })
      );
    }

    await tx.run(
      UPDATE(Invoices)
        .set({
          Status: 'CONFIRMED',
          EOR: eor
        })
        .where({ InvoiceId: invoiceId })
    );

    return {
      ok: true
    };
  });

  srv.on('status', async (req) => {
    const { InvoiceId } = req.data;

    const inv = await SELECT.one
      .from(Invoices)
      .columns('Status', 'ZOI', 'EOR')
      .where({ InvoiceId });

    if (!inv) {
      return {
        Status: null,
        ZOI: null,
        EOR: null
      };
    }

    return {
      Status: inv.Status,
      ZOI: inv.ZOI,
      EOR: inv.EOR ?? null
    };
  });

  srv.on('resend', async (req) => {
    const { InvoiceId } = req.data || {};

    if (!InvoiceId) {
      return req.reject(
        400,
        'InvoiceId is required'
      );
    }

    const tx = srv.transaction(req);

    const inv = await tx.run(
      SELECT.one
        .from(Invoices)
        .where({ InvoiceId })
    );

    if (!inv) {
      return req.reject(
        404,
        'Invoice not found'
      );
    }

    const zoi = inv.ZOI || makeZoi(inv);

    try {
      const invoiceRequest = buildInvoiceRequest(
        inv,
        inv.InvoiceId,
        toFursDateTime(inv.IssueDateTime),
        zoi
      );

      const fursResp = await callFurs(invoiceRequest);
      const parsed = normalizeFursResponse(fursResp.body);

      const responseBody = parsed?.token
        ? decodeJwsPayload(parsed.token)
        : parsed;

      const invoiceResponse =
        responseBody?.InvoiceResponse ?? responseBody;

      const eor =
        invoiceResponse?.UniqueInvoiceID ||
        invoiceResponse?.EOR ||
        null;

      await tx.run(
        UPDATE(Invoices)
          .set({
            Status: eor
              ? 'CONFIRMED'
              : 'ERROR',
            ZOI: zoi,
            EOR: eor
          })
          .where({
            InvoiceId
          })
      );

      return {
        ok: true,
        InvoiceId,
        ZOI: zoi,
        EOR: eor
      };
    } catch (err) {
      return req.error(
        502,
        `Resend failed: ${err.message}`
      );
    }
  });
};