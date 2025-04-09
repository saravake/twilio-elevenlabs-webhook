const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const app = express();
app.use(express.json());

const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// Yksinkertainen normalisointi suomalaisille numeroille
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-9); // esim. 401234567
}

app.post('/', async (req, res) => {
  try {
    const rawPhone = req.body.phoneNumber || '';
    const phone = normalizePhone(rawPhone);
    const today = new Date().toISOString().split('T')[0];

    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth(SERVICE_ACCOUNT);
    await doc.loadInfo();

    const whitelistSheet = doc.sheetsByTitle['whitelist'];
    const logSheet = doc.sheetsByTitle['log'];

    const whitelistRows = await whitelistSheet.getRows();
    const isWhitelisted = whitelistRows.some(
      row => normalizePhone(row.phone) === phone
    );

    const logRows = await logSheet.getRows();
    const secondsUsedToday = logRows
      .filter(row => normalizePhone(row.phone) === phone && row.date === today)
      .reduce((sum, row) => sum + Number(row.duration || 0), 0);

    const clientData = {
      whitelisted: isWhitelisted,
      seconds_used_today: secondsUsedToday,
      customer_name: "Asiakas",
      memory_note: "Tykkää luonnosta ja mökkeilystä."
    };

    return res.json(clientData);
  } catch (err) {
    console.error('Virhe webhookissa:', err);
    return res.status(200).json({
      whitelisted: false,
      seconds_used_today: 0,
      error: true,
      message: 'Tapahtui virhe tiedon haussa'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook toimii portissa ${PORT}`));
