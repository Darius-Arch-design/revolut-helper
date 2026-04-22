const CHARSET_CANDIDATES = ["ISO-8859-2", "windows-1250", "UTF-8"];
const DEFAULT_CAMERA_CHARSET = "ISO-8859-2";
const HUB3_HEADER_RE = /^HRVHUB3\d$/i;
const EPC_MAX_BYTES = 331;
const MAX_PDF_PAGES_TO_SCAN = 5;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

let codeReader = createCodeReader(DEFAULT_CAMERA_CHARSET);

const els = {
  fileInput: document.getElementById("fileInput"),
  video: document.getElementById("video"),
  qrContainer: document.getElementById("qrContainer"),
  statusBox: document.getElementById("statusBox"),
  warningsBox: document.getElementById("warningsBox"),
  rawBox: document.getElementById("rawBox"),

  parserField: document.getElementById("parserField"),
  currencyField: document.getElementById("currencyField"),
  purposeField: document.getElementById("purposeField"),

  payerField: document.getElementById("payerField"),
  recipientField: document.getElementById("recipientField"),
  ibanField: document.getElementById("ibanField"),
  accountRawField: document.getElementById("accountRawField"),
  refField: document.getElementById("refField"),
  amountField: document.getElementById("amountField"),
  descField: document.getElementById("descField"),
  validationField: document.getElementById("validationField"),

  payerAddress1Field: document.getElementById("payerAddress1Field"),
  payerAddress2Field: document.getElementById("payerAddress2Field"),
  recipientAddress1Field: document.getElementById("recipientAddress1Field"),
  recipientAddress2Field: document.getElementById("recipientAddress2Field"),
  headerField: document.getElementById("headerField"),

  startCameraBtn: document.getElementById("startCameraBtn"),
  stopCameraBtn: document.getElementById("stopCameraBtn"),
  rescanBtn: document.getElementById("rescanBtn"),

  copyIbanBtn: document.getElementById("copyIbanBtn"),
  copyRefBtn: document.getElementById("copyRefBtn"),
  copySepaBtn: document.getElementById("copySepaBtn"),
  shareQrBtn: document.getElementById("shareQrBtn"),
  saveQrBtn: document.getElementById("saveQrBtn"),
  openRevolutBtn: document.getElementById("openRevolutBtn")
};

const state = {
  rawText: "",
  rawTextOriginal: "",
  lastScanHash: "",
  scanning: false,
  locked: false,
  mediaStream: null,
  payment: emptyPayment(),
  validation: emptyValidation()
};

init();

function init() {
  bindEvents();
  resetParsedData();
  exposeLegacyFunctions();
}

function createCodeReader(charset) {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.QR_CODE,
    ZXing.BarcodeFormat.PDF_417
  ]);

  if (charset) {
    hints.set(ZXing.DecodeHintType.CHARACTER_SET, charset);
  }

  return new ZXing.BrowserMultiFormatReader(hints);
}

function bindEvents() {
  if (els.fileInput) els.fileInput.addEventListener("change", onFileSelected);
  if (els.startCameraBtn) els.startCameraBtn.addEventListener("click", startCamera);
  if (els.stopCameraBtn) els.stopCameraBtn.addEventListener("click", stopCamera);
  if (els.rescanBtn) els.rescanBtn.addEventListener("click", resetAll);

  if (els.copyIbanBtn) els.copyIbanBtn.addEventListener("click", copyIBAN);
  if (els.copyRefBtn) els.copyRefBtn.addEventListener("click", copyRef);
  if (els.copySepaBtn) els.copySepaBtn.addEventListener("click", copySepa);
  if (els.shareQrBtn) els.shareQrBtn.addEventListener("click", shareQrImage);
  if (els.saveQrBtn) els.saveQrBtn.addEventListener("click", saveQrImage);
  if (els.openRevolutBtn) els.openRevolutBtn.addEventListener("click", openRevolut);
}

function exposeLegacyFunctions() {
  window.startCamera = startCamera;
  window.stopCamera = stopCamera;
  window.copyIBAN = copyIBAN;
  window.copyRef = copyRef;
  window.openRevolut = openRevolut;
}

function emptyPayment() {
  return {
    parser: "",
    format: "",
    header: "",
    currency: "EUR",
    amount: "",

    payerName: "",
    payerAddress1: "",
    payerAddress2: "",

    recipientName: "",
    recipientAddress1: "",
    recipientAddress2: "",

    accountRaw: "",
    iban: "",

    model: "",
    referenceNumber: "",
    combinedReference: "",

    purposeCode: "",
    description: "",

    sepaText: "",
    sepaEncodingUsed: "1",
    sepaCharsetLabel: "UTF-8"
  };
}

