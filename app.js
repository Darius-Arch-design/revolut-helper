const codeReader = new ZXing.BrowserMultiFormatReader();

const els = {
  fileInput: document.getElementById("fileInput"),
  video: document.getElementById("video"),
  qrContainer: document.getElementById("qrContainer"),
  statusBox: document.getElementById("statusBox"),
  warningsBox: document.getElementById("warningsBox"),
  rawBox: document.getElementById("rawBox"),

  recipientField: document.getElementById("recipientField"),
  ibanField: document.getElementById("ibanField"),
  refField: document.getElementById("refField"),
  amountField: document.getElementById("amountField"),
  descField: document.getElementById("descField"),
  validationField: document.getElementById("validationField"),

  startCameraBtn: document.getElementById("startCameraBtn"),
  stopCameraBtn: document.getElementById("stopCameraBtn"),
  rescanBtn: document.getElementById("rescanBtn"),

  copyIbanBtn: document.getElementById("copyIbanBtn"),
  copyRefBtn: document.getElementById("copyRefBtn"),
  copySepaBtn: document.getElementById("copySepaBtn"),
  openRevolutBtn: document.getElementById("openRevolutBtn")
};

const HUB3_HEADER_RE = /^HRVHUB3\d$/i;

const state = {
  rawText: "",
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
  resetUiOnly();
  exposeLegacyFunctions();
}

function bindEvents() {
  els.fileInput?.addEventListener("change", onFileSelected);
  els.startCameraBtn?.addEventListener("click", startCamera);
  els.stopCameraBtn?.addEventListener("click", stopCamera);
  els.rescanBtn?.addEventListener("click", resetAll);

  els.copyIbanBtn?.addEventListener("click", copyIBAN);
  els.copyRefBtn?.addEventListener("click", copyRef);
  els.copySepaBtn?.addEventListener("click", copySepa);
  els.openRevolutBtn?.addEventListener("click", openRevolut);
}

function exposeLegacyFunctions() {
  window.startCamera = startCamera;
  window.stopCamera = stopCamera;
  window.copyIBAN = copyIBAN;
  window.copyRef = copyRef;
  window.openRevolut = openRevolut;
}

/* ---------------- FLOW ---------------- */

async function onFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  resetParsedData();
  setStatus("Čitam sliku...", "warn");

  try {
    const img = await loadImageFromFile(file);
    const result = await codeReader.decodeFromImageElement(img);

    if (!result || !result.text) {
      throw new Error("Kod nije očitan.");
    }

    processDecodedText(result.text, "slika");
  } catch (err) {
    console.error(err);
    setStatus("Ne mogu očitati QR/PDF417 iz slike.", "err");
  }
}

async function startCamera() {
  if (state.scanning) return;

  resetParsedData();
  setStatus("Pokrećem kameru...", "warn");

  try {
    state.locked = false;
    state.scanning = true;

    if (els.startCameraBtn) els.startCameraBtn.disabled = true;
    if (els.stopCameraBtn) els.stopCameraBtn.disabled = false;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    state.mediaStream = stream;

    if (els.video) {
      els.video.srcObject = stream;
      try { await els.video.play(); } catch (_) {}
    }

    setStatus("Kamera je aktivna. Usmjeri barkod prema kameri.", "warn");

    await codeReader.decodeFromVideoDevice(null, "video", (result) => {
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
  try { codeReader.reset(); } catch (_) {}

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
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
    state.payment.sepaText = generateEpcPayload(parsed);
    window.sepaText = state.payment.sepaText;
    renderQr(state.payment.sepaText);
    setStatus(`Skeniranje uspješno (${source}). EPC QR generiran.`, "ok");
  } else {
    state.payment.sepaText = "";
    window.sepaText = "";
    clearQr("Nedostaju obvezni podaci za EPC QR.");
    setStatus(`Skeniranje uspješno (${source}), ali podaci nisu dovoljno valjani za EPC QR.`, "warn");
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

  payment.format = "HUB3";
  payment.header = fields[0];
  payment.currency = normalizeCurrency(fields[1]);
  payment.amount = parseHubAmount(fields[2]);
  payment.payerName = cleanField(fields[3], 60);
  payment.payerAddress1 = cleanField(fields[4], 60);
  payment.payerAddress2 = cleanField(fields[5], 60);

  payment.recipientName = cleanField(fields[6], 70);
  payment.recipientAddress1 = cleanField(fields[7], 70);
  payment.recipientAddress2 = cleanField(fields[8], 70);

  payment.accountRaw = cleanField(fields[9], 40);
  payment.iban = extractValidIbanFromField(payment.accountRaw);

  payment.model = normalizeModel(fields[10]);
  payment.referenceNumber = normalizeReference(fields[11]);
  payment.combinedReference = buildCombinedReference(payment.model, payment.referenceNumber);

  payment.purposeCode = normalizePurposeCode(fields[12]);
  payment.description = cleanField(fields[13], 140);

  return payment;
}

function splitHub3Fields(text) {
  let fields = text
    .replace(/\r/g, "\n")
    .split("\n");

  while (fields.length && fields[fields.length - 1] === "") {
    fields.pop();
  }

  fields = fields.map(f => f.replace(/\u0000/g, "").trim());

  if (fields.length > 14) {
    const first13 = fields.slice(0, 13);
    const rest = fields.slice(13).filter(Boolean).join(" ");
    fields = [...first13, rest];
  }

  return fields;
}

function parseFallback(text) {
  const payment = emptyPayment();
  const lines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  payment.format = "fallback";
  payment.iban = findValidIbanAnywhere(lines);
  payment.model = findModel(lines);
  payment.referenceNumber = findReference(lines);
  payment.combinedReference = buildCombinedReference(payment.model, payment.referenceNumber);
  payment.amount = findAmountAnywhere(lines);
  payment.recipientName = findLikelyRecipient(lines, payment.iban);
  payment.description = findLikelyDescription(lines, payment);

  return payment;
}

/* ---------------- FIELD NORMALIZATION ---------------- */

function emptyPayment() {
  return {
    format: "",
    header: "",
    currency: "EUR",
    amount: 
