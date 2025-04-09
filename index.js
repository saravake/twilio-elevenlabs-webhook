const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

app.post("/", async (req, res) => {
  console.log("Webhook-pyyntö vastaanotettu");

  const fromNumber = req.body?.phone_number;

  if (!fromNumber) {
    console.error("Virhe: Ei puhelinnumeroa");
    return res.status(400).json({ error: "Ei puhelinnumeroa" });
  }

  try {
    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth(GOOGLE_SERVICE_ACCOUNT);
    await doc.loadInfo();

    const configSheet = doc.sheetsByTitle["config"];
    const logSheet = doc.sheetsByTitle["log"];

    await configSheet.loadCells();
    await logSheet.loadCells();

    const rows = await configSheet.getRows();
    const whitelistRow = rows.find(r => normalizeNumber(r.phone) === normalizeNumber(fromNumber));

    const whitelisted = !!whitelistRow;

    const logRows = await logSheet.getRows();
    const today = new Date().toISOString().split("T")[0];

    let secondsUsedToday = 0;

    for (let row of logRows) {
      const logDate = row.date?.split("T")[0];
      const logNumber = normalizeNumber(row.phone);
      const seconds = parseInt(row.seconds) || 0;

      if (logDate === today && logNumber === normalizeNumber(fromNumber)) {
        secondsUsedToday += seconds;
      }
    }

    const clientData = {
      whitelisted,
      seconds_used_today: secondsUsedToday,
      max_seconds_per_day: 300,
      customer_name: whitelistRow?.name || null,
      memory_note: whitelistRow?.memory || null,
    };

    console.log("Palautetaan client_data:", clientData);
    res.json(clientData);
  } catch (error) {
    console.error("Virhe webhookissa:", error);
    res.status(500).json({ error: "Sisäinen virhe" });
  }
});

function normalizeNumber(number) {
  return number.replace(/\D/g, "").slice(-9); // 9 viimeistä numeroa
}

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});
