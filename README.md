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
- Oppretter et tekstmarkup for hvert valgt objekt via `viewer.getObjectBoundingBoxes()` og `markup.addTextMarkup()`.
- Bruker `viewer.onPicked` til å feste påskriften i det faktiske klikkpunktet på objektets overflate når Trimble leverer slike data.
- Bruker overflatenormalen til å plassere tekstpunktet nøyaktig 1 mm utenfor geometrien. Midten av objektets øvre bounding-box-flate brukes som reserve.
- Beholder `modelId` og `objectId` i begge markup-punktene.
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
4. Klikk på ønsket plassering på objektet, og velg deretter farge og eventuell tallavrunding.
5. Klikk **Plasser påskrift 1 mm over objektet**.

Stempelteksten bygges separat for hvert objekt, slik at hvert objekt får sine egne egenskapsverdier. Når brukeren klikker på objektet, lagres posisjon og overflatenormal fra `viewer.onPicked`. Startpunktet legges på overflaten og tekstpunktet 1 mm langs normalen. Begge punktene inneholder objektets `modelId` og `objectId`. Dersom klikkdata mangler, brukes midten av den øvre bounding-box-flaten med 1 mm avstand. Workspace API bruker millimeter for markup-punkter, derfor konverteres modellkoordinatene med faktor 1000.

## Begrensninger

- Maks 250 valgte objekter lastes samtidig i denne versjonen for å unngå treghet ved store utvalg. Verdien kan endres i `app.js`.
- Visningen avhenger av hvilke egenskaper Trimble Connect har tilgjengelig på objektet i den lastede modellen.
- Workspace API-et tilbyr farge, tekst og start-/sluttpunkt for `TextMarkup`, men ikke egne parametere for skrifthøyde eller rammetype. Disse to valgene fra referansebildet er derfor ikke simulert i brukergrensesnittet.
- `TextMarkup` er alltid en lesbar, kameravendt annotasjon i Trimble Connect. API-et tilbyr ikke rotasjon av selve teksten som en fysisk tekstgeometri langs objektets materiale; «drapering» betyr derfor at festepunktet ligger på flaten og teksten 1 mm utenfor den.
- Markups lever i den aktive 3D-visningen. Om de følger med videre, avhenger av hvordan visningen lagres og deles i Trimble Connect.
- Knappen **Fjern opprettede stempler** fjerner bare markup-ID-ene som denne extensionen har opprettet i gjeldende økt. Den sletter ikke andres markups.

Se `REFERANSER.md` for GitHub-kilder og offisiell Trimble-dokumentasjon som er brukt som teknisk referanse.
