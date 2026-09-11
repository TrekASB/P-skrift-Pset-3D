# PSet-visning og 3D-stempler for Trimble Connect

En lettvekts 3D-extension som viser egenskaper strukturert etter valgt Property Set (PSet). Grensesnittet er på norsk og er laget for å fungere som en statisk webapp uten byggesteg.

## Funksjoner

- Leser gjeldende utvalg i Trimble Connect 3D.
- Henter Property Sets via Workspace API `viewer.getObjectProperties()`.
- PSet-velger med dekning ved flervalg.
- Strukturert tabell med søk og filter for tomme verdier.
- Flervalg: viser felles verdi eller «Varierer», samt dekning per egenskap.
- Kopiering av aktivt PSet til utklippstavlen.
- CSV-eksport med semikolonseparator og UTF-8 BOM (Excel-vennlig i norsk oppsett).
- 3D-stempel inspirert av vedlagt referansebilde: velg egenskapsrader, prefiks og suffiks, med live forhåndsvisning.
- Oppretter et tekstmarkup ved sentrum av hvert valgt objekt via `viewer.getObjectBoundingBoxes()` og `markup.addTextMarkup()`.
- Valgfri stempelfarge og tallavrunding.
- Fjerner bare stemplene som extensionen selv har opprettet i gjeldende visningsøkt.
- Kortoppsett lagres i `localStorage` per PSet.

## Publisering på GitHub Pages

Repository: `TrekASB/P-skrift-Pset-3D`.

1. GitHub Pages skal bruke `main`-grenen og repository-roten.
2. Kontroller at disse adressene kan åpnes i nettleseren:
   - `https://trekasb.github.io/P-skrift-Pset-3D/`
   - `https://trekasb.github.io/P-skrift-Pset-3D/extension.json`
3. I Trimble Connect for Browser: **Project Settings → Apps & Capabilities → Add Custom** og lim inn URL-en til `extension.json`.

> Bare prosjektadministratorer kan legge til eller aktivere egendefinerte extensions i et prosjekt.

## Arkitektur

Løsningen er ren HTML/CSS/JavaScript. Workspace API lastes fra Trimbles offisielle IIFE/CDN:

```html
<script src="https://components.connect.trimble.com/trimble-connect-workspace-api/index.js"></script>
```

Tilkobling skjer med:

```js
TrimbleConnectWorkspace.connect(window.parent, onEvent, 30000)
```

Extensionen bruker ikke OAuth eller Property Set REST API. Den leser modellobjektenes eksisterende egenskaper i 3D-vieweren og oppretter Workspace API-markups i den aktive 3D-visningen.

## Bruk av 3D-stempel

1. Velg ett eller flere objekter i Trimble Connect 3D.
2. Velg PSet og åpne fanen **3D-stempel**.
3. Velg egenskapsrader og legg eventuelt inn prefiks og suffiks.
4. Velg farge og eventuell tallavrunding.
5. Klikk **Plasser 3D-stempel på valgte objekter**.

Stempelteksten bygges separat for hvert objekt, slik at hvert objekt får sine egne egenskapsverdier. Plasseringen beregnes fra midtpunktet i objektets bounding box. Workspace API bruker millimeter for markup-punkter, derfor konverteres modellkoordinatene med faktor 1000 i samme mønster som `LetsConstructIT/Productivity-Tools`.

## Begrensninger

- Maks 250 valgte objekter lastes samtidig i denne versjonen for å unngå treghet ved store utvalg. Verdien kan endres i `app.js`.
- Visningen avhenger av hvilke egenskaper Trimble Connect har tilgjengelig på objektet i den lastede modellen.
- Workspace API-et tilbyr farge, tekst og start-/sluttpunkt for `TextMarkup`, men ikke egne parametere for skrifthøyde eller rammetype. Disse to valgene fra referansebildet er derfor ikke simulert i brukergrensesnittet.
- Markups lever i den aktive 3D-visningen. Om de følger med videre, avhenger av hvordan visningen lagres og deles i Trimble Connect.
- Knappen **Fjern opprettede stempler** fjerner bare markup-ID-ene som denne extensionen har opprettet i gjeldende økt. Den sletter ikke andres markups.

Se `REFERANSER.md` for GitHub-kilder og offisiell Trimble-dokumentasjon som er brukt som teknisk referanse.
