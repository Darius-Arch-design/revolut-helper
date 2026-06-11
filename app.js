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
      setStatus("Čitam sliku iz uređaja...", "warn");
      const decoded = await decodeImageFileRobust(file);
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
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = Math.floor(viewport.width) + "px";
  canvas.style.height = Math.floor(viewport.height) + "px";

  await page.render({
    canvasContext: ctx,
    viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
  }).promise;

  return loadImageFromDataUrl(canvas.toDataURL("image/png"));
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
          best = { text: result.text, charset };
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

async function decodeImageFileRobust(file) {
  const source = await loadBitmapFromFile(file);
  const variants = buildImageVariants(source);

  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < variants.length; i++) {
    setStatus("Analiziram sliku iz uređaja... pokušaj " + (i + 1) + " / " + variants.length, "warn");
    const decoded = await decodeCanvasWithCharsetFallback(variants[i]);

    if (decoded && decoded.text) {
      const normalized = normalizeRawText(decoded.text);
      const score = scoreDecodedCandidate(normalized);

      if (score > bestScore) {
        best = decoded;
        bestScore = score;
      }
    }
  }

  if (!best) {
    throw new Error("Kod nije očitan iz slike.");
  }

  return best;
}

async function loadBitmapFromFile(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (_) {}
  }

  const img = await loadImageFromFile(file);
  const fallbackCanvas = document.createElement("canvas");
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  fallbackCanvas.width = w;
  fallbackCanvas.height = h;
  const ctx = fallbackCanvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return fallbackCanvas;
}

function buildImageVariants(source) {
  const variants = [];

  const normal = drawSourceToCanvas(source, {
    maxSide: 2200,
    grayscale: false,
    threshold: false,
    contrastBoost: 1
  });
  variants.push(normal);

  const grayscale = drawSourceToCanvas(source, {
    maxSide: 2200,
    grayscale: true,
    threshold: false,
    contrastBoost: 1.15
  });
  variants.push(grayscale);

  const thresholded = drawSourceToCanvas(source, {
    maxSide: 2200,
    grayscale: true,
    threshold: true,
    contrastBoost: 1.2
  });
  variants.push(thresholded);

  variants.push(rotateCanvas(normal, 90));
  variants.push(rotateCanvas(normal, 180));
  variants.push(rotateCanvas(normal, 270));

  variants.push(rotateCanvas(grayscale, 90));
  variants.push(rotateCanvas(grayscale, 180));
  variants.push(rotateCanvas(grayscale, 270));

  return variants;
}