function emptyValidation() {
  return {
    errors: [],
    warnings: [],
    validForEpc: false
  };
}

/* ---------------- FLOW ---------------- */

async function onFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  resetParsedData();

  try {
    if (isPdfFile(file)) {
      setStatus("Čitam PDF i pokušavam očitati barkod...", "warn");
      const decoded = await decodePdfFile(file);
      processDecodedText(decoded.text, "pdf");
    } else {
      setStatus("Čitam sliku...", "warn");
      const img = await loadImageFromFile(file);
      const decoded = await decodeImageWithFallback(img);
      processDecodedText(decoded.text, "slika");
    }
  } catch (err) {
    console.error(err);
    setStatus("Ne mogu očitati QR/PDF417 iz odabrane datoteke.", "err");
  }
}

function isPdfFile(file) {
  if (!file) return false;
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

async function decodePdfFile(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js nije učitan.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pagesToTry = Math.min(pdf.numPages, MAX_PDF_PAGES_TO_SCAN);

  for (let pageNumber = 1; pageNumber <= pagesToTry; pageNumber++) {
    setStatus("Čitam PDF stranicu " + pageNumber + " od " + pagesToTry + "...", "warn");

    const img = await renderPdfPageToImage(pdf, pageNumber);
    try {
      const decoded = await decodeImageWithFallback(img);
      return decoded;
    } catch (_) {}
  }

  throw new Error("Barkod nije pronađen ni na jednoj podržanoj PDF stranici.");
}

async function renderPdfPageToImage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const scale = 2.2;
  const viewport = page.getViewport({ scale: scale });
  const outputScale = window.devicePixelRatio || 1;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = Math.floor(viewport.width) + "px";
  canvas.style.height = Math.floor(viewport.height) + "px";

  await page.render({
    canvasContext: ctx,
    viewport: viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
  }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  return loadImageFromDataUrl(dataUrl);
}

async function decodeImageWithFallback(img) {
  let best = null;
  let bestScore = -Infinity;

  for (const charset of CHARSET_CANDIDATES) {
    const reader = createCodeReader(charset);
    try {
      const result = await reader.decodeFromImageElement(img);
      if (result && result.text) {
        const normalized = normalizeRawText(result.text);
        const score = scoreDecodedCandidate(normalized);

        if (score > bestScore) {
          best = { text: result.text, charset: charset };
          bestScore = score;
        }
      }
    } catch (_) {
    } finally {
      try { reader.reset(); } catch (_) {}
    }
  }

  if (!best) {
    throw new Error("Kod nije očitan.");
  }

  return best;
}

function scoreDecodedCandidate(text) {
  const v = text || "";
  let score = 0;

  const letters = v.match(/\p{L}/gu);
  if (letters) score += letters.length * 1.2;

  const croatianLetters = v.match(/[čČćĆšŠžŽđĐ]/g);
  if (croatianLetters) score += croatianLetters.length * 4;

  const mojibake = v.match(/(Ã.|Ä.|Å.|�)/g);
  if (mojibake) score -= mojibake.length * 8;

  return score;
}

async function startCamera() {
  if (state.scanning) return;

  resetParsedData();
  setStatus("Pokrećem kameru...", "warn");

  try {
    state.locked = false;
    state.scanning = true;
    codeReader = createCodeReader(DEFAULT_CAMERA_CHARSET);

    if (els.startCameraBtn) els.startCameraBtn.disabled = true;
    if (els.stopCameraBtn) els.stopCameraBtn.disabled = false;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    state.mediaStream = stream;

    if (els.video) {
      els.video.srcObject = stream;
      try {
        await els.video.play();
      } catch (_) {}
    }

    setStatus("Kamera je aktivna. Usmjeri barkod prema kameri.", "warn");

    await codeReader.decodeFromVideoDevice(null, "video", function (result) {
      if (state.locked) return;
      if (result && result.text) {
        state.locked = true;
        processDecodedText(result.text, "kamera");
        stopCamera();
      }
    });
  } catch (err) {
    console.error(err);
    state.scanning = false;
    if (els.startCameraBtn) els.startCameraBtn.disabled = false;
    if (els.stopCameraBtn) els.stopCameraBtn.disabled = true;
    setStatus("Kamera nije dostupna ili dozvola nije odobrena.", "err");
  }
}

function stopCamera() {
  try {
    if (codeReader) codeReader.reset();
  } catch (_) {}

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(function (track) {
      track.stop();
    });
    state.mediaStream = null;
  }

  if (els.video && els.video.srcObject) {
    els.video.srcObject = null;
  }

  state.scanning = false;
  state.locked = false;

  if (els.startCameraBtn) els.startCameraBtn.disabled = false;
  if (els.stopCameraBtn) els.stopCameraBtn.disabled = true;
}

