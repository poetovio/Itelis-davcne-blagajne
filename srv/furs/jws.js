const crypto = require('crypto');
const forge = require('node-forge');
const {
  getPrivateKey,
  getCertificate
} = require('./certificate');

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

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

  return attribute.shortName ||
    names[attribute.type] ||
    attribute.name ||
    attribute.type;
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
    serial: Number.isSafeInteger(Number(serial))
      ? Number(serial)
      : serial
  };
}

function createJws(payload) {
  const privateKey = getPrivateKey();
  const certificateInfo = getCertificateInfo();

  const header = {
    alg: 'RS256',
    subject_name: certificateInfo.subject_name,
    issuer_name: certificateInfo.issuer_name,
    serial: certificateInfo.serial
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

module.exports = {
  createJws,
  getCertificateInfo
};