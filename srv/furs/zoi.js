const crypto = require('crypto');
const { getPrivateKey } = require('./certificate');

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

  const privateKey = getPrivateKey();

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(Buffer.from(data, 'utf8'));
  signer.end();

  const signature = signer.sign({
    key: privateKey
  });

  return crypto
    .createHash('md5')
    .update(signature)
    .digest('hex');
}

module.exports = {
  calculateZoi
};