const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

function normalizeNumber(number) {
  return number.replace(/\D/g, "").slice(-9); // 9 viimeistä numeroa
}

async function checkWhitelistAndLimit(phoneNumber, durationSeconds = 0) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;

  const configRange = 'config!A2:A';
  const logRange = 'log!A2:C';

  const [configRes, logRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: configRange }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: logRange }),
  ]);

  const whitelist = (configRes.data.values || []).flat().map(n => normalizeNumber(n));
  if (!whitelist.includes(phoneNumber)) {
    return { allow_call: false, message: "Numero ei ole sallittu." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const log = (logRes.data.values || []);
  let secondsUsed = 0;

  for (const row of log) {
    const [date, num, sec] = row;
    if (normalizeNumber(num) === phoneNumber && date === today) {
      secondsUsed += Number(sec || 0);
    }
  }

  if (secondsUsed >= 300) {
    return { allow_call: false, message: "Päivittäinen 5 minuutin raja on täyttynyt." };
  }

  // Logita arvioitu kesto (esim. 0 sekuntia tarkistuksessa)
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'log!A2',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[today, phoneNumber, durationSeconds]],
    },
  });

  return {
    allow_call: true,
    session_labels: {
      jäljellä: (300 - secondsUsed) + " sekuntia"
    }
  };
}

app.post("/", async (req, res) => {
  const phone = req.body.phone_number;
  const estimatedDuration = Number(req.body.durationSeconds || 0); // jos halutaan arvio

  if (!phone) return res.status(400).json({ allow_call: false, message: "Ei numeroa" });

  try {
    const result = await checkWhitelistAndLimit(normalizeNumber(phone), estimatedDuration);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ allow_call: false, message: "Järjestelmävirhe." });
  }
});

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});
