# Itelis – Davčne blagajne

CAP aplikacija za obdelavo računov in fiskalizacijo računov pri **FURS**. Aplikacija uporablja **SAP Event Mesh** za asinhrono izmenjavo sporočil in **SAP HANA Cloud** za trajno shranjevanje računov, odgovorov ter podatkov, povezanih s fiskalizacijo.

Projekt je implementiran kot **SAP Cloud Application Programming Model (CAP)** aplikacija v Node.js.

---

## Arhitektura

Glavni podatkovni tok aplikacije je:

```text
                    ┌─────────────────────┐
                    │    SAP Event Mesh   │
                    │                     │
                    │ invoice/created     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    CAP aplikacija   │
                    │                     │
                    │  subscriber.js     │
                    │  messaging.js      │
                    │  fiscalization-    │
                    │  service.js        │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
             ┌──────────────┐      ┌──────────────┐
             │ SAP HANA      │      │     FURS     │
             │ Cloud / HDI   │      │  fiskalizacija│
             │ Container     │      │              │
             └──────────────┘      └──────┬───────┘
                                          │
                                   ZOI + EOR + status
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │    SAP HANA Cloud    │
                              │                     │
                              │ Invoice             │
                              │ Response            │
                              │ ErrorLog            │
                              └─────────────────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │    SAP Event Mesh   │
                              │                     │
                              │ fiscalization-      │
                              │ results             │
                              └─────────────────────┘
```

### Potek obdelave

1. Zunanji sistem objavi račun na **SAP Event Mesh** topic.
2. CAP aplikacija prejme sporočilo iz ustreznega queue-a.
3. Podatki računa se obdelajo in shranijo v **SAP HANA Cloud**.
4. Aplikacija izvede fiskalizacijo pri **FURS**.
5. FURS vrne rezultat fiskalizacije, vključno z:
   - statusom,
   - **ZOI**,
   - **EOR**,
   - časom obdelave in drugimi relevantnimi podatki.
6. Rezultat se shrani v SAP HANA Cloud.
7. Rezultat fiskalizacije se objavi nazaj v **SAP Event Mesh**.
8. Rezultat lahko odjemalec prebere iz rezultatnega queue-a.

---

# Struktura projekta

```text
Itelis-davcne-blagajne/
│
├── db/
│   └── fiscal.cds
│
├── srv/
│   ├── fiscalization-service.js
│   ├── handler.js.bak
│   ├── messaging.js
│   ├── register-premise-test.js
│   ├── results-listener.js
│   ├── server.js
│   ├── subscriber.js
│   │
│   └── furs/
│       ├── certificate.js
│       ├── furs-client.js
│       ├── jws.js
│       ├── test-certificate.js
│       ├── test-furs.js
│       ├── test-jws.js
│       ├── test-zoi.js
│       └── zoi.js
│
├── certificates/
│   ├── 10698655-1.p12
│   ├── 69064792-2.p12
│   ├── blagajne-test.fu.gov.si.cer
│   ├── furs-ca-chain.pem
│   ├── sigov-ca2.pem
│   ├── sigov-ca2.xcert.crt
│   ├── si-trust-root.crt
│   └── si-trust-root.pem
│
├── env/
│   └── .env1
│
├── .vscode/
│   ├── launch.json
│   └── tasks.json
│
├── .cdsrc-private.json
├── .env
├── .gitignore
├── cdsrc-private.json
├── db.sqlite
├── default-env.json
├── em-params.json
├── manifest.yml
├── package.json
├── package-lock.json
├── README.md
└── xs-security.json
```

> `node_modules`, `.git`, `gen` in druge generirane mape niso vključene v prikaz strukture.

---

# Glavne mape in datoteke

## `db/`

### `db/fiscal.cds`

Glavni CDS podatkovni model aplikacije.

Model definira podatkovne entitete, ki se ob deployu pretvorijo v SAP HANA artefakte.

Med njimi so podatki za:

- račune (`Invoice`),
- odgovore fiskalizacije (`Response`),
- napake (`ErrorLog`).

Na osnovi CDS modela se generirajo HANA tabele in pogledi.

---

## `srv/`

V tej mapi je glavna poslovna logika aplikacije.

### `server.js`

Vstopna točka CAP strežnika.

Zažene CAP aplikacijo in naloži definirane servise ter subscriberje.

### `subscriber.js`

Obravnava vhodna sporočila iz SAP Event Mesh.

Njegova glavna naloga je sprejem sporočila o ustvarjenem računu in sprožitev nadaljnje obdelave.

### `messaging.js`

Konfiguracija oziroma pomoč pri komunikaciji s SAP Event Mesh.

Uporablja CAP messaging konfiguracijo in vezavo na Enterprise Messaging servis.

### `fiscalization-service.js`

Glavna logika fiskalizacije.

Povezuje sprejeti račun s postopkom fiskalizacije pri FURS ter obravnava rezultat.

### `results-listener.js`

Posluša oziroma obravnava rezultate fiskalizacije, ki se pojavijo na rezultatnem toku sporočil.

### `register-premise-test.js`

Testna logika za registracijo oziroma preverjanje poslovnega prostora za testno okolje.

---

# FURS integracija

Mapa:

```text
srv/furs/
```

vsebuje logiko za komunikacijo s sistemom FURS.

### `furs-client.js`

Implementacija komunikacije s FURS.

### `certificate.js`

Delo s certifikati, potrebnimi za komunikacijo s FURS.

### `jws.js`

Implementacija oziroma obdelava JWS podpisovanja podatkov.

### `zoi.js`

Logika za izračun oziroma delo z ZOI.

### Testne datoteke

```text
test-certificate.js
test-furs.js
test-jws.js
test-zoi.js
```

se uporabljajo za preverjanje posameznih delov FURS integracije.

---

# SAP Event Mesh

Aplikacija uporablja **SAP Event Mesh** za asinhrono komunikacijo.

Vhodni tok uporablja topic:

```text
itelis/fiscal/test/invoice/created
```

Primer testnega sporočila:

```json
{
  "invoiceId": "25",
  "taxNumber": "10698655",
  "amount": 250.75,
  "timestamp": "2026-09-07T12:00:00",
  "premiseId": "POS1",
  "deviceId": "DEV1"
}
```

Aplikacija sporočilo prejme iz ustreznega Event Mesh queue-a.

Po uspešni fiskalizaciji se rezultat objavi na rezultatni tok.

Primer rezultata, ki ga je mogoče prejeti v Event Mesh:

```json
{
  "data": {
    "invoiceId": "25",
    "status": "CONFIRMED",
    "zoi": "6557229d3af1a54ddbe79074e8478ec6",
    "eor": "99996046-8c65-41dc-9403-f6c3def4384d",
    "premiseid": "POS1",
    "deviceid": "DEV1",
    "amount": 250.75,
    "timestamp": "2026-09-08T10:23:23.934Z"
  }
}
```

Pomembno je, da rezultat ni samo sporočilo za Event Mesh. Podatki o fiskalizaciji se hkrati trajno shranijo v SAP HANA Cloud.

---

# SAP HANA Cloud

Za podatkovno bazo se uporablja **SAP HANA Cloud** preko **HDI containerja**.

Uporabljeni servisni instanci sta:

```text
davcne-blagajne-hdi
davcne-blagajne-test
```

`davcne-blagajne-hdi` predstavlja HDI container, aplikacija pa je preko njega povezana na HANA Cloud okolje.

CDS konfiguracija uporablja:

```json
"db": {
  "kind": "hana",
  "model": [
    "srv",
    "db"
  ]
}
```

Uporablja se paket:

```text
@cap-js/hana
```

---

## HANA tabele

Iz `db/fiscal.cds` se generirajo HANA artefakti, med drugim:

