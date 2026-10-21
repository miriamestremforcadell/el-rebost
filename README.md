# El Rebost · v0.1

PWA en català (React + TypeScript + Vite + Tailwind) per gestionar compra, rebost, tiquets, despesa i la subscripció quincenal de Talkual.
Les dades es guarden **al dispositiu (IndexedDB)**; encara no hi ha sincronització amb el núvol.

## Executar
```
npm install
npm run icons     # regenera les icones
npm run dev       # desenvolupament (http://localhost:5173)
npm test          # lògica de Talkual, inventari i despesa
npm run build && npm run preview
```
## Publicar a GitHub Pages (només cal fer-ho una vegada)
1. Crea un repositori a GitHub (privat o públic; els repos privats només tenen Pages en plans de pagament, així que amb el pla gratuït ha de ser **públic**: el codi serà visible, les teves dades no, perquè viuen a l'iPhone).
2. Puja-hi el contingut d'aquesta carpeta a la branca `main`.
3. Al repo: **Settings → Pages → Build and deployment → Source: «GitHub Actions»**.
4. Cada `git push` a `main` executa els tests, compila i publica. L'adreça serà `https://EL-TEU-USUARI.github.io/NOM-REPO/`.
5. A l'iPhone, obre l'adreça **amb Safari** → Compartir → «Afegeix a la pantalla d'inici». Obre-la sempre des d'aquesta icona.

Les dades no es publiquen mai: viuen a l'iPhone. Fes còpies a Configuració → Dades i privacitat (Inici t'ho recordarà cada 14 dies).

## Estat

**Implementat i provat (proves automàtiques i en navegador, mòbil 390 px)**
- Sis apartats exactes a la barra inferior; tema Automàtic/Clar/Fosc (manual té prioritat) ; persistència en tancar i reobrir.
- Rebost: alta ràpida, ±, consum, retirar malmès, ubicacions, mínims → «a reposar», caducitats, historial de moviments.
- Compra: diverses llistes, avís si ja hi ha existències, estimacions amb origen indicat, confirmar compra → oferta d'afegir al rebost.
- Talkual: calendari quinzenal des del 20-10-2026 (previstos: 3-11 amb pagament 1-11…), estats de pagament i lliurament separats, anul·lació amb/sense cobrament i reemborsament, extres, càlcul 19,95 + extres − descomptes, càrrec real amb diferència, contingut manual de la caixa, recepció **idempotent** (corregir no duplica), no s'afegeix res d'una comanda anul·lada.
- Despesa: només pagaments reals de Talkual i tiquets revisats; cada comanda es compta una vegada.
- Tiquets: entrada manual, foto/galeria/PDF adjunts, comprovació de totals, avís de duplicats, afegir al rebost només si es confirma.
- Anàlisi: períodes setmana/mes/trimestre/any, comparació amb l'anterior, per establiment, evolució mensual, estadístiques de Talkual, historial de preus pagats (€/kg, €/l, €/ud).
- Configuració: tots els subapartats; còpia de seguretat JSON amb restauració (sense fotos ni documents adjunts) i recordatori cada 14 dies; esborrat de documents i de totes les dades.
- Funciona sota subruta (GitHub Pages) i sense connexió: provat servint-la a `/el-rebost/`.

**Escrit però NO aplicat ni provat:** `supabase/migrations/0001_schema.sql` (esquema relacional, restriccions anti-duplicats, RLS, bucket privat).

**Pendent (no implementat)**
- Connexió amb Supabase: autenticació, sincronització, cua de canvis i resolució de conflictes.
- OCR de tiquets (cal servei extern + funció de servidor; ara es revisa tot a mà).
- Notificacions push en segon pla: fora de l'abast actual; es mantenen els avisos dins de l'aplicació.
- Anàlisi per categoria i per cost de productes individuals; recomanacions; pressupostos per categoria amb avisos (es poden configurar, però encara no s'avalua l'avís per categoria).
- Duplicar la caixa anterior com a plantilla; icona per categories més enllà d'emojis; proves a un iPhone real.
- Primer renderitzat: les xifres poden mostrar-se com a 0 uns mil·lisegons abans de carregar les dades.
