const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

app.post('/', async (req, res) => {
  console.log('Webhook-pyyntö vastaanotettu');

  const rawNumber = req.body?.caller_id;

  if (!rawNumber) {
    console.error('Virhe webhookissa: Ei puhelinnumeroa');
    return res.status(400).json({ error: 'caller_id missing from request' });
  }

  const normalizedCaller = normalizePhoneNumber(rawNumber);
  console.log(`Saapuva numero: ${rawNumber}, normalisoitu: ${normalizedCaller}`);

  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useServiceAccountAuth(serviceAccount);
    await doc.loadInfo();

    const configSheet = doc.sheetsByTitle['config'];
    const logSheet = doc.sheetsByTitle['log'];

    const configRows = await configSheet.getRows();
    const whitelist = configRows.map(row => normalizePhoneNumber(row.phone));
    const whitelisted = whitelist.includes(normalizedCaller);

    const today = new Date().toISOString().slice(0, 10);
    const logRows = await logSheet.getRows();

    let secondsUsed = 0;
    for (const row of logRows) {
      const rowDate = new Date(row.date).toISOString().slice(0, 10);
      const rowPhone = normalizePhoneNumber(row.phone);
      const rowSeconds = Number(row.seconds || 0);
      if (rowDate === today && rowPhone === normalizedCaller) {
        secondsUsed += rowSeconds;
      }
    }

    const maxSeconds = 300;

    console.log(`Palautetaan tiedot: whitelisted=${whitelisted}, käytetty=${secondsUsed}`);

    return res.json({
      whitelisted,
      seconds_used_today: secondsUsed,
      max_seconds_per_day: maxSeconds,
    });

  } catch (error) {
    console.error('Virhe webhookissa:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

function normalizePhoneNumber(number) {
  return number.toString().replace(/\D/g, '').slice(-9); // 9 viimeistä numeroa
}

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});
