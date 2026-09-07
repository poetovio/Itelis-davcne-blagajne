require('dotenv').config();

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const {
  getPrivateKey,
  getCertificate
} = require('./furs/certificate');

// ============================================================
// FURS TEST ENVIRONMENT
// ============================================================

const FURS_HOST = 'blagajne-test.fu.gov.si';
const FURS_PORT = 9002;
const FURS_PATH = '/v1/cash_registers/invoices/register';

// ============================================================
// YOUR TEST DATA
// ============================================================

const TAX_NUMBER = 10698655;

// BusinessPremiseID must be the same ID that you use
// later in InvoiceIdentifier.BusinessPremiseID.
const BUSINESS_PREMISE_ID = 'POS1';

// Date from which the business premise is valid.
const VALIDITY_DATE = '2026-09-07';

// Software supplier tax number.
// For your test this is set to your test tax number.
const SOFTWARE_SUPPLIER_TAX_NUMBER = 10698655;


// ============================================================
// BUSINESS PREMISE DATA
// ============================================================
//
// IMPORTANT:
//
// These cadastral/address values are taken from the FURS
// example you provided.
//
// If FURS rejects the request because these do not correspond
// to your actual business premise, replace them with the real
// values of the premise you want to register.
//
// ============================================================

const PREMISE_DATA = {
  PropertyID: {
    CadastralNumber: 365,
    BuildingNumber: 12,
    BuildingSectionNumber: 3
  },

  Address: {
    Street: 'Tržaška cesta',
    HouseNumber: '24',
    HouseNumberAdditional: 'B',
    Community: 'Ljubljana',
    City: 'Ljubljana',
    PostalCode: '1000'
  }
};


// ============================================================
// BASE64URL
// ============================================================

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}


// ============================================================
// CERTIFICATE DN
// ============================================================

function getAttributeName(attribute) {
  const names = {
    '2.5.4.3': 'CN',
    '2.5.4.5': 'SERIALNUMBER',
    '2.5.4.6': 'C',
    '2.5.4.7': 'L',
    '2.5.4.8': 'ST',
    '2.5.4.9': 'STREET',
    '2.5.4.10': 'O',
    '2.5.4.11': 'OU',
    '2.5.4.97': 'organizationIdentifier'
  };

  return (
    attribute.shortName ||
    names[attribute.type] ||
    attribute.name ||
    attribute.type
  );
}


function escapeDnValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/\+/g, '\\+')
    .replace(/=/g, '\\=')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/;/g, '\\;')
    .replace(/^ /, '\\ ')
    .replace(/ $/, '\\ ');
}


function buildDn(attributes) {
  return attributes
    .map(attribute => {
      const name = getAttributeName(attribute);
      const value = escapeDnValue(attribute.value);

      return `${name}=${value}`;
    })
    .join(',');
}


// ============================================================
// CERTIFICATE INFORMATION
// ============================================================

function getCertificateInfo() {
  const certificate = getCertificate();

  const subjectName = buildDn(
    certificate.subject.attributes
  );

  const issuerName = buildDn(
    certificate.issuer.attributes
  );

  const serial = BigInt(
    `0x${certificate.serialNumber}`
  ).toString(10);

  return {
    subject_name: subjectName,
    issuer_name: issuerName,
    serial
  };
}


// ============================================================
// JWS
// ============================================================
//
// This is deliberately independent from your existing jws.js.
//
// Your existing fiscalization service continues to use its
// existing createJws() implementation.
//
// This function is ONLY for BusinessPremiseRequest.
// ============================================================

