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
        // 1. Kamera starten (Rückkamera bevorzugen)
        const constraints = {
            video: {
                facingMode: 'environment' 
            }
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        
        statusDiv.innerText = "Bereit zum Scannen";

        // Worker initialisieren
        await worker.load();
        await worker.loadLanguage('eng'); // Englisch liest Zahlen oft am besten
        await worker.initialize('eng');
        
    } catch (err) {
        console.error("Fehler:", err);
        statusDiv.innerText = "Kamera-Fehler: " + err.message;
    }
}

// Wichtig: Canvas Größe an Video anpassen
video.addEventListener('loadedmetadata', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
});

// Der Kern-Algorithmus
async function scanAndConvert() {
    if (!video.srcObject) return;

    scanBtn.classList.add('loading');
    statusDiv.innerText = "Analysiere Bild...";
    
    // Zeichne aktuelles Videobild auf Canvas für Analyse
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
        // OCR durchführen
        const { data: { text, words } } = await worker.recognize(canvas);
        
        // Canvas leeren und Video weiterspielen lassen (AR Effekt)
        // Wenn wir das Bild "einfrieren" wollen, lassen wir drawImage oben.
        // Für AR Overlay löschen wir das Canvas und malen nur die Boxen.
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        console.log("Erkannter Text:", text);
        
        let foundPrice = false;

        words.forEach(word => {
            // Einfacher Regex um Preise zu finden (z.B. $10.99, 10.99, 10,99)
            const priceRegex = /[\$\£\€]?\s?(\d+[.,]?\d*)/;
            const match = word.text.match(priceRegex);

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
    ctx.fillStyle = "#00C853";
    ctx.beginPath();
    ctx.roundRect(x0 - 5, y0 - 5, width + 10, height + 10, 5);
    ctx.fill();

    // 2. Neuer Preis Text
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${height}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle"; // Vertikale Zentrierung korrigiert
    
    // Textposition berechnen
    const centerX = x0 + width / 2;
    const centerY = y0 + height / 2;
    
    ctx.fillText(`${convertedValue} ${targetCurrency}`, centerX, centerY);
}

scanBtn.addEventListener('click', scanAndConvert);

// Start
init();
 