function processDecodedText(text, source) {
  state.rawTextOriginal = normalizeLineEndings(text);
  const normalizedText = normalizeRawText(text);
  const scanHash = normalizedText.replace(/\s+/g, " ").trim();

  if (!scanHash || scanHash === state.lastScanHash) return;

  state.lastScanHash = scanHash;
  state.rawText = normalizedText;

  const parsed = parseCode(normalizedText);
  state.payment = parsed;

  const validation = validatePayment(parsed);
  state.validation = validation;

  if (validation.validForEpc) {
    const epc = generateEpcPayload(parsed);
    state.payment.sepaText = epc.payload;
    state.payment.sepaEncodingUsed = epc.encoding;
    state.payment.sepaCharsetLabel = epc.charsetLabel;
    window.sepaText = state.payment.sepaText;
    renderQr(state.payment.sepaText);
    setStatus("Skeniranje uspješno (" + source + "). EPC QR generiran.", "ok");
  } else {
    state.payment.sepaText = "";
    window.sepaText = "";
    clearQr("Nedostaju obvezni podaci za EPC QR.");
    setStatus("Skeniranje uspješno (" + source + "), ali podaci nisu dovoljno valjani za EPC QR.", "warn");
  }

  renderParsedData();
  updateButtons();
}

/* ---------------- PARSING ---------------- */

function parseCode(text) {
  const strict = parseHub3Strict(text);
  if (strict) return strict;
  return parseFallback(text);
}

function parseHub3Strict(text) {
  const fields = splitHub3Fields(text);
  if (fields.length < 14) return null;
  if (!HUB3_HEADER_RE.test(fields[0])) return null;

  const payment = emptyPayment();

  payment.parser = "HUB3";
  payment.format = "HUB3";
  payment.header = fields[0];

  payment.currency = normalizeCurrency(fields[1]);
  payment.amount = parseHubAmount(fields[2]);

  payment.payerName = cleanDisplayField(fields[3], 70);
  payment.payerAddress1 = cleanDisplayField(fields[4], 70);
  payment.payerAddress2 = cleanDisplayField(fields[5], 70);

  payment.recipientName = cleanDisplayField(fields[6], 70);
  payment.recipientAddress1 = cleanDisplayField(fields[7], 70);
  payment.recipientAddress2 = cleanDisplayField(fields[8], 70);

  payment.accountRaw = cleanDisplayField(fields[9], 50);
  payment.iban = extractValidIbanFromField(payment.accountRaw);

  payment.model = normalizeModel(fields[10]);
  payment.referenceNumber = normalizeReference(fields[11]);
  payment.combinedReference = buildCombinedReference(payment.model, payment.referenceNumber);

  payment.purposeCode = normalizePurposeCode(fields[12]);
  payment.description = cleanDisplayField(fields[13], 140);

  return payment;
}

function splitHub3Fields(text) {
  let fields = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map(function (v) {
      return v.replace(/\u0000/g, "").trim();
    });

  while (fields.length && fields[fields.length - 1] === "") {
    fields.pop();
  }

  if (fields.length > 14) {
    const first13 = fields.slice(0, 13);
    const mergedDescription = fields.slice(13).filter(Boolean).join(" ");
    fields = first13.concat([mergedDescription]);
  }

  return fields;
}

function parseFallback(text) {
  const payment = emptyPayment();
  const lines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean);

  payment.parser = "fallback";
  payment.format = "fallback";
  payment.header = lines[0] && HUB3_HEADER_RE.test(lines[0]) ? lines[0] : "";

  payment.currency = findCurrency(lines);
  payment.amount = findAmountAnywhere(lines);

  payment.iban = findValidIbanAnywhere(lines);
  payment.accountRaw = payment.iban || "";

  payment.model = findModel(lines);
  payment.referenceNumber = findReference(lines);
  payment.combinedReference = buildCombinedReference(payment.model, payment.referenceNumber);

  payment.purposeCode = findPurposeCode(lines);
  payment.payerName = findLikelyPayer(lines);
  payment.recipientName = findLikelyRecipient(lines, payment.iban);
  payment.description = findLikelyDescription(lines, payment);

  return payment;
}

/* ---------------- NORMALIZATION ---------------- */

