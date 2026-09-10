# UI — testni prikaz fiskalizacije

Samostojna statična stran (brez build koraka, brez UI5 tooling-a) za ročno sprožanje testnega
računa preko SAP Event Mesh in prikaz rezultata (ZOI, EOR, status). Vključuje tudi
`docs.html` — kratek pregled endpointov v stilu Swaggerja.

## Namestitev

1. To mapo (`ui/`) skopiraj v `app/ui/` v rootu repozitorija.
2. V `srv/server.js` dodaj spodnja dva bloka (glej `server-snippet.js` v tej mapi za točno kodo).
3. Ponovno zaženi aplikacijo (`cds bind --exec -- cds watch --profile hybrid`).
4. Odpri `http://localhost:4004/ui/index.html` (lokalno) oz. `https://<app-route>/ui/index.html`
   po deployu na Cloud Foundry.

## Strani v tej mapi

| Datoteka | Namen |
|---|---|
| `index.html` | Testna stran — pošlje dummy račun in prikaže ZOI/EOR |
| `docs.html` | Pregled `GET`/`POST` endpointov in poteka delovanja (v stilu Swaggerja) |

## Kako deluje

- Gumb **"Pošlji račun preko Event Mesh"** pokliče `POST /ui/api/emit`, ki objavi testni dogodek
  na topic `invoice/created` — enako, kot bi to naredil ročni test v Event Mesh cockpitu.
- Stran nato vsakih 1,2 s poizveduje `GET /ui/api/status/:invoiceId`, dokler `fiscalization-service.js`
  ne shrani rezultata v SAP HANA Cloud (Status `CONFIRMED` ali `ERROR`).
- Ker gre za navadno statično stran znotraj obstoječega CAP Node procesa, se deploya skupaj z
  aplikacijo — ni potreben ločen MTA modul ali app router.

## Znane omejitve

Orodje je namenjeno **internemu testiranju**, ne produkcijski uporabi:
- ni avtentikacije (kdorkoli z URL-jem lahko sproži testni račun),
- ni CSRF zaščite,
- pred izpostavitvijo zunaj internega omrežja dodaj vsaj osnovno avtentikacijo (XSUAA scope ali Basic Auth na `/ui` poti).
