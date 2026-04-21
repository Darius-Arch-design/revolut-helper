const codeReader = new ZXing.BrowserMultiFormatReader();
const output = document.getElementById("output");
const qrContainer = document.getElementById("qrContainer");
const fileInput = document.getElementById("fileInput");

let lastIBAN = "";
let lastRef = "";
let lastAmount = "";

/* ---------------- INPUT FILE ---------------- */

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  output.textContent = "Čitam sliku...";

  const img = new Image();

  img.onload = function () {
    codeReader.decodeFromImageElement(img)
      .then(result => handleResult(result.text))
      .catch(() => {
        output.textContent = "Ne mogu očitati QR/barcode.";
      });
  };

  img.src = URL.createObjectURL(file);
});

/* ---------------- CAMERA ---------------- */

function startCamera() {
  output.textContent = "Pokrećem kameru...";

  codeReader.decodeFromVideoDevice(null, "video", (result) => {
    if (result) handleResult(result.text);
  });
}

/* ---------------- MAIN ---------------- */

function handleResult(text) {
  lastAmount = extractAmount(text);

  const parsed = parseCode(text);
  output.textContent = parsed;

  console.log("IBAN RAW:", lastIBAN);
  console.log("IBAN CLEAN:", lastIBAN.replace(/\s/g, "").toUpperCase());

  if (lastIBAN) {
    navigator.clipboard.writeText(lastIBAN);
  }

  const epc = generateEPC();

  qrContainer.innerHTML = "";

  if (epc) {
    QRCode.toCanvas(epc, { width: 220 }, function (err, canvas) {
      if (!err) qrContainer.appendChild(canvas);
    });
  }
}

/* ---------------- PARSER (HR + global IBAN) ---------------- */

function parseCode(text) {
  const lines = text.replace(/\r/g, "").split("\n");

  let iban = null;
  let model = null;
  let poziv = null;

  for (let l of lines) {
    // GLOBAL IBAN (HR, PR, DE, itd.)
    const ib = l.match(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/);
    if (!iban && ib) iban = ib[0];

    const m = l.match(/^(HR)?(\d{2})$/);
    if (!model && m) model = "HR" + m[2];

    const p = l.match(/\d+(-\d+)+/);
    if (!poziv && p) poziv = p[0];
  }

  lastIBAN = iban || "";
  lastRef = model && poziv ? model + " " + poziv : "";

  let out = "";

  if (iban) {
    const valid = validateIBAN(iban);
    out += "IBAN: " + iban + (valid ? " ✔" : " ✖") + "\n\n";
  } else {
    out += "IBAN: nije pronađen\n\n";
  }

  if (lastRef) {
    out += "Model + poziv: " + lastRef + "\n";
  }

  if (lastAmount) {
    out += "Iznos: " + lastAmount + "\n";
  }

  return out;
}

/* ---------------- EPC QR (ISPRAVAN SEPA FORMAT) ---------------- */

function generateEPC() {
  if (!lastIBAN) return null;

  const iban = lastIBAN.replace(/\s/g, "").toUpperCase();
  const amount = lastAmount ? parseFloat(lastAmount).toFixed(2) : "";
  const reference = lastRef || "";

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    "PRIMATELJ",
    iban,
    "EUR",
    amount,
    "",
    "",
    reference,
    ""
  ].join("\n");
}

/* ---------------- AMOUNT ---------------- */

function extractAmount(text) {
  const match = text.match(/\b\d{1,3}([.,]\d{3})*([.,]\d{2})\b/);
  if (match) return match[0].replace(",", ".");
  return "";
}

/* ---------------- COPY ---------------- */

function copyIBAN() {
  if (lastIBAN) navigator.clipboard.writeText(lastIBAN);
}

function copyRef() {
  if (lastRef) navigator.clipboard.writeText(lastRef);
}

/* ---------------- OPEN REVOLUT ---------------- */

function openRevolut() {
  window.location.href = "revolut://";
}
