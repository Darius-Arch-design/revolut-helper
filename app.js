const codeReader = new ZXing.BrowserMultiFormatReader();
const output = document.getElementById("output");
const fileInput = document.getElementById("fileInput");

let lastIBAN = "";
let lastRef = "";
let lastAmount = "";

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  codeReader.decodeFromImage(undefined, URL.createObjectURL(file))
    .then(result => handleResult(result.text))
    .catch(() => output.textContent = "Ne mogu očitati barkod.");
});

function startCamera() {
  codeReader.decodeFromVideoDevice(null, 'video', (result) => {
    if (result) handleResult(result.text);
  });
}

function handleResult(text) {
  lastAmount = extractAmount(text);

  const parsed = parseHUB3(text);
  output.textContent = parsed;

  if (lastIBAN) navigator.clipboard.writeText(lastIBAN);
}

function parseHUB3(text) {
  const lines = text.replace(/\r/g,'').split('\n');

  let iban = null;
  let model = null;
  let poziv = null;

  for (let l of lines) {

    const ib = l.match(/HR\d{2}[A-Z0-9]{17,}/);
    if (!iban && ib) iban = ib[0];

    const m = l.match(/^(HR)?(\d{2})$/);
    if (!model && m) model = "HR" + m[2];

    const p = l.match(/^\d+(-\d+)+$/);
    if (!poziv && p) poziv = p[0];
  }

  if (!model || !poziv) {
    return "Greška: ne mogu očitati podatke.";
  }

  lastIBAN = iban || "";
  lastRef = model + " " + poziv;

  let out = "";

  if (iban) {
    const valid = validateIBAN(iban);
    out += "IBAN: " + iban + (valid ? " ✔" : " ✖") + "\n\n";
  }

  out += "Model + poziv: " + lastRef + "\n\n";
  out += sepaFormat();

  return out;
}

function sepaFormat() {
  return `SEPA FORMAT
IBAN: ${lastIBAN}
REFERENCE: ${lastRef}`;
}

// IBAN VALIDACIJA (MOD 97)
function validateIBAN(iban) {
  const moved = iban.slice(4) + iban.slice(0,4);

  let expanded = "";
  for (let c of moved) {
    if (/[A-Z]/.test(c)) expanded += (c.charCodeAt(0)-55);
    else expanded += c;
  }

  return BigInt(expanded) % 97n === 1n;
}
function extractAmount(text) {
  const normal = text.match(/\b\d{1,3}([.,]\d{3})*([.,]\d{2})\b/);
  if (normal) {
    return normal[0].replace(',', '.');
  }

  const raw = text.match(/\b\d{7,}\b/);
  if (raw) {
    const num = parseInt(raw[0], 10);
    if (!isNaN(num)) {
      return (num / 100).toFixed(2);
    }
  }

  return "";
}
// COPY FUNKCIJE
function copyIBAN() {
  if (lastIBAN) navigator.clipboard.writeText(lastIBAN);
}

function copyRef() {
  if (lastRef) navigator.clipboard.writeText(lastRef);
}

function openRevolut() {
  window.location.href = "revolut://";
}
