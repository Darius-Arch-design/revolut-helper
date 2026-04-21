const codeReader = new ZXing.BrowserMultiFormatReader();
const output = document.getElementById("output");
const fileInput = document.getElementById("fileInput");

let lastResult = "";

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  output.textContent = "Čitam sliku...";

  codeReader.decodeFromImage(undefined, URL.createObjectURL(file))
    .then(result => handleResult(result.text))
    .catch(() => output.textContent = "Ne mogu očitati barkod.");
});

function startCamera() {
  output.textContent = "Pokrećem kameru...";

  codeReader.decodeFromVideoDevice(null, 'video', (result, err) => {
    if (result) {
      if (result.text === lastResult) return;
      lastResult = result.text;

      handleResult(result.text);
    }
  });
}

function handleResult(rawText) {
  const parsed = parseHUB3(rawText);

  if (parsed.startsWith("Greška")) {
    output.textContent = parsed;
    return;
  }

  output.textContent = "✔ " + parsed;

  navigator.clipboard.writeText(parsed);

  if (navigator.vibrate) {
    navigator.vibrate(100);
  }
}

function parseHUB3(text) {
  const lines = text.replace(/\r/g, '').split('\n');

  let model = null;
  let poziv = null;

  for (let line of lines) {
    const l = line.trim();

    let m = l.match(/^(HR)?(\d{2})$/);
    if (!model && m) {
      model = "HR" + m[2];
      continue;
    }

    let p = l.match(/^\d+(-\d+)+$/);
    if (!poziv && p) {
      poziv = l;
    }
  }

  if (!model || !poziv) {
    return "Greška: ne mogu očitati podatke.";
  }

  return model + " " + poziv;
}

function copyResult() {
  navigator.clipboard.writeText(output.textContent.replace("✔ ", ""));
}

function openRevolut() {
  window.location.href = "revolut://";
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}