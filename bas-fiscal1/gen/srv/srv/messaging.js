const cds = require('@sap/cds')

module.exports = async function () {
  const messaging = await cds.connect.to('messaging')

  const TOPIC = 'itelis/fiscal/test/invoice/created'
  messaging.on(TOPIC, msg => {
    console.log('📥 [EM] received:', msg.event, msg.data)
  })

  // health-check da "/" ne bude "Cannot GET /"
  cds.on('bootstrap', app => app.get('/', (_req,res) => res.send('ok')))
}
