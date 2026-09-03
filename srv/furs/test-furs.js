require('dotenv').config();

const fs = require('fs');
const https = require('https');

try {
  const p12Path = process.env.FURS_P12_PATH;
  const passphrase = process.env.FURS_P12_PASSPHRASE || '';
  const caPath = process.env.FURS_CA_PATH;

  if (!p12Path) {
    throw new Error('FURS_P12_PATH is not configured');
  }

  if (!caPath) {
    throw new Error('FURS_CA_PATH is not configured');
  }

  const pfx = fs.readFileSync(p12Path);
  const ca = fs.readFileSync(caPath);

  const options = {
    hostname: 'blagajne-test.fu.gov.si',
    port: 9002,
    path: '/v1/cash_registers/echo',
    method: 'POST',
    pfx,
    passphrase,
    ca,
    rejectUnauthorized: true,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

  const req = https.request(options, (res) => {
    let body = '';

    res.on('data', chunk => {
      body += chunk;
    });

    res.on('end', () => {
      console.log('HTTP status:', res.statusCode);
      console.log('Response headers:', res.headers);
      console.log('Response body:', body);
    });
  });

  req.on('error', error => {
    console.error('FURS request failed:', error);
    process.exit(1);
  });

  req.write(JSON.stringify({}));
  req.end();
} catch (error) {
  console.error('FURS test failed:', error);
  process.exit(1);
}