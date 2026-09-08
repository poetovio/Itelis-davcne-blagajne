# Davčne blagajne – CAP Fiscal Core

Backend aplikacija za **elektronsko davčno potrjevanje računov**, razvita z uporabo **SAP Cloud Application Programming Model (CAP)** in integrirana s **SAP Event Mesh**, **SAP HANA Cloud** ter testnim sistemom **FURS**.

Aplikacija predstavlja integracijsko plast med zunanjim sistemom, ki objavi dogodek o izdanem računu, SAP Event Mesh in Finančno upravo Republike Slovenije (FURS).

## Arhitektura

```text
Dogodek o izdanem računu
          │
          ▼
    SAP Event Mesh
          │
          ▼
     CAP aplikacija
          │
          ├──────────────► SAP HANA Cloud
          │                 (Invoices / Responses / ErrorLog)
          │
          ▼
       FURS API
          │
          ▼
   Davčna potrditev računa
          │
          ├── ZOI
          └── EOR
          │
          ▼
    SAP Event Mesh
          │
          ▼
   Rezultat potrditve
```

## Tehnologije

- **Node.js**
- **SAP Cloud Application Programming Model (CAP)**
- **SAP HANA Cloud**
- **SAP HANA HDI Container**
- **SAP Event Mesh / Enterprise Messaging**
- **SAP Business Application Studio (BAS)**
- **Cloud Foundry**
- **FURS davčno potrjevanje računov**
- **JWS**
- **PKCS#12 (`.p12`) certifikati**
- **HTTPS / TLS 1.2**

---

# Struktura projekta

```text
Itelis-davcne-blagajne-1/
│
├── db/
│   └── fiscal.cds
│
├── srv/
│   ├── server.js
│   ├── subscriber.js
│   ├── messaging.js
│   ├── fiscalization-service.js
│   ├── results-listener.js
│   ├── register-premise-test.js
│   │
│   └── furs/
│       ├── certificate.js
│       ├── jws.js
│       └── zoi.js
│
├── certificates/
│   ├── *.p12
│   ├── *.cer
│   ├── *.pem
│   └── ...
│
├── package.json
├── package-lock.json
├── manifest.yml
├── xs-security.json
├── .env
├── .gitignore
│
└── README.md
```

> `gen/` je generiran direktorij, ki nastane pri CAP/HANA buildu in ga praviloma ni treba ročno urejati.

---

# Glavni deli aplikacije

## `db/fiscal.cds`

CDS podatkovni model aplikacije.

Definira podatkovne entitete, ki se uporabljajo za shranjevanje informacij o davčnem potrjevanju računov:

- `Invoice`
- `Response`
- `ErrorLog`

Na podlagi CDS modela CAP pri HANA deployu generira ustrezne HANA tabele in poglede.

---

## `srv/subscriber.js`

Subscriber je odgovoren za sprejem dogodkov iz SAP Event Mesh.

Posluša topic:

```text
itelis/fiscal/test/invoice/created
```

Ko prejme račun, preveri obvezna podatka:

```text
premiseId
deviceId
```

Nato podatke posreduje `FiscalizationService` v nadaljnjo obdelavo.

---

## `srv/fiscalization-service.js`

To je glavni poslovni del aplikacije.

Storitev:

1. prejme podatke računa,
2. preveri vhodne podatke,
3. ustvari oziroma preveri idempotency ključ,
4. preprečuje dvojno obdelavo istega računa,
5. izračuna ZOI,
6. pripravi FURS `InvoiceRequest`,
7. ustvari JWS,
8. pošlje zahtevo na FURS,
9. obdela FURS odgovor,
10. shrani rezultat v SAP HANA,
11. objavi rezultat v Event Mesh.

---

## `srv/furs/`

Mapa vsebuje logiko, potrebno za komunikacijo s FURS.

### `certificate.js`

Skrbi za:

- nalaganje `.p12` certifikata,
- pridobivanje privatnega ključa,
- pridobivanje certifikata,
- pripravo certifikata za HTTPS komunikacijo.

### `jws.js`

Skrbi za ustvarjanje podpisanega JWS sporočila, ki ga FURS pričakuje pri API zahtevah.

### `zoi.js`

Vsebuje logiko za izračun **ZOI** oziroma zaščitne oznake izdajatelja računa.

---

# SAP HANA Cloud

Podatkovna baza aplikacije je **SAP HANA Cloud**.

```text
SAP HANA Cloud
      │
      ▼
HDI Container
      │
      ▼
CAP CDS model
```

Uporabljen je HDI container:

```text
davcne-blagajne-hdi
```

ki je povezan s HANA Cloud instanco:

```text
davcne-blagajne-test
```

CAP konfiguracija uporablja HANA namesto SQLite:

```json
"db": {
  "kind": "hana",
  "model": [
    "srv",
    "db"
  ]
}
```

Pri deployu se CDS model prevede v HANA artefakte. Med drugim se ustvarijo:

```text
FISC_INVOICE
FISC_RESPONSE
FISC_ERRORLOG
```

ter pripadajoči CDS pogledi.

---

# SAP Event Mesh

SAP Event Mesh se uporablja za **asinhrono komunikacijo med sistemi**.

## Vhodni dogodek

Aplikacija posluša:

```text
itelis/fiscal/test/invoice/created
```

Primer vhodnega sporočila:

```json
{
  "invoiceId": "23",
  "taxNumber": "10698655",
  "amount": 250.75,
  "timestamp": "2026-09-07T12:00:00",
  "premiseId": "POS1",
  "deviceId": "DEV1"
}
```

Podatki se preko subscriberja posredujejo v davčno potrjevanje.

## Izhodni dogodek

Po obdelavi se rezultat objavi na:

```text
itelis/fiscal/test/invoice/fiscalized
```

Rezultat vsebuje informacije o uspešnosti davčnega potrjevanja, predvsem:

- ZOI
- EOR
- status
- morebitne podatke o napaki

Aplikacija ima tudi `results-listener.js`, ki posluša rezultatni event in izpiše:

```text
ZOI: ...
EOR: ...
```

---

# FURS integracija

Aplikacija se povezuje s **testnim okoljem FURS**.

FURS komunikacija uporablja:

```text
HTTPS
TLS 1.2
PKCS#12 client certificate
JWS
JSON
```

Testni endpoint uporablja konfiguracijo iz environment spremenljivk.

FURS odgovor se nato obdela in shrani v SAP HANA.

---

# Environment konfiguracija

Konfiguracija, ki vsebuje občutljive podatke ali okoljsko specifične nastavitve, se nahaja v `.env`.

Primer strukture:

```env
FURS_HOST=...
FURS_PORT=9002
FURS_PATH=...

FURS_CA_PATH=...

FURS_P12_PATH=...
FURS_P12_PASSPHRASE=...
```

## Pomen spremenljivk

| Spremenljivka | Namen |
|---|---|
| `FURS_HOST` | Hostname FURS testnega sistema |
| `FURS_PORT` | Port FURS API-ja |
| `FURS_PATH` | API endpoint za davčno potrjevanje |
| `FURS_CA_PATH` | Pot do CA certifikata |
| `FURS_P12_PATH` | Pot do PKCS#12 certifikata |
| `FURS_P12_PASSPHRASE` | Geslo PKCS#12 certifikata |

**`.env` ne sme biti objavljen v Git repozitoriju.**

Prav tako se v Git ne smejo committati:

```text
.p12
.private keys
.service keys
.passwords
.client secrets
```

---

# SAP Cloud Foundry

Aplikacija je namenjena izvajanju v SAP Business Technology Platform (BTP) okolju preko Cloud Foundry.

Za lokalni razvoj v SAP Business Application Studio se uporabljajo `cds bind` povezave, s katerimi se lokalna aplikacija poveže na dejanske Cloud Foundry servise.

Primer povezave na HANA HDI container:

```bash
cds bind -2 davcne-blagajne-hdi --kind hana
```

Za Event Mesh so vzpostavljene ločene binding konfiguracije za:

```text
messaging
fiscalization-results
```

---

# Testni scenarij

Celoten testni proces:

```text
1. Priprava SAP HANA
        │
        ▼
2. Zagon CAP aplikacije
        │
        ▼
3. Povezava z Event Mesh
        │
        ▼
4. Objava testnega računa
        │
        ▼
5. Subscriber prejme račun
        │
        ▼
6. FiscalizationService
        │
        ├── izračun ZOI
        ├── priprava InvoiceRequest
        ├── JWS podpis
        └── HTTPS → FURS
                 │
                 ▼
7. FURS odgovor
        │
        ├── EOR
        └── morebitna napaka
        │
        ▼
8. Shranjevanje v SAP HANA
        │
        ▼
9. Objava rezultata v Event Mesh
        │
        ▼
10. Rezultatni listener
        │
        └── ZOI / EOR
```

---

# Trenutno stanje projekta

- [x] SAP CAP backend
- [x] CDS podatkovni model
- [x] SAP HANA Cloud
- [x] HDI container
- [x] CAP → HANA binding
- [x] SAP Event Mesh
- [x] sprejem računa preko Event Mesh
- [x] obdelava vhodnega eventa
- [x] izračun ZOI
- [x] JWS podpis
- [x] HTTPS komunikacija s FURS
- [x] obdelava FURS odgovora
- [x] shranjevanje podatkov v HANA
- [x] objava rezultata v Event Mesh
- [x] listener za rezultat
- [x] testna prijava poslovnega prostora

---

# Dokumentacija

Za strukturo in zahteve FURS komunikacije se uporablja:

**Tehnična dokumentacija za davčno potrjevanje računov, verzija 3.2**

Dokument opisuje strukturo zahtev in odgovorov, JSON/JWS sporočila, primere računov ter izračun zaščitne oznake izdajatelja.

---

# Nadaljnja navodila

Podrobna navodila za uporabo projekta bodo dodana v naslednjih poglavjih:

1. **Namestitev in priprava okolja**
2. **Konfiguracija `.env`**
3. **Povezava s SAP HANA Cloud**
4. **Povezava s SAP Event Mesh**
5. **Zagon aplikacije v SAP BAS**
6. **Priprava testnega sporočila v Event Mesh**
7. **Pošiljanje testnega računa**
8. **Preverjanje obdelave v CAP aplikaciji**
9. **Preverjanje podatkov v SAP HANA Database Explorer**
10. **Pridobitev ZOI in EOR rezultata**
11. **Preverjanje rezultata v Event Mesh**
12. **Deploy aplikacije na SAP BTP / Cloud Foundry**
