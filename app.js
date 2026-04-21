const codeReader = new ZXing.BrowserMultiFormatReader();
const output = document.getElementById("output");
const fileInput = document.getElementById("fileInput");

let lastIBAN = "";
let lastRef = "";
let lastAmount = "";

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  output.textContent = "Čitam sliku...";

  const reader = new FileReader();

  reader.onload = function () {
    const img = new Image();

    img.onload = function () {
      codeReader.decodeFromImageElement(img)
        .then(result => handleResult(result.text))
        .catch(err => {
          console.error(err);
          output.textContent = "Ne mogu očitati barkod sa slike.";
        });
    };

    img.src = reader.result;
  };

  reader.readAsDataURL(file);
});

function handleResult(text) {
  const parsed = parseHUB3(text);
  output.textContent = parsed;

  // auto copy IBAN ako postoji
  if (lastIBAN) {
    navigator.clipboard.writeText(lastIBAN);
  }
}

function parseHUB3(text) {
  const lines = text.replace(/\r/g, '').split('\n');

  let iban = null;
  let model = null;
  let poziv = null;
  let amount = null;

  for (let l of lines) {
    l = l.trim();

    // IBAN
    const ib = l.match(/HR\d{2}[A-Z0-9]{17,}/);
    if (!iban && ib) iban = ib[0];

    // model
    const m = l.match(/^(HR)?(\d{2})$/);
    if (!model && m) model = "HR" + m[2];

    // poziv na broj
    const p = l.match(/^\d+(-\d+)+$/);
    if (!poziv && p) poziv = p[0];

       // IZNOS (robustniji parser)
    const amountRegex = /\b\d{1,3}([.,]\d{3})*([.,]\d{2})\b|\b\d{6,}\b/;

    if (!amount) {
      const a = l.match(amountRegex);
      if (a) {
        let raw = a[0];

        // ako je format 0000001234 → pretvori u decimal
        if (/^\d{6,}$/.test(raw)) {
          raw = (parseInt(raw, 10) / 100).toFixed(2);
        }

        amount = raw.replace(',', '.');
      }
    }

  if (!model || !poziv) {
    return "Greška: ne mogu očitati model ili poziv na broj.";
  }

  lastIBAN = iban || "";
  lastRef = model + " " + poziv;
  lastAmount = amount || "";

  let out = "";

  if (iban) {
    const valid = validateIBAN(iban);
    out += "IBAN: " + iban + (valid ? " ✔" : " ✖") + "\n";
  }

  out += "Model + poziv: " + lastRef + "\n";

  if (lastAmount) {
    out += "Iznos: " + lastAmount + " EUR\n";
  }

  out += "\nSEPA FORMAT\n";
  out += "IBAN: " + lastIBAN + "\n";
  out += "REFERENCE: " + lastRef + "\n";

  if (lastAmount) {
    out += "AMOUNT: " + lastAmount + " EUR\n";
  }

  return out;
}

// IBAN VALIDACIJA (MOD 97)
function validateIBAN(iban) {
  const moved = iban.slice(4) + iban.slice(0, 4);

  let expanded = "";
  for (let c of moved) {
    if (/[A-Z]/.test(c)) expanded += (c.charCodeAt(0) - 55);
    else expanded += c;
  }

  return BigInt(expanded) % 97n === 1n;
}

// COPY FUNKCIJE
function copyIBAN() {
  if (lastIBAN) navigator.clipboard.writeText(lastIBAN);
}

function copyRef() {
  if (lastRef) navigator.clipboard.writeText(lastRef);
}
