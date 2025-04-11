const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

app.post('/', async (req, res) => {
  console.log('Webhook-pyyntö vastaanotettu');
  
  // Käytetään kenttää "caller_id", kuten dokumentaatiossa on mainittu
  const callerId = req.body?.caller_id;
  if (!callerId) {
    console.error('Virhe webhookissa: Ei puhelinnumeroa');
    return res.status(400).json({ error: 'caller_id puuttuu pyynnöstä' });
  }
  
  const phone = normalizePhoneNumber(callerId);
  console.log(`Saapuva numero: ${callerId} -> normalisoitu: ${phone}`);
  
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    // Oletetaan, että Sheetsissä on kaksi välilehteä: 'config' ja 'log'
    const configSheet = doc.sheetsByTitle['config'];
    const logSheet = doc.sheetsByTitle['log'];

    // Hae whitelistin tiedot; oletamme, että 'config'-välilehdellä sarakkeessa A on puhelinnumerot
    const configRows = await configSheet.getRows();
    const whitelist = configRows.map(row => normalizePhoneNumber(row.phone));
    const whitelisted = whitelist.includes(phone);

    // Hae logitiedot; oletamme että 'log'-välilehdellä on sarakkeet: date, phone, seconds
    const today = new Date().toISOString().split('T')[0];
    const logRows = await logSheet.getRows();
    let secondsUsed = 0;
    for (const row of logRows) {
      // Muutetaan päivämäärä ISO-muotoon (vain päivä)
      const rowDate = new Date(row.date).toISOString().split('T')[0];
      const rowPhone = normalizePhoneNumber(row.phone);
      const rowSeconds = Number(row.seconds || 0);
      if (rowDate === today && rowPhone === phone) {
        secondsUsed += rowSeconds;
      }
    }
    
    const maxSeconds = 300;
    
    // Placeholder-arvot; nämä voidaan myöhemmin hakea dynaamisesti Sheetsistä, esim. 'name' ja 'memory'
    const customerName = "Elmeri";
    const memoryNote = "Viimeksi puhuttiin säästä.";

    // Muodostetaan JSON-vastaus asiakkaalle kirjoitettuna client_data -avaimen alle
    const responsePayload = {
      client_data: {
        whitelisted,
        seconds_used_today: secondsUsed,
        max_seconds_per_day: maxSeconds,
        customer_name: customerName,
        memory_note: memoryNote
      }
    };

    console.log("Palautetaan client_data:", responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    console.error("Virhe webhookissa:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

function normalizePhoneNumber(number) {
  // Poistaa kaikki ei-numerot ja palauttaa viimeiset 9 numeroa
  return number.toString().replace(/\D/g, "").slice(-9);
}

app.listen(PORT, () => {
  console.log(`Webhook-palvelin käynnissä portissa ${PORT}`);
});
