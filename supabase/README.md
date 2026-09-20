# Supabase setup

Stappen die alleen jij kunt doen. De app start ook zonder dit — hij laat dan een
"nog niet gekoppeld"-scherm zien in plaats van te crashen — maar er wordt niets
bewaard tot dit klaar is.

## 1. Project aanmaken

1. <https://supabase.com/dashboard> → **New project**. Kies regio **West EU
   (Ireland)**, dan blijven ledengegevens in de EU.
2. Bewaar het databasewachtwoord ergens veilig.

## 2. De SQL draaien

Voor een nieuw project is `schema.sql` alles in één keer. Kopieer hem vanuit de
projectmap naar het klembord:

```bash
Get-Content supabase/schema.sql | Set-Clipboard
```

Dan **SQL Editor → New query**, plakken, **Run**. Hij hoort te eindigen met
"Success. No rows returned".

De genummerde bestanden zijn hetzelfde, opgesplitst, en zijn wat je draait op een
project dat al bestaat:

    001-core.sql              tabellen, types, helperfuncties, profiel-trigger
    002-rls.sql               row level security — tot dit draait staan de
                              tabellen open
    003-rpc.sql               create_group, redeem_invite, group_members,
                              member_enrollments, enrollment_sheet, set_sign_off
    010-eisen.sql             de diploma's, hun eisen en de losse onderdelen
    011-laatste-beheerder.sql een groep kan zijn laatste beheerder niet
                              kwijtraken
    012-onderdelen.sql        eisen kunnen losse onderdelen hebben (knopen,
                              commando's, termen)

`010-eisen.sql` draait **als laatste**, ook al is zijn nummer lager. De catalogus
hangt aan elke schemawijziging die erna genummerd is, dus hij wordt steeds
opnieuw geladen nadat de rest gedraaid heeft. `schema.sql` zet ze al in die
volgorde.

`010-eisen.sql` mag je zo vaak draaien als je wilt: hij werkt bij op `code`, dus
ids blijven gelijk en aftekeningen die er al zijn blijven kloppen. Zie
[docs/EISEN.md](../docs/EISEN.md).

## 3. Inloggen met e-mail aanzetten

**Authentication → Providers → Email**: aan, en zet **Confirm email** voorlopig
uit zodat testers meteen kunnen inloggen. Zet hem weer aan voor echt gebruik.

## 4. De app eraan koppelen

Zet in een `.env` in de projectmap (kopieer `.env.example`, niet hernoemen —
dat voorbeeld wil je houden):

    EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

Allebei staan ze in het dashboard onder **Project Settings**: de URL bij
**Data API**, de sleutel bij **API Keys**. Neem de *publishable* sleutel, niet de
*secret* — die laatste omzeilt alle policies en hoort nooit in een app die je
uitdeelt. Oudere projecten hebben in plaats daarvan een JWT-`anon`-sleutel; die
mag ook, onder de naam `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

`.env` staat in `.gitignore`. Start `npx expo start` opnieuw na het wijzigen —
Expo leest deze bij het bundelen, niet tijdens het draaien.

## 5. Je groep maken

Maak een account in de app en kies op het welkomstscherm **Een nieuwe groep
beginnen**. Dat roept `create_group()` aan en maakt jou beheerder. Vanuit
Meer → Beheer wijs je instructeurs aan en deel je codes uit.

## De policies testen zonder server

```bash
npm run test:db
```

Draait de migraties tegen een echte Postgres die naar WebAssembly is
gecompileerd (PGlite — geen Docker, geen netwerk, niets te installeren) en
probeert de policies daarna te breken: een lid dat zichzelf wil aftekenen, een
instructeur die op andermans naam tekent, een andere groep die meekijkt, een eis
van het verkeerde diploma.

Dit bestaat omdat RLS-fouten stil zijn. Een verkeerde policy geeft geen foutmelding;
rijen verdwijnen gewoon, of duiken op bij de verkeerde persoon. Draai dit na elke
wijziging in de SQL.

## Afspraken

- Elke schemawijziging komt als een genummerd `0NN-naam.sql` dat jij draait, en
  `schema.sql` wordt bijgewerkt (die is gegenereerd — bewerk de genummerde
  bestanden). Wijzig nooit een bestand dat al gedraaid is, behalve `010-eisen.sql`,
  dat daar juist voor gemaakt is.
- Policies zijn zo geschreven dat iemand alleen bij de eigen groep kan. Wat niet
  in een policy past, is een `security definer`-functie in `003-rpc.sql`, en elk
  van die functies controleert zelf `auth.uid()`. Die controle is het enige
  tussen een beller en de gegevens van een andere groep — haal er geen weg om
  iets te "vereenvoudigen".
