# 🛒 Onze Boodschappen — Setup Handleiding

Een gezamenlijke boodschappen-app voor twee personen met realtime sync, magic link login, AI-invoer, favorieten en aanbiedingen.

---

## Wat je nodig hebt

- Een [GitHub account](https://github.com) (gratis)
- Een [Firebase account](https://firebase.google.com) (gratis tier is ruim voldoende)
- Een [Anthropic API key](https://console.anthropic.com) voor de AI-invoer

---

## Stap 1 — Firebase project aanmaken

1. Ga naar [https://console.firebase.google.com](https://console.firebase.google.com)
2. Klik op **"Project toevoegen"** → geef het een naam (bijv. `boodschappen-app`)
3. Volg de stappen (Google Analytics mag uit)

### Firestore inschakelen
1. Ga in je project naar **Build → Firestore Database**
2. Klik **"Database aanmaken"**
3. Kies **"Start in testmodus"** (we updaten de rules daarna)
4. Kies regio: `eur3 (europe-west)` → Klaar

### Authentication inschakelen
1. Ga naar **Build → Authentication**
2. Klik **"Aan de slag"**
3. Ga naar het tabblad **"Sign-in method"**
4. Klik op **"E-mail/wachtwoord"** → zet **"E-mailkoppeling (aanmelden zonder wachtwoord)"** aan → Opslaan

### Je app registreren
1. Ga naar **Project-instellingen** (tandwiel linksboven)
2. Scroll naar "Jouw apps" → klik het **</>** icoon (Web)
3. Geef de app een naam → klik **"Registreer app"**
4. Je ziet nu een `firebaseConfig` object — kopieer dit

---

## Stap 2 — Config invullen

Open `firebase-config.js` en vervang de placeholder-waarden met jouw eigen config:

```js
export const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "boodschappen-app-xxxx.firebaseapp.com",
  projectId:         "boodschappen-app-xxxx",
  storageBucket:     "boodschappen-app-xxxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef",
};
```

---

## Stap 3 — Anthropic API key toevoegen

Open `app.js` en zoek de functie `parseWithClaude`. Voeg je API key toe aan de headers:

```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': 'sk-ant-...',         // ← jouw Anthropic API key
  'anthropic-version': '2023-06-01',
},
```

> **Let op:** voor productiegebruik is het veiliger de API key via een kleine backend (bijv. Cloudflare Worker) te proxyen zodat hij niet zichtbaar is in de browser. Voor thuisgebruik tussen twee mensen is dit prima.

---

## Stap 4 — Firestore beveiligingsregels instellen

1. Ga naar Firebase Console → **Firestore → Regels**
2. Vervang de inhoud met de regels uit het bestand `firestore.rules`
3. Klik **"Publiceren"**

---

## Stap 5 — GitHub Pages deployen

### Repository aanmaken
1. Ga naar [github.com/new](https://github.com/new)
2. Naam: `boodschappen-app`
3. Zet op **Public** (vereist voor gratis GitHub Pages)
4. Klik **"Repository aanmaken"**

### Bestanden uploaden
```bash
# Of gebruik de GitHub web-interface om de bestanden te uploaden
git init
git add .
git commit -m "Initial boodschappen app"
git remote add origin https://github.com/JOUWGEBRUIKERSNAAM/boodschappen-app.git
git push -u origin main
```

### GitHub Pages inschakelen
1. Ga naar je repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)**
4. Klik **Save**

Je app is nu live op: `https://JOUWGEBRUIKERSNAAM.github.io/boodschappen-app`

---

## Stap 6 — Authorized domains instellen

Magic link email werkt alleen als je domein is goedgekeurd in Firebase:

1. Firebase Console → **Authentication → Settings → Authorized domains**
2. Voeg toe: `JOUWGEBRUIKERSNAAM.github.io`

---

## Stap 7 — App installeren op telefoon (PWA)

**iPhone (Safari):**
1. Open de app-URL in Safari
2. Tik op het deel-icoon (□↑)
3. Kies **"Zet op beginscherm"**

**Android (Chrome):**
1. Open de app-URL in Chrome
2. Chrome vraagt automatisch om te installeren, of:
3. Tik op de drie puntjes → **"Toevoegen aan startscherm"**

---

## Stap 8 — Partner koppelen

1. Jij logt in via magic link
2. Ga naar **⚙️ Instellingen**
3. Kopieer je **Huishouden ID**
4. Stuur dit ID naar je vrouw
5. Je vrouw logt in → Instellingen → plakt het ID bij "Partner koppelen" → Koppelen

Jullie zien nu exact dezelfde lijst, realtime gesynchroniseerd.

---

## Icons aanmaken (optioneel maar netjes)

Maak een mapje `icons/` aan en voeg twee PNG-bestanden toe:
- `icons/icon-192.png` — 192×192 pixels
- `icons/icon-512.png` — 512×512 pixels

Je kunt gratis icons genereren op [https://favicon.io](https://favicon.io).

---

## Bestandsstructuur

```
boodschappen-app/
├── index.html          ← Hoofd HTML
├── style.css           ← Alle styling
├── app.js              ← Logica + Firebase + AI
├── firebase-config.js  ← Jouw Firebase config (NIET op GitHub zetten!)
├── firestore.rules     ← Beveiligingsregels (reference)
├── manifest.json       ← PWA manifest
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

> **Belangrijk:** Voeg `firebase-config.js` toe aan je `.gitignore` als je de API key erin zet, of gebruik een aparte config voor productie.

---

## Features samengevat

| Feature | Status |
|---|---|
| Magic link login (e-mail) | ✅ |
| Realtime sync twee personen | ✅ |
| AI-invoer (meerdere producten tegelijk) | ✅ |
| Automatische categorisering | ✅ |
| Afstrepen in de winkel | ✅ |
| "Klaar" knop om lijst leeg te maken | ✅ |
| Favorieten (uitklapbaar, aanpasbaar) | ✅ |
| "Ik ga zo!" notificatie met timer | ✅ |
| Aanbiedingen AH + Jumbo | ✅ (mock — zie fase 2) |
| PWA (installeerbaar op telefoon) | ✅ |

---

## Fase 2 — Aanbiedingen (echt)

De aanbiedingen zijn nu nep/gesimuleerd. Voor echte data:
- **Albert Heijn**: gebruik de inofficiële AH API (`https://api.ah.nl/mobile-services/product/search`)
- **Jumbo**: gebruik de Jumbo productzoeker API
- Of: gebruik een gratis supermarkt-aanbiedingen scraper zoals [supermarktscanner.nl](https://supermarktscanner.nl) die een RSS-feed biedt

Dit kan worden toegevoegd als een apart script dat dagelijks draait via GitHub Actions.
