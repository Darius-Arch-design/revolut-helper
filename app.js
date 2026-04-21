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

const state = {
  rawText: "",
  lastScanHash: "",
  scanning: false,
  locked: false,
  mediaStream: null,

  payment: {
    recipientName: "",
    iban: "",
    model: "",
    referenceNumber: "",
    combinedReference: "",
    amount: "",
    description: "",
    sepaText: ""
  },

  validation: {
    errors: [],
    warnings: [],
    validForEpc: false
  }
};

init();

function init() {
  bindEvents();
  resetUiOnly();
}

function bindEvents() {
  els.fileInput.addEventListener("change", onFileSelected);
  els.startCameraBtn.addEventListener("click", startCamera);
  els.stopCameraBtn.addEventListener("click", stopCamera);
  els.rescanBtn.addEventListener("click", resetAll);

  els.copyIbanBtn.addEventListener("click", () => {
    if (state.payment.iban) copyText(state.payment.iban, "IBAN kopiran.");
  });

  els.copyRefBtn.addEventListener("click", () => {
    if (state.payment.combinedReference) {
      copyText(state.payment.combinedReference, "Model i poziv kopirani.");
    }
  });

  els.copySepaBtn.addEventListener("click", () => {
    if (state.payment.sepaText) copyText(state.payment.sepaText, "SEPA podaci kopirani.");
  });

  els.openRevolutBtn.addEventListener("click", openRevolut);
}

/* ---------------- FLOW ---------------- */

async function onFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  setStatus("Čitam sliku...", "warn");

  try {
    const img = await loadImageFromFile(file);
    const result = await codeReader.decodeFromImageElement(img);

    if (!result || !result.text) {
      throw new Error("Nije pronađen čitljiv kod.");
    }

    processDecodedText(result.text, "slika");
  } catch (err) {
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

    els.startCameraBtn.disabled = true;
    els.stopCameraBtn.disabled = false;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    state.mediaStream = stream;
    els.video.srcObject = stream;

    await codeReader.decodeFromVideoDevice(null, els.video, (result, err) => {
      if (state.locked) return;

      if (result && result.text) {
        state.locked = true;
        processDecodedText(result.text, "kamera");
        stopCamera();
      }
    });

    setStatus("Kamera je aktivna. Usmjeri barkod prema kameri.", "warn");
  } catch (err) {
    state.scanning = false;
    els.startCameraBtn.disabled = false;
    els.stopCameraBtn.disabled = true;
    setStatus("Kamera nije dostupna ili dozvola nije odobrena.", "err");
  }
}

function stopCamera() {
  try {
    codeReader.reset();
  } catch (e) {}

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }

  if (els.video.srcObject) {
    els.video.srcObject = null;
  }

  state.scanning = false;
  state.locked = false;
  els.startCameraBtn.disabled = false;
  els.stopCameraBtn.disabled = true;
}

function processDecodedText(text, source) {
  const normalizedText = normalizeRawText(text);
  const scanHash = normalizedText.replace(/\s+/g, " ").trim();

  if (!scanHash || scanHash === state.lastScanHash) {
    return;
  }

  state.lastScanHash = scanHash;
  state.rawText = normalizedText;

  const parsed = parseCode(normalizedText);
  state.payment = parsed;

  const validation = validatePayment(parsed);
  state.validation = validation;

  if (validation.validForEpc) {
    state.payment.sepaText = generateEpcPayload(parsed);
    renderQr(state.payment.sepaText);
    setStatus(`Skeniranje uspješno (${source}). EPC QR generiran.`, "ok");
  } else {
    state.payment.sepaText = "";
    clearQr("Nedostaju obvezni podaci za EPC QR.");
    setStatus(`Skeniranje uspješno (${source}), ali podaci nisu dovoljno valjani za EPC QR.`, "warn");
  }

  renderParsedData();
  updateButtons();
}

/* ---------------- PARSING ---------------- */

function parseCode(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  const result = {
    recipientName: "",
    iban: "",
    model: "",
    referenceNumber: "",
    combinedReference: "",
    amount: "",
    description: "",
    sepaText: ""
  };

  // 1) IBAN
  result.iban = extractIban(text);

  // 2) Amount
  result.amount = extractAmount(text, lines);

  // 3) Model + poziv
  const refData = extractModelAndReference(lines);
  result.model = refData.model;
  result.referenceNumber = refData.referenceNumber;
  result.combinedReference = refData.combinedReference;

  // 4) Recipient
  result.recipientName = extractRecipientName(lines, result.iban);

  // 5) Description
  result.description = extractDescription(lines, result);

  return result;
}

function extractIban(text) {
  const cleaned = text.replace(/\s+/g, "");
  const match = cleaned.match(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/i);
  return match ? match[0].toUpperCase() : "";
}

