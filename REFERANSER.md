# Referanser

Denne extensionen er implementert selvstendig, men følgende åpne eksempler og dokumentasjon er brukt for å kontrollere API-mønster, manifest og egenskapsstruktur.

## GitHub

1. **LetsConstructIT / Productivity-Tools**  
   https://github.com/LetsConstructIT/Productivity-Tools  
   Relevant fordi prosjektet er en eksempelapplikasjon bygget med Trimble Connect Workspace API. `App.tsx` viser tilkobling med `WorkspaceAPI.connect(window.parent, ...)`. `MarkupAnnotations.tsx` viser hele kjeden som er brukt for 3D-stemplene: `viewer.getObjectProperties()`, `viewer.getObjectBoundingBoxes()`, konvertering av objektets midtpunkt fra meter til millimeter og `api.markup.addTextMarkup()`.

2. **alsgur0133 / SBIM-TC-WEB**  
   https://github.com/alsgur0133/SBIM-TC-WEB  
   `src/components/IfcPropertyPanel.tsx` viser en praktisk UI-struktur for å presentere Trimble Connect `ObjectProperties` og egenskapssett som tabeller. Dette bekrefter strukturen `obj.properties[] → propertySet.properties[]`.

3. **JonathanG89 / TrimbleConnectTest**  
   https://github.com/JonathanG89/TrimbleConnectTest  
   Viser en enkel statisk HTML-tilnærming med Trimbles Workspace API direkte fra CDN og `TrimbleConnectWorkspace.connect(window.parent, ...)`.

4. **silvervat / trimble-markup-extension**  
   https://github.com/silvervat/trimble-markup-extension  
   Relatert Workspace API-extension med `getObjectProperties`, egenskapsvalg, tekstforhåndsvisning og et konsept for 3D-markups. Prosjektet var nyttig som funksjonell inspirasjon til å kombinere modell-egenskaper til en stempeltekst.

   Kildekoden bruker imidlertid `MarkupAPI.getInstance()` og `addOrUpdateTextMarkups()`, mens den offisielle Workspace API-versjonen som ble kontrollert eksponerer markup-funksjonene som `api.markup.addTextMarkup()`. Denne leveransen bruker derfor det offisielle API-kallet og ikke de eksperimentelle kallene fra repositoryet.

5. **TrekASB / TCGGxt_2**

   https://github.com/TrekASB/TCGGxt_2

   Tidligere, fungerende løsning utviklet for objektpåskrift i Trimble Connect. Bbox-reserveløsningen bekrefter at Y er høydeaksen, at modellkoordinater skal konverteres til millimeter, og at `modelId` og `objectId` bør følge både start- og sluttpunktet. Løsningen bruker også et kameranært punkt på bounding box-en for lange objekter. Disse mønstrene er gjenbrukt i feilrettingen for synlige 3D-stempler.

## Offisiell Trimble-dokumentasjon

- **Trimble Connect – Extend Trimble Connect**  
  https://developer.trimble.com/docs/connect/guides/extend/

- **Trimble Connect Workspace API**  
  https://components.connect.trimble.com/trimble-connect-workspace-api/index.html

- **Workspace API – MarkupAPI**  
  https://components.connect.trimble.com/trimble-connect-workspace-api/interfaces/MarkupAPI.html

- **Workspace API – TextMarkup**  
  https://components.connect.trimble.com/trimble-connect-workspace-api/interfaces/TextMarkup.html

- **Trimble Connect – Property Set API**  
  https://developer.trimble.com/docs/connect/tools/api/property-set/

## Viktig skille

Trimble Connect har både modell-egenskaper som kan leses gjennom Workspace API i 3D-vieweren og en egen cloud-basert Property Set Service for brukerdefinerte/skrivbare PSet-data. Denne extensionen bruker førstnevnte for å lese og presentere egenskaper på valgte modellobjekter. Den oppretter eller endrer ikke Property Set Service-data.