function drawSourceToCanvas(source, options) {
  const opts = options || {};
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;

  const maxSide = opts.maxSide || 2200;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  if (opts.grayscale || opts.threshold || opts.contrastBoost !== 1) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const contrastBoost = opts.contrastBoost || 1;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (contrastBoost !== 1) {
        r = clampColor((((r / 255 - 0.5) * contrastBoost) + 0.5) * 255);
        g = clampColor((((g / 255 - 0.5) * contrastBoost) + 0.5) * 255);
        b = clampColor((((b / 255 - 0.5) * contrastBoost) + 0.5) * 255);
      }

      if (opts.grayscale || opts.threshold) {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        r = gray;
        g = gray;
        b = gray;
      }

      if (opts.threshold) {
        const bw = r > 160 ? 255 : 0;
        r = bw;
        g = bw;
        b = bw;
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

function rotateCanvas(sourceCanvas, degrees) {
  const radians = degrees * Math.PI / 180;
  const swapSides = degrees === 90 || degrees === 270;

  const canvas = document.createElement("canvas");
  canvas.width = swapSides ? sourceCanvas.height : sourceCanvas.width;
  canvas.height = swapSides ? sourceCanvas.width : sourceCanvas.height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return canvas;
}

async function decodeCanvasWithCharsetFallback(canvas) {
  let best = null;
  let bestScore = -Infinity;

  for (const charset of CHARSET_CANDIDATES) {
    const reader = createCodeReader(charset);

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const img = await loadImageFromDataUrl(dataUrl);
      const result = await reader.decodeFromImageElement(img);

      if (result && result.text) {
        const normalized = normalizeRawText(result.text);
        const score = scoreDecodedCandidate(normalized);

        if (score > bestScore) {
          best = { text: result.text, charset };
          bestScore = score;
        }
      }
    } catch (_) {
    } finally {
      try { reader.reset(); } catch (_) {}
    }
  }

  return best;
}

function clampColor(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function scoreDecodedCandidate(text) {
  const v = text || "";
  let score = 0;

  const letters = v.match(/[A-Za-zČĆĐŠŽčćđšž]/g);
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
  parsed.combinedReference = buildCombinedReference(parsed.model, parsed.referenceNumber);
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

  const validLetters = v.match(/[A-Za-zČĆĐŠŽčćđšž]/g);
  if (validLetters) score += validLetters.length * 1.2;

  const croatianLetters = v.match(/[čČćĆšŠžŽđĐ]/g);
  if (croatianLetters) score += croatianLetters.length * 4;

  const mojibake = v.match(/(Ã.|Ä.|Å.|�)/g);
  if (mojibake) score -= mojibake.length * 8;

  const words = v.match(/[A-Za-zČĆĐŠŽčćđšž]{2,}/g);
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
  const raw = cleanDisplayField(value, 20).toUpperCase();
  const compact = raw.replace(/\s+/g, "");

  if (!compact) return "";

  const exact = compact.match(/^HR(\d{2})$/);
  if (exact) return "HR" + exact[1];

  const onlyDigits = compact.match(/^(\d{2})$/);
  if (onlyDigits) return "HR" + onlyDigits[1];

  const embedded = compact.match(/HR(\d{2})/);
  if (embedded) return "HR" + embedded[1];

  return "";
}

function normalizeReference(value) {
  return cleanDisplayField(value, 80)
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9\-\/.]/g, "");
}

function normalizePurposeCode(value) {
  const v = cleanDisplayField(value, 10).replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{4}$/.test(v) ? v : "";
}

function buildCombinedReference(model, referenceNumber) {
  const cleanModel = (model || "").replace(/\s+/g, "").toUpperCase();
  const cleanRef = (referenceNumber || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9\-\/.]/g, "");

  if (cleanModel && cleanRef) return cleanModel + " " + cleanRef;
  if (cleanRef) return cleanRef;
  if (cleanModel) return cleanModel;

  return "";
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
  }

  if (!payment.recipientName) {
    errors.push("Naziv primatelja nije pronađen.");
  }

  if (!payment.amount) {
    warnings.push("Iznos nije pronađen.");
  }

  if (!payment.combinedReference) {
    warnings.push("Model i poziv nisu pronađeni.");
  }

  if (!payment.description) {
    warnings.push("Opis plaćanja nije pronađen.");
  }

  return {
    errors,
    warnings,
    validForEpc: errors.length === 0
  };
}

function validateIBAN(iban) {
  const value = (iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value)) return false;

  const rearranged = value.slice(4) + value.slice(0, 4);
  let expanded = "";

  for (let i = 0; i < rearranged.length; i++) {
    const ch = rearranged[i];
    expanded += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  }

  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (remainder * 10 + Number(expanded[i])) % 97;
  }

  return remainder === 1;
}

function extractValidIbanFromField(value) {
  const compact = (value || "").replace(/\s+/g, "").toUpperCase();
  const matches = compact.match(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/g) || [];
  for (let i = 0; i < matches.length; i++) {
    if (validateIBAN(matches[i])) return matches[i];
  }
  return "";
}

function findValidIbanAnywhere(lines) {
  for (let i = 0; i < lines.length; i++) {
    const found = extractValidIbanFromField(lines[i]);
    if (found) return found;
  }
  return "";
}

/* ---------------- EPC ---------------- */