function createBusinessPremiseJws(payload) {
  const privateKey = getPrivateKey();

  const certificateInfo = getCertificateInfo();

  const header = {
    alg: 'RS256',
    subject_name: certificateInfo.subject_name,
    issuer_name: certificateInfo.issuer_name,
    cty: 'application/json',
    typ: 'JOSE',

    // FURS example uses a numeric serial.
    //
    // If the certificate serial is larger than JS's safe integer
    // range, we intentionally keep it as a string so that
    // JavaScript does not silently corrupt the value.
    serial: Number.isSafeInteger(
      Number(certificateInfo.serial)
    )
      ? Number(certificateInfo.serial)
      : certificateInfo.serial
  };

  const encodedHeader = base64Url(
    JSON.stringify(header)
  );

  const encodedPayload = base64Url(
    JSON.stringify(payload)
  );

  const signingInput =
    `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');

  signer.update(signingInput, 'utf8');
  signer.end();

  const signature = signer.sign(privateKey);

  const encodedSignature = signature
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return {
    token:
      `${encodedHeader}.${encodedPayload}.${encodedSignature}`,

    header,
    payload
  };
}


// ============================================================
// BUILD BUSINESS PREMISE REQUEST
// ============================================================

function buildBusinessPremiseRequest() {
  return {
    BusinessPremiseRequest: {
      Header: {
        MessageID: crypto.randomUUID(),

        // FURS example uses ISO date/time with Z.
        DateTime: new Date().toISOString()
      },

      BusinessPremise: {
        TaxNumber: Number(TAX_NUMBER),

        BusinessPremiseID:
          BUSINESS_PREMISE_ID,

        BPIdentifier: {
          RealEstateBP: {
            PropertyID: {
              CadastralNumber:
                PREMISE_DATA.PropertyID.CadastralNumber,

              BuildingNumber:
                PREMISE_DATA.PropertyID.BuildingNumber,

              BuildingSectionNumber:
                PREMISE_DATA.PropertyID.BuildingSectionNumber
            },

            Address: {
              Street:
                PREMISE_DATA.Address.Street,

              HouseNumber:
                PREMISE_DATA.Address.HouseNumber,

              HouseNumberAdditional:
                PREMISE_DATA.Address
                  .HouseNumberAdditional,

              Community:
                PREMISE_DATA.Address.Community,

              City:
                PREMISE_DATA.Address.City,

              PostalCode:
                PREMISE_DATA.Address.PostalCode
            }
          }
        },

        ValidityDate:
          VALIDITY_DATE,

        SoftwareSupplier: [
          {
            TaxNumber:
              Number(
                SOFTWARE_SUPPLIER_TAX_NUMBER
              )
          }
        ],

        SpecialNotes:
          'Testna prijava poslovnega prostora'
      }
    }
  };
}


// ============================================================
// DECODE BASE64URL
// ============================================================

function decodeBase64Url(value) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(
      value.length +
        ((4 - (value.length % 4)) % 4),
      '='
    );

  return Buffer.from(
    normalized,
    'base64'
  ).toString('utf8');
}


// ============================================================
// SEND REQUEST TO FURS
// ============================================================

async function sendToFurs(token) {
  const certificate = require('./furs/certificate')
    .getFursCertificate
    ? require('./furs/certificate').getFursCertificate()
    : null;

  /*
   * Your existing certificate.js may expose getFursCertificate()
   * as used by fiscalization-service.js.
   *
   * If it does, use it.
   */

  let pfx;
  let passphrase;

  if (certificate) {
    pfx = certificate.pfx;
    passphrase = certificate.passphrase;
  } else {
    throw new Error(
      'getFursCertificate() was not found in ./furs/certificate.js'
    );
  }

  const body = JSON.stringify({
    token
  });

  const caPath =
    process.env.FURS_CA_PATH;

  const options = {
    hostname: FURS_HOST,

    port: FURS_PORT,

    path: FURS_PATH,

    method: 'POST',

    pfx,

    passphrase,

    ca: caPath
      ? fs.readFileSync(caPath)
      : undefined,

    rejectUnauthorized: true,

    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',

    headers: {
      'Content-Type':
        'application/json; charset=UTF-8',

      'Accept':
        'application/json',

      'Content-Length':
        Buffer.byteLength(body)
    }
  };

  console.log('\n========================================');
  console.log(' SENDING REQUEST TO FURS');
  console.log('========================================');

  console.log(
    `POST https://${FURS_HOST}:${FURS_PORT}${FURS_PATH}`
  );

  return new Promise((resolve, reject) => {
    const req = https.request(
      options,
      res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          console.log(
            '\n========== FURS RESPONSE =========='
          );

          console.log(
            'HTTP status:',
            res.statusCode
          );

          console.log(
            'Headers:',
            JSON.stringify(
              res.headers,
              null,
              2
            )
          );

          console.log(
            '\nRaw response:'
          );

          console.log(data);

          resolve({
            statusCode: res.statusCode,
            body: data
          });
        });
      }
    );

    req.setTimeout(
      15000,
      () => {
        req.destroy(
          new Error(
            'FURS request timed out after 15 seconds'
          )
        );
      }
    );

    req.on('error', err => {
      reject(err);
    });

    req.write(body);

    req.end();
  });
}


