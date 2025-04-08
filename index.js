const express = require('express');
const bodyParser = require('body-parser');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post('/', async (req, res) => {
  console.log('Webhook-pyyntö vastaanotettu');

  const { phoneNumber, durationSeconds } = req.body;
  if (!phoneNumber) {
    console.error('Virhe webhookissa: Ei puhelinnumeroa');
    return res.json({ allow_call: false, message: 'Ei numeroa' });
  }

  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useServiceAccountAuth(serviceAccount);
    await doc.loadInfo();

    const configSheet = doc.sheetsByTitle['config'];
    const logSheet = doc.sheetsByTitle['log'];

    await configSheet.loadCells(); // ei pakollinen, mutta voi nopeuttaa accessia

    const whitelistRows = await configSheet.getRows();
    const whitelist = whitelistRows.map(row => normalizePhoneNumber(row._rawData[0]));

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!whitelist.includes(normalizedPhone)) {
      return res.json({ allow_call: false, message: 'Numero ei ole sallittu.' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const logRows = await logSheet.getRows();
    let totalSeconds = 0;

    for (const row of logRows) {
      const logDate = row._rawData[0];
      const logNumber = normalizePhoneNumber(row._rawData[1]);
      const seconds = Number(row._rawData[2]) || 0;

      if (logDate === today && logNumber === normalizedPhone) {
        totalSeconds += seconds;
      }
    }

    if (totalSeconds + durationSeconds > 300) {
      return res.json({ allow_call: false, message: 'Päivittäinen 300 sekunnin soittoaika ylitetty.' });
    }

    await logSheet.addRow([today, normalizedPhone, durationSeconds]);
    return res.json({
      allow_call: true,
      message: `Puheaika jäljellä: ${300 - totalSeconds - durationSeconds} sekuntia`
    });

  } catch (error) {
    console.error('Virhe webhookissa:', error);
    return res.json({
      allow_call: false,
      message: 'Tapahtui tekninen virhe, yritä myöhemmin uudelleen.'
    });
  }
});

function normalizePhoneNumber(number) {
  number = number.toString().replace(/\D/g, ''); // Poista kaikki muut paitsi numerot
  return number.slice(-9); // Palauta viimeiset 9 numeroa
}

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});