```text
FISC_INVOICE
FISC_RESPONSE
FISC_ERRORLOG
```

in ustrezni pogledi za CAP servis.

V `FISC_INVOICE` se hranijo podatki vhodnih računov.

V `FISC_RESPONSE` se hranijo rezultati fiskalizacije, vključno z rezultatom FURS ter podatki, kot sta **ZOI** in **EOR**.

`FISC_ERRORLOG` se uporablja za beleženje napak.

---

# Lokalna povezava na HDI container

Za lokalni razvoj v SAP Business Application Studio ali drugem okolju se uporablja `cds bind`.

Primer:

```bash
cds bind -2 davcne-blagajne-hdi --kind hana
```

Nato lahko preverimo aktivno konfiguracijo:

```bash
cds env get requires.db --profile hybrid
```

Pri pravilni vezavi mora biti vidna konfiguracija tipa:

```text
kind: hana
```

in binding na:

```text
davcne-blagajne-hdi
```

---

# Deploy podatkovnega modela

Po uspešnem `cds bind` lahko CDS model deployamo v HDI container:

```bash
cds deploy --to hana --profile hybrid
```

Uspešen deploy ustvari oziroma posodobi HANA artefakte na podlagi `db/fiscal.cds`.

Primer uspešnega deploya vključuje tabele:

```text
fisc.Invoice
fisc.Response
fisc.ErrorLog
```

ter ustrezne CDS view-e.

---

# SAP Event Mesh binding

Za lokalno uporabo Event Mesh storitve se uporablja `cds bind`.

Primer:

```bash
cds bind -2 event_mesh --for messaging --kind enterprise-messaging-amqp
```

Za rezultate fiskalizacije:

```bash
cds bind -2 event_mesh --for fiscalization-results \
  --kind enterprise-messaging-amqp
```

Nato lahko aplikacijo zaženemo preko vezanih servisov.

Primer:

```bash
cds bind --exec -- cds watch --profile hybrid
```

S tem aplikacija uporablja Cloud Foundry service bindings namesto ročnega vnosa credentials v okolje.

---

# Environment in konfiguracijske datoteke

Projekt vsebuje več konfiguracijskih datotek.

## `.env`

Lokalne okoljske spremenljivke.

## `default-env.json`

Lokalna simulacija oziroma podajanje okolja, podobnega Cloud Foundry okolju.

## `.cdsrc-private.json`

Lokalne CDS service bindings, ki jih ustvari `cds bind`.

Ta datoteka lahko vsebuje podatke za dostop do Cloud Foundry servisov in je zato ne smemo po nepotrebnem objavljati.

## `cdsrc-private.json`

Projektna CDS konfiguracija za zasebne oziroma lokalne nastavitve.

## `em-params.json`

Parametri, povezani z uporabo SAP Event Mesh.

## `env/.env1`

Dodatna okoljska konfiguracija za lokalno okolje.

---

# Certifikati

Mapa:

```text
certificates/
```

vsebuje certifikate, ki se uporabljajo pri komunikaciji s testnim okoljem FURS.

Med njimi so:

- FURS certifikati,
- CA chain certifikati,
- SIGOV certifikati,
- root certifikati,
- `.p12` certifikati.

**V produkcijskem Git repozitoriju se zasebnih ključev in produkcijskih certifikatov ne sme objavljati.**

Če so certifikati namenjeni samo lokalnemu testiranju, jih je priporočljivo upravljati ločeno in ustrezne datoteke dodati v `.gitignore`.

---

# Cloud Foundry

Aplikacija je namenjena izvajanju v SAP BTP Cloud Foundry okolju.

Trenutno testno okolje uporablja:

```text
API:
https://api.cf.eu10-004.hana.ondemand.com

Space:
BTP_test
```

Pred deployom preverimo:

```bash
cf target
```

Servisne instance lahko preverimo z:

```bash
cf services
```

Za preverjanje konkretnih servisov:

