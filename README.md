# SEPA Scan for Revolut
Web aplikacija koja skenira hrvatske HUB3 (PDF417) barkodove s računa i uplatnica te ih pretvara u EPC/SEPA QR kod pogodan za plaćanje u Revolutu.
**Demo:** https://darius-arch-design.github.io/revolut-helper/
## Svrha
Aplikacija omogućuje brzo i točno plaćanje hrvatskih računa (režije, telekom, komunalije itd.) skeniranjem 2D barkoda s uplatnice. Umjesto ručnog prepisivanja podataka, korisnik skenira barkod i dobiva spreman EPC QR kod koji Revolut prepoznaje.
## Glavne značajke
- Skeniranje HUB3 barkoda iz **slike**, **PDF-a** ili **kamere**
- Podrška za više encodinga (ISO-8859-2, Windows-1250, UTF-8)
- Automatsko ispravljanje hrvatskih znakova (mojibake)
- Generiranje EPC/SEPA QR koda prema standardu
- Prikaz metapodataka skeniranja (koji parser i charset je korišten)
- Kopiranje IBAN-a, modela i poziva na broj
- Jednostavan i čist korisnički sučelje
## Kako koristiti
1. Otvori aplikaciju u pregledniku (najbolje na mobitelu).
2. Odaberi jednu od metoda:
   - **Kamera** – usmjeri kameru prema barkodu
   - **Slika** – odaberi sliku s uređaja
   - **PDF** – odaberi PDF računa (do 5 stranica)
3. Provjeri očitane podatke.
4. Skeniraj generirani EPC QR kod u Revolutu ili kopiraj podatke ručno.
## Podržani formati
- HUB3 (HRVHUB30 / HRVHUB31)
- PDF417 barkodovi s hrvatskih uplatnica
## Tehnički detalji
- Koristi **ZXing** za dekodiranje barkodova
- Koristi **PDF.js** za obradu PDF datoteka
- Generira EPC QR prema specifikaciji (BCD 002)
- Automatski bira najbolji charset prilikom dekodiranja
- Prikazuje informaciju o korištenom parseru (`HUB3` ili `fallback`) i charsetu
## Ograničenja
- Ne podržava starije formate prije HUB3
- Fallback parser može imati nižu točnost kod jako oštećenih ili nečitkih barkodova
- Maksimalna duljina EPC QR-a je ograničena na 331 bajt
## Lokalno pokretanje
1. Preuzmi oba fajla (`index.html` i `app.js`)
2. Smjesti ih u isti direktorij
3. Otvori `index.html` u pregledniku
> Napomena: Za korištenje kamere potrebno je poslužiti aplikaciju preko HTTPS-a (ili `localhost`).
## Tehnologije
- Vanilla JavaScript
- ZXing Library
- QRCode.js
- PDF.js
## Licenca
Ovaj projekt je namijenjen osobnoj upotrebi. Nije službena integracija s Revolutom.
