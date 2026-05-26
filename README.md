# SEPA Scan for Revolut

**Praktična web aplikacija (PWA) koja skenira HUB3 2D barkodove s hrvatskih računa i uplatnica te automatski generira EPC SEPA QR kod za brzo plaćanje u Revolutu.**

Umjesto ručnog prepisivanja IBAN-a, modela, poziva na broj i iznosa – jednostavno skeniraj barkod s kamere, slike ili PDF-a i dobij sve podatke spremljene za plaćanje.

**Live demo:** [https://darius-arch-design.github.io/revolut-helper/](https://darius-arch-design.github.io/revolut-helper/)

---

##  Značajke

-  Skeniranje HUB3 barkodova (PDF417) iz **slike**, **PDF-a** ili **kamere**
-  Automatsko izdvajanje svih ključnih podataka (IBAN, primatelj, iznos, model+poziv, opis…)
-  Generiranje **EPC SEPA QR koda** koji Revolut direktno prepoznaje
-  Više fallback metoda i charsetova (ISO-8859-2, windows-1250, UTF-8) za pouzdano očitavanje hrvatskih znakova
-  Image preprocessing (grayscale, threshold, rotacije, kontrast) za bolje rezultate
-  Podrška za PDF (do 5 stranica)
-  Čist, responsivni UI na hrvatskom jeziku
-  PWA – može se instalirati kao aplikacija na telefon
-  Copy dugmad, dijeljenje QR koda, spremanje u PNG

---

##  Kako koristiti

1. Otvori [demo](https://darius-arch-design.github.io/revolut-helper/)
2. Odaberi **"Odaberi sliku ili PDF"** ili pokreni **kameru**
3. Usmjeri kameru na HUB3 barkod na računu/uplatnici
4. Podaci se automatski očitaju i prikažu
5. Provjeri podatke (možeš ih ručno ispraviti ako treba)
6. Klikni **"Otvori Revolut"** ili kopiraj IBAN / model+poziv / SEPA podatke
7. U Revolutu skeniraj generirani QR ili ručno unesi podatke

**Savjet:** Drži barkod ravno, bez jakog odsjaja i dovoljno blizu kameri.

---

##  Tehnički detalji

- **Barcode dekodiranje:** ZXing (s više charsetova + custom image processing)
- **PDF obrada:** PDF.js
- **QR generiranje:** qrcode.js
- **Arhitektura:** Čisti HTML + CSS + JavaScript (PWA)
- **Offline podrška:** Service Worker
- Sve obrada se događa **lokalno u pregledniku** – podaci ne odlaze na server

---

##  Instalacija / Korištenje

Jednostavno otvorite `index.html` u pregledniku ili koristite GitHub Pages.
