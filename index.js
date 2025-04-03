const express = require("express");
const bodyParser = require("body-parser");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Parsitaan JSON-avaimet renderin environment-muuttujasta
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
const sheetId = process.env.SHEET_ID;

async function loadSheet() {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(serviceAccount);
  await doc.loadInfo();
  return doc;
}

// Normalisoi numero vertailemalla viimeiset 9 numeroa
function normalize(number) {
  return number.toString().replace(/\D/g, "").slice(-9);
}

app.post("/", async (req, res) => {
  console.log("Webhook-pyyntö vastaanotettu");

  try {
    const { phoneNumber, durationSeconds } = req.body;
    if (!phoneNumber || !durationSeconds) {
      console.log("Puuttuvat parametrit");
      return res.json({ allow_call: false, message: "Puuttuvat tiedot" });
    }

    const doc = await loadSheet();
    const configSheet = doc.sheetsByTitle["config"];
    const logSheet = doc.sheetsByTitle["log"];

    await configSheet.loadCells("A2:A");
    const rows = await configSheet.getRows();
    const whitelist = rows.map(row => normalize(row.get("phone"))).filter(Boolean);

    const normalized = normalize(phoneNumber);
    if (!whitelist.includes(normalized)) {
      console.log("Numero ei ole sallittu:", normalized);
      return res.json({ allow_call: false, message: "Numero ei ole sallittu" });
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const logs = await logSheet.getRows();

    let total = 0;
    for (let row of logs) {
      const logDate = row.get("date");
      const logNumber = normalize(row.get("phone"));
      const seconds = parseInt(row.get("seconds") || "0", 10);

      if (logDate === today && logNumber === normalized) {
        total += seconds;
      }
    }

    if (total + durationSeconds > 300) {
      console.log("Aikaraja ylittynyt:", total, "+", durationSeconds);
      return res.json({ allow_call: false, message: "Päivittäinen 300 sekunnin soittoaika ylittynyt." });
    }

    // Lokitetaan soitto
    await logSheet.addRow({
      date: today,
      phone: normalized,
      seconds: durationSeconds
    });

    console.log("Soitto sallittu:", normalized, `jäljellä: ${300 - total - durationSeconds}s`);
    return res.json({ allow_call: true, message: `Puheaikaa jäljellä: ${300 - total - durationSeconds} sekuntia` });

  } catch (err) {
    console.error("Virhe webhookissa:", err.message);
    return res.json({ allow_call: false, message: "Tapahtui tekninen virhe." });
  }
});

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});