function generateEpcPayload(payment) {
  const iban = (payment.iban || "").replace(/\s+/g, "").toUpperCase();
  const amount = payment.amount ? "EUR" + Number(payment.amount).toFixed(2) : "";
  const combinedReference = buildCombinedReference(payment.model, payment.referenceNumber);

  const structuredReference = isIso11649Reference(payment.referenceNumber)
    ? payment.referenceNumber.replace(/\s+/g, "").toUpperCase()
    : "";

  const nameUtf8 = toEpcField(payment.recipientName, 70, {
    mode: "name",
    transliterate: false
  });

  let remittanceUtf8 = "";
  if (!structuredReference) {
    remittanceUtf8 = toEpcField(combinedReference, 140, {
      mode: "text",
      transliterate: false
    });
  }

  let payload = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    nameUtf8,
    iban,
    amount,
    "",
    structuredReference,
    remittanceUtf8,
    ""
  ].join("\n");

  if (utf8ByteLength(payload) <= EPC_MAX_BYTES) {
    return {
      payload,
      encoding: "1",
      charsetLabel: "UTF-8"
    };
  }

  const nameAscii = toEpcField(payment.recipientName, 70, {
    mode: "name",
    transliterate: true
  });

  let remittanceAscii = "";
  if (!structuredReference) {
    remittanceAscii = toEpcField(combinedReference, 140, {
      mode: "text",
      transliterate: true
    });
  }

  payload = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    nameAscii,
    iban,
    amount,
    "",
    structuredReference,
    remittanceAscii,
    ""
  ].join("\n");

  if (utf8ByteLength(payload) <= EPC_MAX_BYTES) {
    return {
      payload,
      encoding: "1",
      charsetLabel: "UTF-8 / transliterirano"
    };
  }

  const shortenedRemittance = trimUtf8Bytes(remittanceAscii, 70);

  payload = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    nameAscii,
    iban,
    amount,
    "",
    structuredReference,
    shortenedRemittance,
    ""
  ].join("\n");

  return {
    payload,
    encoding: "1",
    charsetLabel: "UTF-8 / skraćeno"
  };
}

function isIso11649Reference(value) {
  const ref = (value || "").replace(/\s+/g, "").toUpperCase();
  return /^RF\d{2}[A-Z0-9]{1,21}$/.test(ref);
}

function toEpcField(value, maxLen, options) {
  const opts = options || {};
  let v = cleanDisplayField(value || "", maxLen);

  if (opts.transliterate) {
    v = transliterateCroatianToLatin(v);
  }

  v = sanitizeEpcText(v, maxLen);

  if (opts.mode === "name") v = v.substring(0, 70);
  if (opts.mode === "text") v = v.substring(0, 140);

  return v;
}

function sanitizeEpcText(value, maxLen) {
  return normalizeUnicodeDisplay(value || "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLen);
}

function transliterateCroatianToLatin(value) {
  return (value || "")
    .replace(/Đ/g, "Dj")
    .replace(/đ/g, "dj")
    .replace(/Č/g, "C")
    .replace(/č/g, "c")
    .replace(/Ć/g, "C")
    .replace(/ć/g, "c")
    .replace(/Š/g, "S")
    .replace(/š/g, "s")
    .replace(/Ž/g, "Z")
    .replace(/ž/g, "z");
}

function utf8ByteLength(str) {
  return new TextEncoder().encode(str).length;
}

function trimUtf8Bytes(str, maxBytes) {
  let out = "";
  for (const ch of str) {
    const next = out + ch;
    if (utf8ByteLength(next) > maxBytes) break;
    out = next;
  }
  return out;
}

/* ---------------- FALLBACK HELPERS ---------------- */

function findCurrency(lines) {
  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].replace(/\s+/g, "").toUpperCase();
    if (compact === "EUR" || compact === "HRK") return compact;
  }
  return "EUR";
}

function findAmountAnywhere(lines) {
  for (let i = 0; i < lines.length; i++) {
    const digitsOnly = lines[i].replace(/[^\d]/g, "");
    if (/^\d{10,15}$/.test(digitsOnly)) {
      const parsed = parseHubAmount(digitsOnly);
      if (parsed) return parsed;
    }

    const m = lines[i].match(/\b\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})\b/);
    if (m) return normalizeDecimalAmount(m[0]);
  }
  return "";
}

