const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.post('/', async (req, res) => {
  console.log('Webhook-pyyntö vastaanotettu');

  const callerId = req.body?.caller_id;
  if (!callerId) {
    console.log('Ei caller_id kenttää!');
    return res.status(400).json({ error: 'caller_id puuttuu' });
  }

  const normalized = normalizePhoneNumber(callerId);
  console.log(`Saapuva numero: ${callerId}, normalisoitu: ${normalized}`);

  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    const configSheet = doc.sheetsByTitle['config'];
    const logSheet = doc.sheetsByTitle['log'];

    const configRows = await configSheet.getRows();
    const whitelisted = configRows
      .map(r => normalizePhoneNumber(r.phone))
      .includes(normalized);

    const today = new Date().toISOString().slice(0, 10);
    const logRows = await logSheet.getRows();

    let secondsUsed = 0;
    for (const row of logRows) {
      const rowDate = new Date(row.date).toISOString().slice(0, 10);
      const rowPhone = normalizePhoneNumber(row.phone);
      if (rowDate === today && rowPhone === normalized) {
        secondsUsed += Number(row.seconds || 0);
      }
    }

    const maxSeconds = 300;

    const response = {
      client_data: {
        whitelisted,
        seconds_used_today: secondsUsed,
        max_seconds_per_day: maxSeconds,
        customer_name: "Elmeri", // placeholder, voi hakea sheetsistä
        memory_note: "Muisti: viimeksi puhuttiin säästä." // voi hakea sheetsistä
      }
    };

    console.log('Palautetaan:', JSON.stringify(response, null, 2));
    return res.json(response);

  } catch (err) {
    console.error('Virhe webhookissa:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

function normalizePhoneNumber(number) {
  return number.toString().replace(/\D/g, '').slice(-9);
}

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});
