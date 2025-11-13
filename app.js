const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scanBtn = document.getElementById('scan-btn');
const statusDiv = document.getElementById('status');
const currencySelect = document.getElementById('currency-select');

// Konfiguration
let currentStream = null;
// Beispiel-Kurse (In einer echten App würdest du diese live von einer API holen)
const exchangeRates = {
    'EUR': 0.92, // 1 USD = 0.92 EUR
    'USD': 1.0,
    'GBP': 0.79,
    'JPY': 150.0
};

// Setup Tesseract Worker
const worker = Tesseract.createWorker({
    logger: m => console.log(m) // Fortschritt in Konsole loggen
});

async function init() {
    try {
        // 1. Kamera starten
        statusDiv.innerText = "Suche Kamera...";
        
        // Flexiblere Constraints: 'environment' (hinten) bevorzugen,
        // aber auf 'user' (vorne) zurückfallen, wenn nicht anders verfügbar.
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' } 
            }
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        
        statusDiv.innerText = "Lade Erkennungs-Modell..."; // Neuer Status

        // Worker initialisieren (das kann dauern)
        await worker.load();
        await worker.loadLanguage('eng'); // Englisch liest Zahlen oft am besten
        await worker.initialize('eng');
        
        statusDiv.innerText = "Bereit zum Scannen";
        
    } catch (err) {
        console.error("Fehler:", err);
        // Detailliertere Fehlermeldung
        if (err.name === "NotAllowedError") {
             statusDiv.innerText = "Kamera-Zugriff verweigert!";
        } else if (err.name === "NotFoundError") {
             statusDiv.innerText = "Keine Kamera gefunden.";
        } else {
             statusDiv.innerText = "Kamera-Fehler: " + err.message;
        }
    }
}

// Wichtig: Canvas Größe an Video anpassen
video.addEventListener('loadedmetadata', () => {
    // Sicherstellen, dass die Abmessungen gültig sind
    if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }
});

// Der Kern-Algorithmus
async function scanAndConvert() {
    if (!video.srcObject) {
        statusDiv.innerText = "Kamera nicht bereit.";
        return;
    }
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
         statusDiv.innerText = "Kamera-Stream noch nicht initialisiert.";
         return;
    }

    scanBtn.classList.add('loading');
    statusDiv.innerText = "Analysiere Bild...";
    
    // Zeichne aktuelles Videobild auf Canvas für Analyse
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
        // OCR durchführen
        const { data: { text, words } } = await worker.recognize(canvas);
        
        // Canvas leeren, damit das Live-Video wieder sichtbar ist
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        console.log("Erkannter Text:", text);
        
        let foundPrice = false;

        words.forEach(word => {
            // Einfacher Regex um Preise zu finden (z.B. $10.99, 10.99, 10,99)
            // Verbessert, um Symbole besser zu trennen
            const priceRegex = /[\$\£\€]?\s?(\d+([.,]\d{1,2})?)/;
            const match = word.text.match(priceRegex);
            
            // Debugging: Zeige, was Tesseract erkennt
            console.log(`Wort: '${word.text}', Match:`, match);

            if (match && match[1]) {
                // Zahl bereinigen (Komma zu Punkt)
                let rawValue = match[1].replace(',', '.');
                let value = parseFloat(rawValue);

                if (!isNaN(value)) {
                    foundPrice = true;
                    drawOverlay(word.bbox, value);
                }
            }
        });

        if(!foundPrice) {
            statusDiv.innerText = "Kein Preis erkannt.";
        } else {
            statusDiv.innerText = "Preise konvertiert!";
        }

    } catch (err) {
        console.error(err);
        statusDiv.innerText = "Fehler bei Erkennung";
    }

    scanBtn.classList.remove('loading');
    
    // Nach 3 Sekunden die Statusmeldung zurücksetzen
    setTimeout(() => {
        if(statusDiv.innerText === "Preise konvertiert!" || statusDiv.innerText === "Kein Preis erkannt.") {
            statusDiv.innerText = "Bereit zum Scannen";
        }
    }, 3000);
}

function drawOverlay(bbox, originalValue) {
    const targetCurrency = currencySelect.value;
    // Wir nehmen an, der Input ist USD (für Demo). 
    // In Produktion müsste man die Quellwährung erkennen oder wählen.
    const rate = exchangeRates[targetCurrency]; 
    const convertedValue = (originalValue * rate).toFixed(2);

    // Koordinaten von Tesseract
    const { x0, y0, x1, y1 } = bbox;
    const width = x1 - x0;
    const height = y1 - y0;

    // 1. Grüner Hintergrund über dem alten Preis
    ctx.fillStyle = "#00C853"; // Ein helles Grün
    ctx.beginPath();
    // roundRect ist in manchen Browsern nicht standard, wir nehmen rect
    ctx.rect(x0 - 5, y0 - 5, width + 10, height + 10);
    ctx.fill();

    // 2. Neuer Preis Text
    ctx.fillStyle = "#FFFFFF";
    // Schriftgröße an die Höhe der erkannten Box anpassen
    let fontSize = height * 0.8; 
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Textposition berechnen
    const centerX = x0 + width / 2;
    const centerY = y0 + height / 2;
    
    ctx.fillText(`${convertedValue} ${targetCurrency}`, centerX, centerY);
}

scanBtn.addEventListener('click', scanAndConvert);

// Start
init();