function normalizeDecimalAmount(input) {
  const raw = (input || "").replace(/\s/g, "");
  if (raw.indexOf(",") !== -1 && raw.indexOf(".") !== -1) {
    return raw.replace(/\./g, "").replace(",", ".");
  }
  if (raw.indexOf(",") !== -1) return raw.replace(",", ".");
  return raw;
}

function findModel(lines) {
  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].replace(/\s+/g, "").toUpperCase();

    if (/^HR\d{2}$/.test(compact)) return compact;
    if (/^\d{2}$/.test(compact)) return "HR" + compact;

    const embedded = compact.match(/HR(\d{2})/);
    if (embedded) return "HR" + embedded[1];
  }
  return "";
}

function findReference(lines) {
  let best = "";

  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i]
      .replace(/\s+/g, "")
      .replace(/[^A-Za-z0-9\-\/.]/g, "");

    if (/^[A-Z0-9][A-Z0-9\-\/.]{4,79}$/i.test(compact)) {
      if (compact.length > best.length) best = compact;
    }
  }

  return best;
}

function findPurposeCode(lines) {
  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].replace(/\s+/g, "").toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(compact) && compact !== "EUR" && !/^HR\d{2}$/.test(compact)) {
      return compact;
    }
  }
  return "";
}

function hasLetters(value) {
  return /[A-Za-zČĆĐŠŽčćđšž]/.test(value || "");
}

function findLikelyPayer(lines) {
  for (let i = 0; i < lines.length; i++) {
    const clean = cleanDisplayField(lines[i], 80);
    const compact = clean.replace(/\s+/g, "").toUpperCase();

    if (!clean) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (compact === "EUR") continue;
    if (!hasLetters(clean)) continue;
    if (clean.length < 3) continue;

    return clean;
  }

  return "";
}

function findLikelyRecipient(lines, iban) {
  for (let i = 0; i < lines.length; i++) {
    const clean = cleanDisplayField(lines[i], 80);
    const compact = clean.replace(/\s+/g, "").toUpperCase();

    if (!clean) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (compact === "EUR") continue;
    if (compact === (iban || "").toUpperCase()) continue;
    if (!hasLetters(clean)) continue;
    if (clean.length < 3) continue;

    return clean;
  }

  return "";
}

function findLikelyDescription(lines, payment) {
  const taken = {};
  [
    payment.payerName,
    payment.recipientName,
    payment.iban,
    payment.model,
    payment.referenceNumber,
    payment.combinedReference,
    payment.purposeCode
  ].forEach(function (v) {
    if (v) taken[v] = true;
  });

  for (let i = 0; i < lines.length; i++) {
    const clean = cleanDisplayField(lines[i], 140);
    const compact = clean.replace(/\s+/g, "");

    if (!clean) continue;
    if (taken[clean]) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (clean.length < 4) continue;
    if (hasLetters(clean)) return clean;
  }

  return "";
}

/* ---------------- RENDER ---------------- */

