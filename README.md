# SEPA Scan for Revolut

SEPA Scan for Revolut je mala web aplikacija koja skenira hrvatske HUB3 2D barkodove s računa i uplatnica, izdvaja podatke za plaćanje i priprema ih za brži unos u Revolutu. Aplikacija pokušava pretvoriti očitane podatke u EPC SEPA QR sadržaj, ali je u praksi zamišljena prvenstveno kao payment helper za brzo kopiranje IBAN-a, iznosa, modela i poziva na broj. 

Projekt je napravljen za račune hrvatskih tvrtki i usluga poput režija, telekoma i komunalnih računa, gdje korisnik želi izbjeći ručni prepis podataka i maksimalno iskoristiti Revolut za plaćanje bez nepotrebnih naknada. Umjesto da korisnik ručno unosi sve s papirnate uplatnice, aplikacija skenira barkod, prikaže očitane podatke i pripremi ih za daljnji unos ili QR pokušaj.

Aplikacija nije izravna integracija s Revolutom i ne može garantirati da će Revolut automatski prihvatiti svaki generirani EPC QR. Glavna vrijednost projekta je u tome što pretvara hrvatsku HUB3 uplatnicu u digitalni skup podataka koji se može brzo provjeriti, kopirati i iskoristiti za jednostavnije plaćanje računa.

Glavne mogućnosti:
- skeniranje PDF417 / HUB3 barkoda sa slike ili kamere
- izdvajanje IBAN-a, primatelja, iznosa, modela i poziva na broj
- prikaz parsiranih HUB3 podataka i osnovna validacija
- generiranje EPC SEPA QR sadržaja
- brže ručno plaćanje računa u Revolutu
