const CHARSET_CANDIDATES = ["ISO-8859-2", "windows-1250", "UTF-8"];
const DEFAULT_CAMERA_CHARSET = "ISO-8859-2";
const HUB3_HEADER_RE = /^HRVHUB3\d$/i;
const EPC_MAX_BYTES = 331;

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
  setStatus("Čitam sliku...", "warn");

  try {
    const img = await loadImageFromFile(file);
    const decoded = await decodeImageWithFallback(img);

    if (!decoded || !decoded.text) {
      throw new Error("Kod nije očitan.");
    }

    processDecodedText(decoded.text, "slika");
  } catch (err) {
    console.error(err);
    setStatus("Ne mogu očitati QR/PDF417 iz slike.", "err");
  }
}

async function decodeImageWithFallback(img) {
  let lastError = null;

  for (const charset of CHARSET_CANDIDATES) {
    const reader = createCodeReader(charset);

    try {
      const result = await reader.decodeFromImageElement(img);
      if (result && result.text) {
        try { reader.reset(); } catch (_) {}
        return { text: result.text, charset: charset };
      }
    } catch (err) {
      lastError = err;
    } finally {
      try { reader.reset(); } catch (_) {}
    }
  }

  throw lastError || new Error("Kod nije očitan.");
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
  const tried = new Set([base]);

  [
    decodeByteLikeString(base, "utf-8"),
    decodeByteLikeString(base, "windows-1250"),
    decodeByteLikeString(base, "iso-8859-2")
  ].forEach(function (candidate) {
    if (candidate) tried.add(candidate);
  });

  let best = base;
  let bestScore = scoreCroatianText(base);

  tried.forEach(function (candidate) {
    const repaired = repairMojibakeCroatian(candidate);
    const score = scoreCroatianText(repaired);

    if (score > bestScore) {
      best = repaired;
      bestScore = score;
    }
  });

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

  const croMatches = v.match(/[čČćĆšŠžŽđĐ]/g);
  if (croMatches) score += croMatches.length * 5;

  const cleanWords = v.match(/\b(?:Jagnić|Štrokinec|Obrtnička|Čakovec|Međimurje|plin)\b/gi);
  if (cleanWords) score += cleanWords.length * 6;

  const badMatches = v.match(/[ÃÄÅ�]/g);
  if (badMatches) score -= badMatches.length * 5;

  if (v.indexOf("Ä") !== -1) score -= 8;
 
