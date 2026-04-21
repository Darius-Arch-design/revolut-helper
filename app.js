const codeReader = new ZXing.BrowserMultiFormatReader();

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
  resetParsedData();
  exposeLegacyFunctions();
}

function bindEvents() {
  if (els.fileInput) els.fileInput.addEventListener("change", onFileSelected);
  if (els.startCameraBtn) els.startCameraBtn.addEventListener("click", startCamera);
  if (els.stopCameraBtn) els.stopCameraBtn.addEventListener("click", stopCamera);
  if (els.rescanBtn) els.rescanBtn.addEventListener("click", resetAll);

  if (els.copyIbanBtn) els.copyIbanBtn.addEventListener("click", copyIBAN);
  if (els.copyRefBtn) els.copyRefBtn.addEventListener("click", copyRef);
  if (els.copySepaBtn) els.copySepaBtn.addEventListener("click", copySepa);
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
    sepaText: ""
  };
}

function emptyValidation() {
  return {
    errors: [],
    warnings: [],
    validForEpc: false
  };
}

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
    codeReader.reset();
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

  payment.payerName = cleanField(fields[3], 70);
  payment.payerAddress1 = cleanField(fields[4], 70);
  payment.payerAddress2 = cleanField(fields[5], 70);

  payment.recipientName = cleanField(fields[6], 70);
  payment.recipientAddress1 = cleanField(fields[7], 70);
  payment.recipientAddress2 = cleanField(fields[8], 70);

  payment.accountRaw = cleanField(fields[9], 50);
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

function cleanField(value, maxLen) {
  const len = typeof maxLen === "number" ? maxLen : 140;
  return (value || "").replace(/\s+/g, " ").trim().substring(0, len);
}

function normalizeCurrency(value) {
  const v = cleanField(value, 3).toUpperCase();
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
  const raw = cleanField(value, 10).replace(/\s+/g, "").toUpperCase();
  if (!raw) return "";
  if (/^HR\d{2}$/.test(raw)) return raw;
  if (/^\d{2}$/.test(raw)) return "HR" + raw;
  return raw;
}

function normalizeReference(value) {
  return cleanField(value, 60).replace(/\s+/g, "");
}

function normalizePurposeCode(value) {
  const v = cleanField(value, 10).replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{4}$/.test(v) ? v : "";
}

function buildCombinedReference(model, referenceNumber) {
  if (model && referenceNumber) return model + " " + referenceNumber;
  return referenceNumber || model || "";
}

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
    errors: errors,
    warnings: warnings,
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

function generateEpcPayload(payment) {
  const iban = payment.iban.replace(/\s+/g, "").toUpperCase();
  const name = sanitizeEpcText(payment.recipientName, 70);
  const amount = payment.amount ? "EUR" + Number(payment.amount).toFixed(2) : "";
  const purpose = payment.purposeCode || "";

  const structuredReference = isIso11649Reference(payment.referenceNumber)
    ? payment.referenceNumber.replace(/\s+/g, "").toUpperCase()
    : "";

  let unstructuredText = "";
  if (structuredReference) {
    unstructuredText = buildUnstructuredText(payment.description, payment.purposeCode);
  } else {
    unstructuredText = buildUnstructuredText(
      [payment.combinedReference, payment.purposeCode, payment.description].filter(Boolean).join(" "),
      ""
    );
  }

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    name,
    iban,
    amount,
    purpose,
    structuredReference,
    sanitizeEpcText(unstructuredText, 140),
    ""
  ].join("\n");
}

function isIso11649Reference(value) {
  const ref = (value || "").replace(/\s+/g, "").toUpperCase();
  return /^RF\d{2}[A-Z0-9]{1,21}$/.test(ref);
}

function buildUnstructuredText(primary, secondary) {
  return [primary, secondary].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function sanitizeEpcText(value, maxLen) {
  return (value || "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLen);
}

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
  const raw = input.replace(/\s/g, "");
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
  }
  return "";
}

function findReference(lines) {
  for (let i = 0; i < lines.length; i++) {
    const candidate = lines[i].replace(/\s+/g, "");
    if (/^[A-Z0-9]+(?:[-/][A-Z0-9]+)+$/i.test(candidate)) {
      return candidate;
    }
  }
  return "";
}

