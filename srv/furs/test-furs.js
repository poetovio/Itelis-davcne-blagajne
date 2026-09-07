require('dotenv').config();

const fs = require('fs');
const https = require('https');

const pfx = fs.readFileSync(process.env.FURS_P12_PATH);
const payload = JSON.stringify({ EchoRequest: 'test' });

const options = {
  hostname: 'blagajne-test.fu.gov.si',
  port: 9002,
  path: '/v1/cash_registers/echo',
  method: 'POST',
  pfx,
  passphrase: process.env.FURS_P12_PASSPHRASE,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.2',
  rejectUnauthorized: false,
  servername: 'blagajne-test.fu.gov.si',
  headers: {
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log(`P12: ${process.env.FURS_P12_PATH}`);
console.log(`Connecting to https://${options.hostname}:${options.port}${options.path}`);

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('HTTP status:', res.statusCode);
    console.log('Response headers:', res.headers);
    console.log('Response body:', body);
  });
});

req.on('error', (err) => {
  console.error('FURS request failed:', err);
  process.exit(1);
});

req.write(payload);
req.end();