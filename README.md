# Aftekenboek

De vorderingenstaat voor de Watersport Academy-diploma's van een Scoutinggroep,
als app voor iOS en Android. Een instructeur tekent op de steiger per eis af;
een lid ziet op zijn eigen telefoon hoe ver hij is.

## Wat het doet

- **Per eis aftekenen.** Elke eis uit het handboek is een regel met een vinkje.
  Aftekenen zet de datum en de naam van de instructeur erbij, en kan weer terug.
  Een notitie bij een eis kan ook ("nog een keer bij meer wind").
- **Praktijk en theorie apart.** Ze worden apart geëxamineerd, dus ze hebben elk
  hun eigen voortgangsbalk.
- **Alleen instructeurs tekenen af.** Een lid kan zijn eigen lijst lezen en
  verder niets: niet zichzelf inschrijven, niet zichzelf aftekenen. Dat is niet
  alleen de app die knoppen verbergt — de database weigert het (zie
  `supabase/002-rls.sql`).
- **Theorie-examen met houdbaarheid.** Een gehaald theorie-examen is 18 maanden
  geldig. De app rekent dat door en waarschuwt voordat het verloopt, niet erna.
- **De eisen als naslag.** Alle twaalf diploma's met hun complete eisenlijst zijn
  te lezen, ook door iemand die er nog niet aan begonnen is.

## Opzet

    src/app/          de schermen (expo-router)
    src/components/   ui.tsx (de bouwstenen), icons.tsx, voortgang.tsx
    src/lib/          api.ts, session.ts, types.ts, dates.ts
    src/theme.ts      kleuren en typografie, met contrastberekening
    supabase/         het schema, de policies en de eisen
    docs/EISEN.md     waar de eisen vandaan komen en hoe je ze bijwerkt

Drie lagen in de database, met opzet gescheiden: **tenancy** (groep, speltakken,
rollen), **catalogus** (de landelijke diploma's en eisen, voor elke groep gelijk
en niet vanuit de app te wijzigen) en **voortgang** (wie waaraan werkt en wat er
afgetekend is).

## Aan de praat

```bash
npm install
```

Zet daarna Supabase op — de stappen staan in
[supabase/README.md](supabase/README.md) — en maak een `.env`:

    EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...

Dan:

```bash
npx expo start
```

Zonder `.env` start de app ook; hij zegt dan dat hij nog niet gekoppeld is in
plaats van te crashen.

## Controles

```bash
npm run test:db
```

Draait de migraties tegen een echte Postgres in WebAssembly en probeert daarna de
policies te breken. RLS-fouten zijn stil — een verkeerde policy geeft geen
foutmelding, rijen verdwijnen gewoon of duiken op bij de verkeerde persoon.
Draai dit na elke wijziging in `supabase/`.

```bash
npm run typecheck
npm run export:android
npm run export:ios
```

Beide bundels horen te bouwen voordat iets af is: de app draait op een iPhone én
op een Android-toestel, en een fout die maar op één platform opduikt, kost anders
een testronde.