function renderParsedData() {
  const p = state.payment;
  const v = state.validation;

  setText(els.parserField, p.parser || "—");
  setText(els.currencyField, p.currency || "—");
  setText(els.purposeField, p.purposeCode || "—");

  setText(els.payerField, p.payerName || "—");
  setText(els.recipientField, p.recipientName || "—");
  setText(els.ibanField, p.iban || "—");
  setText(els.accountRawField, p.accountRaw || "—");
  setText(els.refField, p.combinedReference || "—");
  setText(els.amountField, p.amount ? Number(p.amount).toFixed(2) + " EUR" : "—");
  setText(els.descField, p.description || "—");

  setText(els.payerAddress1Field, p.payerAddress1 || "—");
  setText(els.payerAddress2Field, p.payerAddress2 || "—");
  setText(els.recipientAddress1Field, p.recipientAddress1 || "—");
  setText(els.recipientAddress2Field, p.recipientAddress2 || "—");
  setText(els.headerField, p.header || "—");

  if (v.validForEpc) {
    let msg = "Osnovna validacija prošla.";
    if (p.sepaCharsetLabel) msg += " EPC encoding: " + p.sepaCharsetLabel + ".";
    if (v.warnings.length) msg += " Upozorenja: " + v.warnings.join(" ");
    setText(els.validationField, msg);
  } else {
    setText(els.validationField, v.errors.join(" ") || "—");
  }

  if (els.warningsBox) {
    if (v.errors.length) {
      els.warningsBox.className = "status err";
      els.warningsBox.textContent = "Greške: " + v.errors.join(" ");
    } else if (v.warnings.length) {
      els.warningsBox.className = "status warn";
      els.warningsBox.textContent = "Upozorenja: " + v.warnings.join(" ");
    } else {
      els.warningsBox.className = "status hidden";
      els.warningsBox.textContent = "";
    }
  }

  if (els.rawBox) {
    if (state.rawText) {
      let label = "<strong>Raw sadržaj barkoda:</strong>";
      if (state.rawTextOriginal && state.rawTextOriginal !== state.rawText) {
        label += ' <span style="color:#475569;">(tekst je automatski normaliziran radi dijakritika)</span>';
      }

      els.rawBox.className = "status";
      els.rawBox.innerHTML =
        label +
        '<pre style="margin:8px 0 0; white-space:pre-wrap; word-break:break-word; font-family:Consolas,Monaco,monospace; font-size:12px; line-height:1.5;">' +
        escapeHtml(state.rawText) +
        "</pre>";
    } else {
      els.rawBox.className = "status hidden";
      els.rawBox.textContent = "";
    }
  }
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function renderQr(text) {
  if (!els.qrContainer) return;

  els.qrContainer.innerHTML = "";

  QRCode.toCanvas(
    text,
    {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      }
    },
    function (err, canvas) {
      if (err) {
        console.error(err);
        clearQr("Greška pri generiranju QR-a.");
        return;
      }

      canvas.style.width = "240px";
      canvas.style.height = "240px";
      canvas.style.aspectRatio = "1 / 1";
      canvas.style.display = "block";

      els.qrContainer.appendChild(canvas);
      updateButtons();
    }
  );
}

function clearQr(message) {
  if (!els.qrContainer) return;
  els.qrContainer.innerHTML = '<span class="note">' + escapeHtml(message) + "</span>";
}

function setStatus(message, type) {
  if (!els.statusBox) return;
  els.statusBox.className = "status";
  if (type) els.statusBox.classList.add(type);
  els.statusBox.textContent = message;
}

function updateButtons() {
  const hasIban = !!state.payment.iban;
  const hasRef = !!state.payment.combinedReference;
  const hasSepa = !!state.payment.sepaText;
  const hasCanvas = !!(els.qrContainer && els.qrContainer.querySelector("canvas"));

  if (els.copyIbanBtn) els.copyIbanBtn.disabled = !hasIban;
  if (els.copyRefBtn) els.copyRefBtn.disabled = !hasRef;
  if (els.copySepaBtn) els.copySepaBtn.disabled = !hasSepa;
  if (els.shareQrBtn) els.shareQrBtn.disabled = !(hasSepa && hasCanvas);
  if (els.saveQrBtn) els.saveQrBtn.disabled = !(hasSepa && hasCanvas);
}

function resetUiOnly() {
  [
    els.parserField,
    els.currencyField,
    els.purposeField,
    els.payerField,
    els.recipientField,
    els.ibanField,
    els.accountRawField,
    els.refField,
    els.amountField,
    els.descField,
    els.validationField,
    els.payerAddress1Field,
    els.payerAddress2Field,
    els.recipientAddress1Field,
    els.recipientAddress2Field,
    els.headerField
  ].forEach(function (el) {
    setText(el, "—");
  });

  if (els.warningsBox) {
    els.warningsBox.className = "status hidden";
    els.warningsBox.textContent = "";
  }

  if (els.rawBox) {
    els.rawBox.className = "status hidden";
    els.rawBox.textContent = "";
  }

  clearQr("QR će se pojaviti nakon uspješnog i valjanog parsiranja.");
  updateButtons();
}

