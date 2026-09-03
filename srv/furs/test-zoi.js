require('dotenv').config();

const { calculateZoi } = require('./zoi');

try {
  const zoi = calculateZoi({
    taxNumber: '99999862',
    issueDateTime: '03.09.2026 13:00:00',
    invoiceNumber: 'TEST-001',
    businessPremiseId: 'TEST',
    electronicDeviceId: 'BLAG1',
    invoiceAmount: '25.50'
  });

  console.log('ZOI:', zoi);
  console.log('ZOI length:', zoi.length);
  console.log('ZOI test successful');
} catch (error) {
  console.error('ZOI test failed:', error);
  process.exit(1);
}