# Revolut Helper za hrvatske račune

Praktična web aplikacija koja skenira HUB3 PDF417 barkodove s hrvatskih računa i uplatnica te izdvaja podatke potrebne za običan bankovni prijenos u Revolutu.

**Aplikacija:** https://darius-arch-design.github.io/revolut-helper/

## Što aplikacija radi

- skenira HUB3 barkod iz slike, PDF-a ili kamerom
- izdvaja primatelja, IBAN, iznos, model i poziv na broj, šifru namjene i opis
- vodi kroz dva odvojena Revolut koraka: spremanje primatelja pa unos iznosa i reference
- otvara Revolut aplikaciju
- za PBZ račune generira kompatibilniji EPC 001 QR s BIC-om PBZGHR2X i transliteriranim tekstom
- za ostale račune generira standardni EPC 002 QR ako BIC nije poznat
- radi lokalno u pregledniku; podaci se ne šalju na poslužitelj
- može se instalirati kao PWA i koristiti izvan mreže nakon prvog učitavanja

## Plaćanje preko Revoluta

Revolut odvaja dodavanje primatelja od unosa podataka plaćanja:

1. Skeniraj HUB3 barkod i provjeri očitane podatke.
2. U Revolutu otvori Plaćanja → Bankovni prijenos → Dodajte primatelja.
3. U polje IBAN zalijepi **samo IBAN**. U polje Naziv tvrtke zalijepi naziv primatelja i spremi primatelja.
4. Odaberi spremljenog primatelja i započni prijenos.
5. Kopiraj iznos bez oznake valute u polje za iznos.
6. Tek na ekranu prijenosa u polje Referenca zalijepi HR model i poziv na broj.
7. Prije potvrde usporedi sve podatke s izvornim računom.

Ako se HR model i poziv zalijepe dok je aktivno polje IBAN, Revolut će njima zamijeniti IBAN i prikazati grešku neispravnog formata. Model i poziv nikada ne idu u IBAN polje.

Nakon što je primatelj spremljen u Revolutu, kod sljedećih računa obično treba kopirati samo iznos i referencu.

## Važno ograničenje

EPC QR izrađen je prema standardu EPC069-12, ali Revolut ne podržava njegovo skeniranje jednako u svim državama i verzijama aplikacije. Za hrvatske Revolut račune pouzdan je postupak kopiranje podataka u običan bankovni prijenos. QR je zadržan za druge bankovne aplikacije koje podržavaju EPC/GiroCode.

## Tehnički detalji

- dekodiranje PDF417/QR: ZXing
- obrada PDF-a: PDF.js
- generiranje EPC QR-a: qrcode.js
- arhitektura: HTML, CSS i JavaScript bez poslužiteljskog dijela
- PWA: manifest i service worker
- EPC: UTF-8, verzija 001 s BIC-om za poznate banke ili 002 bez BIC-a, razina ispravljanja pogrešaka M, najviše 331 bajt