function resetParsedData() {
  state.rawText = "";
  state.rawTextOriginal = "";
  state.payment = emptyPayment();
  state.validation = emptyValidation();
  window.sepaText = "";
  resetUiOnly();
}

function resetAll() {
  stopCamera();
  state.lastScanHash = "";
  resetParsedData();
  if (els.fileInput) els.fileInput.value = "";
  setStatus("Čekam skeniranje...");
}

/* ---------------- ACTIONS ---------------- */

async function copyIBAN() {
  if (!state.payment.iban) return;
  await copyText(state.payment.iban, "IBAN kopiran.");
}

async function copyRef() {
  if (!state.payment.combinedReference) return;
  await copyText(state.payment.combinedReference, "Model i poziv kopirani.");
}

async function copySepa() {
  if (!state.payment.sepaText) return;
  await copyText(state.payment.sepaText, "SEPA podaci kopirani.");
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
    setStatus(successMessage, "ok");
  } catch (err) {
    console.error(err);
    setStatus("Kopiranje nije uspjelo.", "err");
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

async function shareQrImage() {
  try {
    const canvas = els.qrContainer ? els.qrContainer.querySelector("canvas") : null;
    if (!canvas) {
      setStatus("QR slika nije dostupna za dijeljenje.", "err");
      return;
    }

    const blob = await canvasToBlob(canvas, "image/png");
    const file = new File([blob], buildQrFilename(), { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({
        files: [file],
        title: "SEPA QR",
        text: "SEPA QR za plaćanje"
      });
      setStatus("Otvoren je share izbornik.", "ok");
      return;
    }

    await saveQrImage();
  } catch (err) {
    console.error(err);
    await saveQrImage();
  }
}

async function saveQrImage() {
  try {
    const canvas = els.qrContainer ? els.qrContainer.querySelector("canvas") : null;

    if (!canvas) {
      setStatus("QR slika nije dostupna za download.", "err");
      return;
    }

    const filename = buildQrFilename();

    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          setStatus("Ne mogu pripremiti QR sliku za download.", "err");
          return;
        }

        const url = URL.createObjectURL(blob);
        triggerDownload(url, filename);
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
        setStatus("QR slika preuzeta.", "ok");
      }, "image/png");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    triggerDownload(dataUrl, filename);
    setStatus("QR slika preuzeta.", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Download QR slike nije uspio.", "err");
  }
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function buildQrFilename() {
  const iban = (state.payment.iban || "qr").replace(/[^A-Z0-9]/gi, "");
  const amount = state.payment.amount ? String(state.payment.amount).replace(".", "-") : "bez-iznosa";
  return "sepa-qr-" + iban.slice(0, 12) + "-" + amount + ".png";
}

function openRevolut() {
  window.location.href = "revolut://";
}

/* ---------------- UTILS ---------------- */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadImageFromFile(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = function () {
      resolve(img);
      setTimeout(function () {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    };

    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Neispravna slika."));
    };

    img.src = objectUrl;
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise(function (resolve, reject) {
    const img = new Image();

    img.onload = function () {
      resolve(img);
    };

    img.onerror = function () {
      reject(new Error("Ne mogu učitati renderiranu sliku."));
    };

    img.src = dataUrl;
  });
}

function canvasToBlob(canvas, type) {
  return new Promise(function (resolve, reject) {
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Blob nije generiran."));
      }, type || "image/png");
      return;
    }

    try {
      const dataUrl = canvas.toDataURL(type || "image/png");
      const parts = dataUrl.split(",");
      const header = parts[0];
      const data = parts[1];
      const mime = header.split(":")[1].split(";")[0];
      const binary = atob(data);
      const array = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }

      resolve(new Blob([array], { type: mime }));
    } catch (err) {
      reject(err);
    }
  });
}
