const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const SHEET_ID = process.env.SHEET_ID;
const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.json());

function normalizePhoneNumber(number) {
  number = number.toString().trim();
  return number.slice(-9);
}

app.post('/', async (req, res) => {
  try {
    const callerId =
      req.body.phone_number ||
      req.body.phoneNumber ||
      req.body.caller_id ||
      (req.body.client_data && req.body.client_data.phoneNumber);

    if (!callerId) {
      console.log('Ei puhelinnumeroa');
      return res.status(400).json({ error: 'Ei puhelinnumeroa' });
    }

    const phone = normalizePhoneNumber(callerId);
    console.log(`Webhook-pyyntö vastaanotettu numerolta: ${callerId} (normalisoitu: ${phone})`);

    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    const configSheet = doc.sheetsByTitle['config'];
    const logSheet = doc.sheetsByTitle['log'];
    const configRows = await configSheet.getRows();
    const whitelist = configRows.map(row => normalizePhoneNumber(row.phone));

    const whitelisted = whitelist.includes(phone);
    const maxSeconds = 300;

    const today = new Date().toISOString().split('T')[0];
    await logSheet.loadHeaderRow();
    const logRows = await logSheet.getRows();

    let secondsUsed = 0;
    for (const row of logRows) {
      const logDate = row.date;
      const logPhone = normalizePhoneNumber(row.phone || '');
      const seconds = parseInt(row.seconds) || 0;
      if (logDate === today && logPhone === phone) {
        secondsUsed += seconds;
      }
    }

    const clientData = {
      whitelisted,
      seconds_used_today: secondsUsed,
      max_seconds_per_day: maxSeconds,
      customer_name: 'Elmeri', // placeholder
      memory_note: 'Muistiinpanoja aiemmista puheluista' // placeholder
    };

    console.log('Palautetaan client_data:', clientData);

    res.json({ client_data: clientData });

  } catch (err) {
    console.error('Virhe webhookissa:', err.message);
    res.status(500).json({ error: 'Tapahtui virhe' });
  }
});

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});