function normalizeLineEndings(text) {
  return (text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function normalizeRawText(text) {
  let v = normalizeLineEndings(text);
  v = bestEffortCharsetRepair(v);
  v = repairMojibakeCroatian(v);
  v = normalizeUnicodeDisplay(v);
  return v;
}

function normalizeUnicodeDisplay(value) {
  return (value || "")
    .normalize("NFC")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ");
}

function bestEffortCharsetRepair(value) {
  const base = value || "";
  const candidates = [base];

  for (const enc of ["utf-8", "windows-1250", "iso-8859-2"]) {
    candidates.push(decodeByteLikeString(base, enc));
  }

  let best = base;
  let bestScore = scoreCroatianText(base);

  for (const candidate of candidates) {
    const repaired = repairMojibakeCroatian(candidate);
    const score = scoreCroatianText(repaired);
    if (score > bestScore) {
      best = repaired;
      bestScore = score;
    }
  }

  return best;
}

function decodeByteLikeString(value, encoding) {
  try {
    const bytes = new Uint8Array(Array.from(value || "", function (ch) {
      return ch.charCodeAt(0) & 0xff;
    }));
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch (_) {
    return value;
  }
}

function scoreCroatianText(value) {
  const v = value || "";
  let score = 0;

  const validLetters = v.match(/\p{L}/gu);
  if (validLetters) score += validLetters.length * 1.2;

  const croatianLetters = v.match(/[čČćĆšŠžŽđĐ]/g);
  if (croatianLetters) score += croatianLetters.length * 4;

  const mojibake = v.match(/(Ã.|Ä.|Å.|�)/g);
  if (mojibake) score -= mojibake.length * 8;

  const words = v.match(/\p{L}+/gu);
  if (words) score += words.length * 0.5;

  return score;
}

function repairMojibakeCroatian(value) {
  let v = value || "";

  const replacements = [
    ["Ä", "č"],
    ["Ä", "Č"],
    ["Äć", "ć"],
    ["Ä‡", "ć"],
    ["Ä", "ć"],
    ["Ä†", "Ć"],
    ["Ä", "Ć"],
    ["Å¡", "š"],
    ["Å ", "Š"],
    ["ÅŠ", "Š"],
    ["Å¾", "ž"],
    ["Å½", "Ž"],
    ["Ä‘", "đ"],
    ["Ä", "Đ"],
    ["Ð", "Đ"],
    ["ð", "đ"],
    ["Ã„Â", "č"],
    ["Ã„Â", "Č"],
    ["Ã„Â‡", "ć"],
    ["Ã„Â", "ć"],
    ["Ã„Â†", "Ć"],
    ["Ã„Â", "Ć"],
    ["Ã…Â¡", "š"],
    ["Ã…Â ", "Š"],
    ["Ã…Â¾", "ž"],
    ["Ã…Â½", "Ž"],
    ["Ã„Â‘", "đ"],
    ["Ã„Â", "Đ"]
  ];

  for (const pair of replacements) {
    v = v.split(pair[0]).join(pair[1]);
  }

  return v;
}

function cleanDisplayField(value, maxLen) {
  const len = typeof maxLen === "number" ? maxLen : 140;
  return normalizeUnicodeDisplay(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, len);
}

function normalizeCurrency(value) {
  const v = cleanDisplayField(value, 3).toUpperCase();
  return v || "EUR";
}

function parseHubAmount(value) {
  const digits = (value || "").replace(/[^\d]/g, "");
  if (!digits) return "";

  const cents = Number(digits);
  if (!Number.isFinite(cents) || cents < 0) return "";

  return (cents / 100).toFixed(2);
}

function normalizeModel(value) {
  const raw = cleanDisplayField(value, 10).replace(/\s+/g, "").toUpperCase();
  if (!raw) return "";
  if (/^HR\d{2}$/.test(raw)) return raw;
  if (/^\d{2}$/.test(raw)) return "HR" + raw;
  return raw;
}

function normalizeReference(value) {
  return cleanDisplayField(value, 80).replace(/\s+/g, "");
}

function normalizePurposeCode(value) {
  const v = cleanDisplayField(value, 10).replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{4}$/.test(v) ? v : "";
}

function buildCombinedReference(model, referenceNumber) {
  if (model && referenceNumber) return model + " " + referenceNumber;
  return referenceNumber || model || "";
}

/* ---------------- VALIDATION ---------------- */

function validatePayment(payment) {
  const errors = [];
  const warnings = [];

  if (!payment.iban && payment.accountRaw) {
    errors.push("Polje računa je pronađeno, ali ne sadrži valjan IBAN.");
  }

  if (!payment.iban && !payment.accountRaw) {
    errors.push("IBAN primatelja nije pronađen.");
  }

  if (payment.iban && !validateIBAN(payment.iban)) {
    errors.push("IBAN je pronađen, ali nije valjan.");