```bash
cf services | grep davcne-blagajne
```

Pri pravilni konfiguraciji morata biti servisa v stanju:

```text
create succeeded
```

---

# Lokalni razvoj

Za razvoj in testiranje je osnovni način zagona:

```bash
cds bind --exec -- cds watch --profile hybrid
```

`hybrid` profil omogoča uporabo dejanskih Cloud Foundry servisov, na katere je projekt vezan.

Pri pravilni konfiguraciji se ob zagonu izpiše povezava na:

```text
db > hana
```

in podatki o uporabljenem HDI containerju.

Za Event Mesh mora biti poleg baze pravilno vzpostavljen tudi messaging binding.

---

# Testni scenarij

Celoten testni scenarij je sestavljen iz treh glavnih delov:

### 1. Pošlji testni račun v Event Mesh

V SAP Event Mesh se objavi sporočilo na:

```text
itelis/fiscal/test/invoice/created
```

Primer:

```json
{
  "invoiceId": "25",
  "taxNumber": "10698655",
  "amount": 250.75,
  "timestamp": "2026-09-07T12:00:00",
  "premiseId": "POS1",
  "deviceId": "DEV1"
}
```

### 2. CAP aplikacija obdela račun

Subscriber prejme sporočilo in sproži fiskalizacijo.

Podatki se shranijo v SAP HANA Cloud, nato se izvede komunikacija s FURS.

### 3. Preberi rezultat

Po uspešni fiskalizaciji se rezultat objavi na rezultatni Event Mesh queue.

Primer:

```json
{
  "data": {
    "invoiceId": "25",
    "status": "CONFIRMED",
    "zoi": "6557229d3af1a54ddbe79074e8478ec6",
    "eor": "99996046-8c65-41dc-9403-f6c3def4384d",
    "premiseid": "POS1",
    "deviceid": "DEV1",
    "amount": 250.75,
    "timestamp": "2026-09-08T10:23:23.934Z"
  }
}
```

Rezultat lahko preverimo v:

- SAP Event Mesh,
- SAP HANA Database Explorer,
- CAP aplikaciji oziroma logih.

---

# Preverjanje podatkov v SAP HANA Database Explorer

Po uspešni obdelavi računa se lahko na SAP HANA Cloud povežemo preko **SAP HANA Database Explorer**.

Podatke lahko preverimo v tabelah:

```text
FISC_INVOICE
FISC_RESPONSE
FISC_ERRORLOG
```

Primer:

```sql
SELECT *
FROM "FISC_INVOICE"
ORDER BY "CREATEDAT" DESC;
```

in:

```sql
SELECT *
FROM "FISC_RESPONSE"
ORDER BY "CREATEDAT" DESC;
```

Pri uspešni fiskalizaciji mora biti v podatkih mogoče najti rezultat fiskalizacije, vključno z ZOI in EOR.

---

# Tehnologije

Projekt uporablja:

- **SAP CAP**
- **Node.js**
- **SAP HANA Cloud**
- **SAP HDI Container**
- **SAP Event Mesh**
- **SAP BTP Cloud Foundry**
- **FURS fiskalizacijski sistem**
- **JWS**
- **X.509 certifikate**
- **Cloud Foundry service bindings**

---

# Status projekta

Trenutna implementacija omogoča:

- sprejem računov preko SAP Event Mesh,
- obdelavo računov v CAP aplikaciji,
- povezavo s SAP HANA Cloud,
- trajno shranjevanje računov,
- fiskalizacijo pri FURS,
- shranjevanje rezultata fiskalizacije,
- shranjevanje ZOI in EOR,
- objavo rezultata nazaj v SAP Event Mesh,
- preverjanje rezultatov preko Event Mesh in HANA Database Explorer.

Podrobna navodila za namestitev, konfiguracijo servisov, pripravo testnega Event Mesh sporočila in izvedbo celotnega testnega scenarija so lahko dodana v naslednjih poglavjih.
