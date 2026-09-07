// srv/subscriber.js

const cds = require('@sap/cds');

cds.once('served', async () => {
  try {
    const messaging = await cds.connect.to('messaging');

    const fiscalization = cds.services['fisc.FiscalizationService'];

    if (!fiscalization) {
      throw new Error('FiscalizationService is not available in cds.services');
    }

    console.log(
      '✅ FiscalizationService found:',
      fiscalization.name
    );

    messaging.on(
      'itelis/fiscal/test/invoice/created',
      async (msg) => {
        try {
          const data = msg?.data;

          console.log(
            '👂 RECEIVED itelis/fiscal/test/invoice/created =>',
            JSON.stringify(data)
          );

          if (!data) {
            console.error('❌ Message has no data');
            return;
          }

          if (!data.premiseId || !data.deviceId) {
            console.error(
              '❌ Message is missing premiseId/deviceId:',
              JSON.stringify(data)
            );
            return;
          }

          const result = await fiscalization.send(
            'submitFromEvent',
            {
              payload: {
                invoiceId: data.invoiceId,
                taxNumber: data.taxNumber,
                amount: data.amount,
                timestamp: data.timestamp,
                premiseId: data.premiseId,
                deviceId: data.deviceId
              }
            }
          );

          console.log(
            '✅ FiscalizationService processed invoice:',
            JSON.stringify(result)
          );

        } catch (e) {
          console.error(
            '❌ Error processing invoice event:',
            e
          );
        }
      }
    );

    console.log(
      '✅ Subscriber registered for itelis/fiscal/test/invoice/created'
    );

  } catch (e) {
    console.error(
      '❌ Failed to initialize messaging subscriber:',
      e
    );
  }
});