function extractAmount(text, lines) {
  // pokušaj 1: eksplicitni decimalni format 123,45 ili 123.45 ili 1.234,56
  const direct = text.match(/\b\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})\b/);
  if (direct) {
    return normalizeDecimalAmount(direct[0]);
  }

  // pokušaj 2: HUB-stil cijeli broj centi, npr. 0000000012345 => 123.45
  for (const line of lines) {
    if (/^\d{6,15}$/.test(line)) {
      const candidate = normalizeCentsAmount(line);
      if (candidate) return candidate;
    }
  }

  return "";
}

function extractModelAndReference(lines) {
  let model = "";
  let referenceNumber = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, "").toUpperCase();

    if (!model) {
      const modelMatch = line.match(/^HR(\d{2})$/);
      if (modelMatch) {
        model = "HR" + modelMatch[1];

        const next = lines[i + 1] ? lines[i + 1].trim() : "";
        if (next && /[A-Z0-9\-\/]+/i.test(next)) {
          referenceNumber = next.replace(/\s+/g, "");
        }
      }
    }

    if (!referenceNumber) {
      const candidate = lines[i].trim();
      if (/^\d[\d\-\/]{4,}$/.test(candidate)) {
        referenceNumber = candidate.replace(/\s+/g, "");
      }
    }
  }

  return {
    model,
    referenceNumber,
    combinedReference: model && referenceNumber
      ? `${model} ${referenceNumber}`
      : referenceNumber || ""
  };
}

function extractRecipientName(lines, iban) {
  if (!lines.length) return "";

  const banned = [
    "HRVHUB30", "EUR", "HRK", "HUB", "UPLATNICA", "MODEL", "POZIV", "IBAN", "PLATITELJ"
  ];

  const ibanIndex = lines.findIndex(line => line.replace(/\s+/g, "").toUpperCase().includes(iban));

  if (ibanIndex > 0) {
    for (let i = ibanIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      const compact = line.replace(/\s+/g, "").toUpperCase();

      if (!line) continue;
      if (/^\d+$/.test(compact)) continue;
      if (/^HR\d{2}$/.test(compact)) continue;
      if (compact.length < 3) continue;
      if (banned.includes(compact)) continue;
      if (compact.includes("HTTP")) continue;
      if (compact.includes("WWW.")) continue;
      if (compact === iban) continue;

      return cleanupRecipient(line);
    }
  }

  for (const line of lines) {
    const compact = line.replace(/\s+/g, "").toUpperCase();
    if (!line) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (compact === iban) continue;
    if (compact.length < 3) continue;
    if (banned.includes(compact)) continue;
    if (compact.includes("ULICA")) continue;
    if (compact.includes("ZAGREB")) continue;
    if (compact.includes("ČAKOVEC")) continue;

    if (/[A-Za-zČĆŽŠĐčćžšđ]/.test(line)) {
      return cleanupRecipient(line);
    }
  }

  return "";
}

function extractDescription(lines, payment) {
  const skipValues = new Set([
    payment.recipientName,
    payment.iban,
    payment.model,
    payment.referenceNumber,
    payment.combinedReference
  ].filter(Boolean).map(v => v.trim()));

  for (const line of lines) {
    const cleaned = line.trim();
    const compact = cleaned.replace(/\s+/g, "");

    if (!cleaned) continue;
    if (skipValues.has(cleaned)) continue;
    if (/^\d+$/.test(compact)) continue;
    if (/^HR\d{2}$/.test(compact)) continue;
    if (compact === payment.iban) continue;
    if (cleaned.length < 5) continue;

    if (/[A-Za-zČĆŽŠĐčćžšđ]/.test(cleaned)) {
      return cleaned.substring(0, 140);
    }
  }

  return payment.combinedReference || "Plaćanje računa";
}

/* ---------------- VALIDATION ---------------- */

function validatePayment(payment) {
  const errors = [];
  const warnings = [];

  if (!payment.iban) {
    errors.push("IBAN nije pronađen.");
  } else if (!validateIBAN(payment.iban)) {
    errors.push("IBAN je pronađen, ali nije valjan.");
  }

  if (!payment.recipientName) {
    errors.push("Naziv primatelja nije pronađen.");
  }

  if (!payment.amount) {
    warnings.push("Iznos nije pronađen.");
  }

  if (!payment.combinedReference) {
    warnings.push("Model i poziv nisu pouzdano pronađeni.");
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
  const value = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(value)) return false;

  const rearranged = value.slice(4) + value.slice(0, 4);
  let expanded = "";

  for (const ch of rearranged) {
    if (/[A-Z]/.test(ch)) {
      expanded += (ch.charCodeAt(0) - 55).toString();
    } else {
      expanded += ch;
    }
  }

  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder === 1;
}

/* ---------------- EPC ---------------- */

