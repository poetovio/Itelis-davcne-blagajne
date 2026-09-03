require('dotenv').config();

const {
  getFursCertificate,
  getPrivateKey
} = require('./certificate');

try {
  const certificate = getFursCertificate();
  const privateKey = getPrivateKey();

  console.log('P12 loaded:', certificate.pfx.length > 0);
  console.log('Private key loaded:', !!privateKey);
  console.log('Private key type:', privateKey.constructor.name);
  console.log('Certificate test successful');
} catch (error) {
  console.error('Certificate test failed:', error.message);
  process.exit(1);
}