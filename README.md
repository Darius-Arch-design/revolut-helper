# Revolut Helper za hrvatske račune

Praktična web aplikacija koja skenira HUB3 PDF417 barkodove s hrvatskih računa i uplatnica te izdvaja podatke potrebne za običan bankovni prijenos u Revolutu.

**Aplikacija:** https://darius-arch-design.github.io/revolut-helper/

## Što aplikacija radi

- skenira HUB3 barkod iz slike, PDF-a ili kamerom
- izdvaja primatelja, IBAN, iznos, model i poziv na broj, šifru namjene i opis
- daje zasebne gumbe za kopiranje svakog podatka u Revolut
- otvara Revolut aplikaciju
- za PBZ račune generira kompatibilniji EPC 001 QR s BIC-om PBZGHR2X i transliteriranim tekstom
- za ostale račune generira standardni EPC 002 QR ako BIC nije poznat
- radi lokalno u pregledniku; podaci se ne šalju na poslužitelj
- može se instalirati kao PWA i koristiti izvan mreže nakon prvog učitavanja

## Plaćanje preko Revoluta

1. Skeniraj HUB3 barkod i provjeri očitane podatke.
2. U Revolutu otvori Plaćanja i odaberi postojeći bankovni račun primatelja ili dodaj novi.
3. Za novog primatelja kopiraj IBAN i po potrebi naziv primatelja.
4. Kopiraj iznos bez oznake valute.
5. U Revolutovo polje Referenca zalijepi model i poziv na broj.
6. Prije potvrde usporedi sve podatke s izvornim računom.

Nakon što je primatelj spremljen u Revolutu, kod sljedećih računa obično treba kopirati samo iznos i referencu.

## Važno ograničenje

EPC QR izrađen je prema standardu EPC069-12, ali Revolut ne podržava njegovo skeniranje jednako u svim državama i verzijama aplikacije. Za hrvatske Revolut račune pouzdan je postupak kopiranje podataka u običan bankovni prijenos. QR je zadržan za druge bankovne aplikacije koje podržavaju EPC/GiroCode.

## Tehnički detalji

- dekodiranje PDF417/QR: ZXing
- obrada PDF-a: PDF.js
- generiranje EPC QR-a: qrcode.js
- arhitektura: HTML, CSS i JavaScript bez poslužiteljskog dijela
- PWA: manifest i service worker
- EPC: UTF-8, verzija 002, razina ispravljanja pogrešaka M, najviše 331 bajt
