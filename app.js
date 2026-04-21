const codeReader = new ZXing.BrowserMultiFormatReader();
const output = document.getElementById("output");
const fileInput = document.getElementById("fileInput");

let lastIBAN = "";
let lastRef = "";

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  output.textContent = "Čitam sliku...";

  const img = new Image();

  img.onload = function () {
    codeReader.decodeFromImageElement(img)
      .then(result => handleResult(result.text))
      .catch(() => {
        output.textContent = "Ne mogu očitati barkod.";
      });
  };

  img.src = URL.createObjectURL(file);
});

function startCamera() {
  output.textContent = "Pokrećem kameru...";

  codeReader.decodeFromVideoDevice(null, 'video', (result) => {
    if (result) handleResult(result.text);
  });
}

function handleResult(text) {
  const parsed = parseHUB3(text);
  output.textContent = parsed;

  if (lastIBAN) {
    navigator.clipboard.writeText(lastIBAN);
  }
}

function parseHUB3(text) {
  const lines = text.replace(/\r/g, '').split('\n');

  let iban = null;
  let model = null;
  let poziv = null;

  for (let l of lines) {
    l = l.trim();

    const ib = l.match(/HR\d{2}[A-Z0-9]{17,}/);
    if (!iban && ib) iban = ib[0];

    const m = l.match(/^(HR)?(\d{2})$/);
    if (!model && m) model = "HR" + m[2];

    const p = l.match(/^\d+(-\d+)+$/);
    if (!poziv && p) poziv = p[0];
  }

  if (!model || !poziv) {
    return "Greška: ne mogu očitati model ili poziv na broj.";
  }

  lastIBAN = iban || "";
  lastRef = model + " " + poziv;

  let out = "";

  if (iban) {
    const valid = validateIBAN(iban);
    out += "IBAN: " + iban + (valid ? " ✔" : " ✖") + "\n";
  }

  out += "Model + poziv: " + lastRef;

  return out;
}

function validateIBAN(iban) {
  const moved = iban.slice(4) + iban.slice(0, 4);

  let expanded = "";
  for (let c of moved) {
    if (/[A-Z]/.test(c)) expanded += (c.charCodeAt(0) - 55);
    else expanded += c;
  }

  return BigInt(expanded) % 97n === 1n;
}

function copyIBAN() {
  if (lastIBAN) navigator.clipboard.writeText(lastIBAN);
}

function copyRef() {
  if (lastRef) navigator.clipboard.writeText(lastRef);
}