function findPurposeCode(lines) {
  const knownCodes = {
    GASB: true,
    COST: true,
    OTHR: true,
    SALA: true,
    SUPP: true,
    TAXS: true,
    INTC: true,
    HEDG: true,
    ELEC: true,
    COMM: true
  };

  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].replace(/\s+/g, "").toUpperCase();
    if (knownCodes[compact]) return compact;
  }

  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].replace(/\s+/g, "").toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(compact) && !/^HR\d{2}$/.test(compact) && compact !== "EUR") {
      return compact;
    }
  }

  return "";
}

function findLikelyPayer(lines) {
  for (let i = 0; i < lines.length; i++) {
    const clean = cleanField(lines[i], 80);
    const compact = clean.replace(/\s+/g, "").toUpperCase();

    if (!clean) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (compact === "EUR") continue;
    if (compact.indexOf("D.O.O") !== -1) continue;
    if (compact.indexOf("D.D") !== -1) continue;
    if (compact.indexOf("PLIN") !== -1) continue;
    if (compact.indexOf("HOLDING") !== -1) continue;
    if (compact.length < 3) continue;

    if (/[A-Za-zČĆŽŠĐčćžšđ]/.test(clean)) {
      return clean;
    }
  }

  return "";
}

function findLikelyRecipient(lines, iban) {
  const skip = {};
  [iban, "HRVHUB30", "HRVHUB31", "EUR", "HRK"].forEach(function (v) {
    if (v) skip[v] = true;
  });

  for (let i = 0; i < lines.length; i++) {
    const clean = cleanField(lines[i], 80);
    const compact = clean.replace(/\s+/g, "").toUpperCase();

    if (!clean) continue;
    if (skip[compact] || skip[clean]) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (compact === iban) continue;
    if (!/[A-Za-zČĆŽŠĐčćžšđ]/.test(clean)) continue;

    if (
      compact.indexOf("D.O.O") !== -1 ||
      compact.indexOf("D.D") !== -1 ||
      compact.indexOf("PLIN") !== -1 ||
      compact.indexOf("HOLDING") !== -1 ||
      compact.indexOf("TELEKOM") !== -1 ||
      compact.indexOf("VODOVOD") !== -1 ||
      compact.indexOf("HEP") !== -1
    ) {
      return clean;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const clean = cleanField(lines[i], 80);
    const compact = clean.replace(/\s+/g, "").toUpperCase();

    if (!clean) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (compact === iban) continue;
    if (compact.indexOf("MODEL") !== -1) continue;
    if (compact.indexOf("IBAN") !== -1) continue;
    if (!/[A-Za-zČĆŽŠĐčćžšđ]/.test(clean)) continue;

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
    const clean = cleanField(lines[i], 140);
    const compact = clean.replace(/\s+/g, "");

    if (!clean) continue;
    if (taken[clean]) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (clean.length < 4) continue;
    if (/[A-Za-zČĆŽŠĐčćžšđ]/.test(clean)) return clean;
  }

  return "";
}

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
    if (v.warnings.length) {
      setText(els.validationField, "Osnovna validacija prošla uz upozorenja: " + v.warnings.join(" "));
    } else {
      setText(els.validationField, "Osnovna validacija prošla.");
    }
  } else {
    setText(els.validationField, v.errors.join(" "));
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
      els.rawBox.className = "status";
      els.rawBox.innerHTML =
        '<strong>Raw sadržaj barkoda:</strong><pre style="margin:8px 0 0; white-space:pre-wrap; word-break:break-word; font-family:Consolas,Monaco,monospace; font-size:12px; line-height:1.5;">' +
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

  QRCode.toCanvas(text, { width: 220, margin: 1 }, function (err, canvas) {
    if (err) {
      clearQr("Greška pri generiranju QR-a.");
      return;
    }
    els.qrContainer.appendChild(canvas);
  });
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

  if (els.copyIbanBtn) els.copyIbanBtn.disabled = !hasIban;
  if (els.copyRefBtn) els.copyRefBtn.disabled = !hasRef;
  if (els.copySepaBtn) els.copySepaBtn.disabled = !hasSepa;
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
  setStatus("Spreman za novo skeniranje.");
}

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

function openRevolut() {
  window.location.href = "revolut://";
}

function normalizeRawText(text) {
  return (text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

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
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Neispravna slika."));
    };

    img.src = objectUrl;
  });
}
