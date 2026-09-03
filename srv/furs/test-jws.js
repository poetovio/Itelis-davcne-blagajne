require('dotenv').config();

const {
  createJws,
  getCertificateInfo
} = require('./jws');

try {
  const certificateInfo = getCertificateInfo();

  console.log('Certificate subject:', certificateInfo.subject_name);
  console.log('Certificate issuer:', certificateInfo.issuer_name);
  console.log('Certificate serial:', certificateInfo.serial);

  const payload = {
    InvoiceRequest: {
      Header: {
        MessageID: '11111111-1111-1111-1111-111111111111',
        DateTime: '2026-09-03T13:00:00'
      },
      Invoice: {
        TaxNumber: 99999862,
        IssueDateTime: '2026-09-03T13:00:00',
        NumberingStructure: 'B',
        InvoiceIdentifier: {
          BusinessPremiseID: 'TEST',
          ElectronicDeviceID: 'BLAG1',
          InvoiceNumber: 'TEST-001'
        },
        InvoiceAmount: 25.50,
        PaymentAmount: 25.50,
        TaxesPerSeller: [],
        OperatorTaxNumber: 99999862,
        ProtectedID: '3fe5429a588a723ca13a6e7ae27712d6'
      }
    }
  };

  const jws = createJws(payload);

  console.log('JWS created:', true);
  console.log('Token parts:', jws.token.split('.').length);
  console.log('Token length:', jws.token.length);
  console.log('JWS test successful');
} catch (error) {
  console.error('JWS test failed:', error);
  process.exit(1);
}