// ============================================================
// PROCESS FURS RESPONSE
// ============================================================

function processFursResponse(body) {
  let parsed;

  try {
    parsed = JSON.parse(body);
  } catch {
    console.log(
      '\n⚠️ Response is not valid JSON.'
    );

    return;
  }

  console.log(
    '\n========== PARSED RESPONSE =========='
  );

  console.log(
    JSON.stringify(
      parsed,
      null,
      2
    )
  );

  if (!parsed.token) {
    console.log(
      '\n⚠️ Response does not contain a JWS token.'
    );

    return;
  }

  const parts =
    parsed.token.split('.');

  if (parts.length !== 3) {
    console.log(
      '\n⚠️ Invalid JWS returned by FURS.'
    );

    return;
  }

  try {
    const decodedPayload =
      decodeBase64Url(parts[1]);

    console.log(
      '\n========== DECODED FURS JWS PAYLOAD =========='
    );

    console.log(
      decodedPayload
    );

    try {
      const json =
        JSON.parse(decodedPayload);

      console.log(
        '\n========== FURS RESPONSE JSON =========='
      );

      console.log(
        JSON.stringify(
          json,
          null,
          2
        )
      );

      const response =
        json?.BusinessPremiseResponse;

      if (response?.Error) {
        console.log(
          '\n❌ FURS ERROR'
        );

        console.log(
          'ErrorCode:',
          response.Error.ErrorCode
        );

        console.log(
          'ErrorMessage:',
          response.Error.ErrorMessage
        );
      } else {
        console.log(
          '\n✅ FURS DID NOT RETURN AN ERROR.'
        );

        console.log(
          'Check the decoded response above for the registration result.'
        );
      }
    } catch {
      console.log(
        '\n⚠️ Decoded payload is not JSON.'
      );
    }
  } catch (err) {
    console.log(
      '\n❌ Could not decode FURS response:',
      err.message
    );
  }
}


// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    console.log('\n');
    console.log(
      '============================================'
    );
    console.log(
      ' FURS BUSINESS PREMISE REGISTRATION TEST'
    );
    console.log(
      '============================================'
    );

    console.log(
      '\nTax number:',
      TAX_NUMBER
    );

    console.log(
      'BusinessPremiseID:',
      BUSINESS_PREMISE_ID
    );

    console.log(
      'ValidityDate:',
      VALIDITY_DATE
    );

    console.log(
      'Endpoint:',
      `https://${FURS_HOST}:${FURS_PORT}${FURS_PATH}`
    );


    // --------------------------------------------------------
    // Build payload
    // --------------------------------------------------------

    const payload =
      buildBusinessPremiseRequest();


    console.log(
      '\n========== BUSINESS PREMISE PAYLOAD =========='
    );

    console.log(
      JSON.stringify(
        payload,
        null,
        2
      )
    );


    // --------------------------------------------------------
    // Create JWS
    // --------------------------------------------------------

    const jws =
      createBusinessPremiseJws(
        payload
      );


    console.log(
      '\n========== JWS HEADER =========='
    );

    console.log(
      JSON.stringify(
        jws.header,
        null,
        2
      )
    );


    console.log(
      '\n========== JWS TOKEN =========='
    );

    console.log(
      jws.token
    );


    // --------------------------------------------------------
    // Send to FURS
    // --------------------------------------------------------

    const response =
      await sendToFurs(
        jws.token
      );


    // --------------------------------------------------------
    // Decode response
    // --------------------------------------------------------

    processFursResponse(
      response.body
    );


    console.log(
      '\n============================================'
    );

    console.log(
      ' TEST FINISHED'
    );

    console.log(
      '============================================\n'
    );

  } catch (err) {
    console.error(
      '\n❌ TEST FAILED'
    );

    console.error(
      err.message
    );

    console.error(err);
  }
}


main();