function generateEpcPayload(payment) {
  const recipient = sanitizeEpcText(payment.recipientName, 70);
  const iban = payment.iban.replace(/\s+/g, "").toUpperCase();
  const amount = payment.amount ? `EUR${Number(payment.amount).toFixed(2)}` : "";
  const remittanceText = sanitizeEpcText(
    payment.combinedReference || payment.description || "Placanje racuna",
    140
  );

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    recipient,
    iban,
    amount,
    "",
    "",
    remittanceText,
    ""
  ].join("\n");
}

function sanitizeEpcText(value, maxLen) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\-\/.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLen);
}

/* ---------------- RENDER ---------------- */

function renderParsedData() {
  const p = state.payment;
  const v = state.validation;

  els.recipientField.textContent = p.recipientName || "—";
  els.ibanField.textContent = p.iban || "—";
  els.refField.textContent = p.combinedReference || "—";
  els.amountField.textContent = p.amount ? `${Number(p.amount).toFixed(2)} EUR` : "—";
  els.descField.textContent = p.description || "—";

  if (v.validForEpc) {
    els.validationField.textContent = v.warnings.length
      ? `Osnovna validacija prošla uz upozorenja: ${v.warnings.join(" ")}`
      : "Osnovna validacija prošla.";
  } else {
    els.validationField.textContent = v.errors.join(" ");
  }

  if (v.warnings.length) {
    els.warningsBox.classList.remove("hidden");
    els.warningsBox.className = "status warn";
    els.warningsBox.textContent = "Upozorenja: " + v.warnings.join(" ");
  } else if (v.errors.length) {
    els.warningsBox.classList.remove("hidden");
    els.warningsBox.className = "status err";
    els.warningsBox.textContent = "Greške: " + v.errors.join(" ");
  } else {
    els.warningsBox.classList.add("hidden");
    els.warningsBox.textContent = "";
  }

  if (state.rawText) {
    els.rawBox.classList.remove("hidden");
    els.rawBox.className = "status";
    els.rawBox.textContent = "Raw sadržaj barkoda:\n" + state.rawText;
  } else {
    els.rawBox.classList.add("hidden");
    els.rawBox.textContent = "";
  }
}

function renderQr(text) {
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
  els.qrContainer.innerHTML = `<span class="note">${escapeHtml(message)}</span>`;
}

function updateButtons() {
  const hasIban = !!state.payment.iban;
  const hasRef = !!state.payment.combinedReference;
  const hasSepa = !!state.payment.sepaText;

  els.copyIbanBtn.disabled = !hasIban;
  els.copyRefBtn.disabled = !hasRef;
  els.copySepaBtn.disabled = !hasSepa;
}

function setStatus(message, type = "") {
  els.statusBox.className = "status";
  if (type) els.statusBox.classList.add(type);
  els.statusBox.textContent = message;
}

function resetUiOnly() {
  els.recipientField.textContent = "—";
  els.ibanField.textContent = "—";
  els.refField.textContent = "—";
  els.amountField.textContent = "—";
  els.descField.textContent = "—";
  els.validationField.textContent = "—";
  els.warningsBox.classList.add("hidden");
  els.rawBox.classList.add("hidden");
  clearQr("QR će se pojaviti nakon uspješnog i valjanog parsiranja.");
  updateButtons();
}

function resetParsedData() {
  state.rawText = "";
  state.payment = {
    recipientName: "",
    iban: "",
    model: "",
    referenceNumber: "",
    combinedReference: "",
    amount: "",
    description: "",
    sepaText: ""
  };
  state.validation = {
    errors: [],
    warnings: [],
    validForEpc: false
  };
  resetUiOnly();
}

function resetAll() {
  stopCamera();
  state.lastScanHash = "";
  resetParsedData();
  els.fileInput.value = "";
  setStatus("Spreman za novo skeniranje.", "");
}

/* ---------------- HELPERS ---------------- */

function normalizeRawText(text) {
  return (text || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeDecimalAmount(input) {
  const raw = input.replace(/\s/g, "");

  if (raw.includes(",") && raw.includes(".")) {
    return raw.replace(/\./g, "").replace(",", ".");
  }

  if (raw.includes(",")) {
    return raw.replace(",", ".");
  }

  return raw;
}

function normalizeCentsAmount(input) {
  const trimmed = input.replace(/^0+/, "") || "0";
  if (!/^\d+$/.test(trimmed)) return "";

  const cents = Number(trimmed);
  if (!Number.isFinite(cents) || cents <= 0) return "";

  return (cents / 100).toFixed(2);
}

function cleanupRecipient(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[;,]+$/g, "")
    .trim()
    .substring(0, 70);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Neispravna slika."));
    };

    img.src = objectUrl;
  });
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      setStatus(successMessage, "ok");
      return;
    }

    fallbackCopy(text);
    setStatus(successMessage, "ok");
  } catch (err) {
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
