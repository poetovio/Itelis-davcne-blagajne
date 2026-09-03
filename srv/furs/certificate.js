const fs = require('fs');
const forge = require('node-forge');

function loadP12() {
  const p12Path = process.env.FURS_P12_PATH;
  const passphrase = process.env.FURS_P12_PASSPHRASE || '';

  if (!p12Path) {
    throw new Error('FURS_P12_PATH is not configured');
  }

  if (!fs.existsSync(p12Path)) {
    throw new Error(`FURS PKCS#12 certificate not found: ${p12Path}`);
  }

  const p12Buffer = fs.readFileSync(p12Path);

  if (!p12Buffer.length) {
    throw new Error(`FURS PKCS#12 certificate is empty: ${p12Path}`);
  }

  const p12Der = forge.util.createBuffer(
    p12Buffer.toString('binary')
  );

  const p12Asn1 = forge.asn1.fromDer(p12Der);

  return forge.pkcs12.pkcs12FromAsn1(
    p12Asn1,
    true,
    passphrase
  );
}

function getFursCertificate() {
  const p12Path = process.env.FURS_P12_PATH;
  const passphrase = process.env.FURS_P12_PASSPHRASE || '';

  if (!p12Path) {
    throw new Error('FURS_P12_PATH is not configured');
  }

  if (!fs.existsSync(p12Path)) {
    throw new Error(`FURS PKCS#12 certificate not found: ${p12Path}`);
  }

  const pfx = fs.readFileSync(p12Path);

  if (!pfx.length) {
    throw new Error(`FURS PKCS#12 certificate is empty: ${p12Path}`);
  }

  return {
    pfx,
    passphrase
  };
}

function getPrivateKey() {
  const p12 = loadP12();

  const bags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag
  });

  const keyBags = bags[forge.pki.oids.pkcs8ShroudedKeyBag];

  if (!keyBags || keyBags.length === 0) {
    throw new Error(
      'Private key not found in FURS PKCS#12 certificate'
    );
  }

  return forge.pki.privateKeyToPem(keyBags[0].key);
}

function getCertificate() {
  const p12 = loadP12();

  const bags = p12.getBags({
    bagType: forge.pki.oids.certBag
  });

  const certBags = bags[forge.pki.oids.certBag];

  if (!certBags || certBags.length === 0) {
    throw new Error(
      'Certificate not found in FURS PKCS#12 certificate'
    );
  }

  return certBags[0].cert;
}

function getCertificatePem() {
  return forge.pki.certificateToPem(
    getCertificate()
  );
}

module.exports = {
  getFursCertificate,
  getPrivateKey,
  getCertificate,
  getCertificatePem
};