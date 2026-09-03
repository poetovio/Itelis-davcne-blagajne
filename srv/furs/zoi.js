const fs = require('fs');
const crypto = require('crypto');

function loadPrivateKey() {
  const keyPath = process.env.FURS_KEY_PATH;

  if (!keyPath) {
    throw new Error('FURS_KEY_PATH is not configured');
  }

  return fs.readFileSync(keyPath);
}

function calculateZoi({
  taxNumber,
  issueDateTime,
  invoiceNumber,
  businessPremiseId,
  electronicDeviceId,
  invoiceAmount
}) {
  const data =
    String(taxNumber) +
    String(issueDateTime) +
    String(invoiceNumber) +
    String(businessPremiseId) +
    String(electronicDeviceId) +
    String(invoiceAmount);

  const privateKey = loadPrivateKey();

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(Buffer.from(data, 'utf8'));
  signer.end();

  const signature = signer.sign({
    key: privateKey,
    passphrase: process.env.FURS_CERT_PASSPHRASE || undefined
  });

  return crypto
    .createHash('md5')
    .update(signature)
    .digest('hex');
}

module.exports = {
  calculateZoi
};