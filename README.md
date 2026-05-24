# SEPA Scan for Revolut

SEPA Scan for Revolut je mala web aplikacija koja skenira hrvatske HUB3 2D barkodove s računa i uplatnica, izdvaja podatke za plaćanje i pretvara ih u QR kod za automatsko plaćanje u Revolutu.

https://darius-arch-design.github.io/revolut-helper/

Aplikacija podržava skeniranje barkoda iz slike, PDF-a i kamere. Nakon očitavanja prikazuje ključne podatke za provjeru i generira EPC SEPA QR sadržaj koji Revolut ispravno prepoznaje.

Projekt je namijenjen računima hrvatskih tvrtki i usluga poput režija, telekoma i komunalnih računa, gdje korisnik želi izbjeći ručni unos podataka i ubrzati plaćanje. Umjesto prepisivanja podataka s papirnate HUB3 uplatnice, aplikacija očita barkod, izdvoji IBAN, naziv primatelja, iznos, model i poziv na broj te pripremi QR kod i podatke za brzo plaćanje.

Aplikacija nije službena integracija s Revolutom, ali služi kao pouzdan payment helper koji hrvatsku HUB3 uplatnicu pretvara u digitalni oblik prikladan za brzo i praktično plaćanje. Uz generiranje QR koda, aplikacija omogućuje i ručno kopiranje ključnih podataka kad korisnik želi dodatnu provjeru ili alternativni način unosa.

## Glavne mogućnosti

- skeniranje PDF417 / HUB3 barkoda sa slike, PDF-a ili kamere
- izdvajanje IBAN-a, primatelja, iznosa, modela i poziva na broj
- osnovna validacija očitanih podataka prije generiranja QR koda
- generiranje EPC SEPA QR sadržaja i prikaz QR koda
- spremanje ili dijeljenje generiranog QR koda
- brže plaćanje računa u Revolutu
