# De eisen: waar ze vandaan komen en hoe je ze bijwerkt

De eisen in deze app zijn overgenomen uit de handboeken van de CWO-diplomalijn
zoals die binnen Scouting gebruikt worden. Scouting Nederland heeft zich per
1 januari 2026 aangesloten bij de diploma-eisen van de Watersport Academy; de
eisen zijn landelijk vastgesteld en voor elke groep gelijk. Daarom staat de
catalogus in de database los van de groepen, en kan hij niet vanuit de app
gewijzigd worden.

## Wat er in staat

| Discipline | Diploma's | Bron |
| --- | --- | --- |
| Roeien | Roeien I/II, Roeien III | Handboek Opleidingen deel 3.2 Roeien (2015) |
| Zeilen (kielboot) | Kielboot I t/m IV | Handboek Opleidingen deel 3.1 Kielboot (2015) |
| Buitenboordmotor | Buitenboordmotor I/II, III | Handboek Opleidingen deel 3.3 (2015) |
| Sloep en motorvlet | Bemanningslid, Dagschipper, Schipper, All Round Schipper | Handboek Sloep- en motorvletvaren (concept 25-2-2020) |

Samen 12 diploma's en ruim 250 eisen, elk met het nummer dat hij in het handboek
heeft, zodat de lijst op het scherm en het boekje in je hand gelijk oplopen.

## Toelichtingen

Bij elke eis van de acht diploma's voor roeien, kielboot en buitenboordmotor
staat de toelichting uit het handboek: welke knopen, hoe de acht gevaren wordt,
wat er bij een man-over-boordmanoeuvre in welke volgorde gebeurt. Ze zijn
ingekort — het handboek is uitvoeriger dan wat je op een steiger leest — maar
volgen de tekst op de voet.

Twee dingen zijn samengevat in plaats van uitgeschreven:

- **De BPR-artikellijsten.** Vanaf Roeien III en Kielboot III somt het handboek
  tientallen artikelen, bijlagen en verkeerstekens op. In de app staat waar het
  over gaat; voor de volledige opsomming blijft het handboek nodig.
- **Eisen die letterlijk gelijk zijn aan een lager niveau** verwijzen daarnaar
  ("als bij Kielboot III") en noemen daarna wat er bij dat niveau bij komt.

## Losse onderdelen binnen een eis

"Schiemanswerk" is één eis, maar er zitten zes knopen achter. Waar het handboek
zo'n opsomming geeft — knopen, roeicommando's, zeiltermen, onderdelen van de
boot — staan die als losse regels onder de eis, uitklapbaar op de aftekenlijst.
Ruim 200 stuks over alle diploma's.

Ze worden afgetekend zoals alles hier, met datum en naam, maar **ze tellen niet
mee in de voortgang**: alle zes de knopen gelegd is niet hetzelfde als "beheerst
schiemanswerk", en die beoordeling blijft van de instructeur. Het aantal eisen
van een diploma blijft dus staan op wat het handboek zegt.

De code van een onderdeel is die van zijn eis plus het nummer: `roeien-12.t1.3`
is de derde knoop van Schiemanswerk bij Roeien I/II. Toevoegen gaat in hetzelfde
bestand, in het blok onderaan:

```sql
('kielboot-1.t1', 7, $$Slipsteek$$),
```

Bewust **niet** uitgesplitst: de artikellijsten uit het Binnenvaartpolitie-
reglement. Vanaf Roeien III en Kielboot III zijn dat er tientallen, en een scherm
met tachtig vinkjes helpt niemand op een steiger.

Onderdelen gaan één laag diep; de database weigert een onderdeel van een
onderdeel.

## Wat je nog moet nakijken

**Sloep en motorvlet.** Dat handboek heeft geen toelichting per eis — alleen
beoordelingsrichtlijnen — dus daar staat bij de praktijkeisen het
handboek-onderdeel waar ze onder vallen (Havenmanoeuvres, Navigatie,
Noodsituaties, …) en verder niets.

Belangrijker: het handboek zet die eisen niet per niveau onder elkaar maar in
één matrix met een kolom per niveau, en die kolommen zijn uit de PDF niet
betrouwbaar te lezen. Daarom staat bij alle vier de niveaus dezelfde volledige
lijst. Dat is met opzet de ruime kant: een eis die er niet bij hoort zie je staan
en haal je weg, een eis die ontbreekt zie je nooit. Loop deze lijst één keer met
het handboek ernaast na.

Waar het handboek zelf al aangeeft dat iets pas vanaf een bepaald niveau geldt
(nachtvaren, slepen, Klein Vaarbewijs) staat dat in de toelichting van die eis.

`npm run test:db` bewaakt dit: elke eis buiten sloep/motorvlet moet een
toelichting hebben, anders faalt de test met de diplomacodes erbij.

## Hoe je iets wijzigt

Alles staat in [`supabase/010-eisen.sql`](../supabase/010-eisen.sql). Dat bestand
is gemaakt om opnieuw gedraaid te worden: elke regel werkt bij op zijn `code`, dus

- ids blijven gelijk, en
- aftekeningen die al gezet zijn blijven aan dezelfde eis hangen.

Dus: pas het bestand aan, plak het in de SQL Editor van Supabase, Run. Je hoeft
niets te verwijderen en niemand raakt voortgang kwijt.

**Een toelichting toevoegen** — vervang `null` achter de titel door de tekst,
tussen `$$ … $$`:

```sql
('kielboot-1', 'kielboot-1.p6', 'praktijk', 6, $$Overstag gaan$$,
 $$De boot gaat met de kop door de wind, zonder dat hij in de wind blijft hangen.$$),
```

De `$$`-aanhalingstekens zijn er zodat een apostrof in "Roeicommando's" niets
kapot maakt.

**Een eis weghalen.** Verwijder de regel uit het bestand én haal hem uit de
database, want opnieuw draaien voegt alleen toe en werkt bij:

```sql
delete from requirements where code = 'sloep-1.p25';
```

**Een diploma toevoegen.** Zet er een regel bij in het `diplomas`-blok met een
eigen `code`, en daarna zijn eisen met codes die met diezelfde code beginnen.

**Let op bij hernummeren.** Op `requirements` staat `unique (diploma_id, kind,
position)`. Twee eisen omwisselen van nummer in één keer botst daarop. Geef de
ene tijdelijk een hoog nummer, draai, zet hem daarna goed.

## Wat de app niet bijhoudt

- **Vaarkilometers en -mijlen.** De Watersport Academy stelt die als instapeis
  voor de hogere niveaus. Er is nu geen logboek in de app; dat is een losse
  uitbreiding.
- **Instructeursdiploma's** (I-2, I-3, I-4) en de PvB's die daarbij horen.
- **Het landelijke theorie-examen zelf.** De app houdt alleen de datum bij
  waarop iemand slaagde, en rekent daar de geldigheid van 18 maanden overheen.

## Eigen lijsten naast de landelijke

Sinds 018 kan een groep zijn eigen lijsten maken: een insigne (bemanningslid),
of de verkorte eisen waarmee een vlet op kamp werkt. Ze staan in dezelfde
tabellen, met één verschil:

    group_id is null      landelijk. Van niemand, voor iedereen zichtbaar, en
                          alleen te wijzigen door dit bestand opnieuw te draaien.
    group_id is not null  van één groep. Alleen die groep ziet hem; zijn
                          instructeurs en beheerders mogen hem bewerken.

Een eigen lijst is een `diploma` of een `insigne` (`diplomas.kind`) en hangt
onder geen enkele landelijke discipline — in de app staat hij onder een eigen
kopje. Aftekenen, voortgang en bakken werken er precies zo op als op een
landelijk diploma.

Je maakt er een in de app (Diploma's › Eigen lijst maken) of op de beheerpagina,
leeg of als kopie van een bestaande lijst. Die kopie staat helemaal los: eruit
schrappen laat het origineel heel.

**De landelijke lijst is sinds 018 weer alleen-lezen**, ook voor een beheerder.
Tussen 013 en 018 kon die vanaf de beheerpagina bewerkt worden, en dat was te
ruim: de wijziging gold voor élke groep in de database, en dit bestand
overschreef hem bij de volgende run toch. Correcties op de landelijke eisen
horen dus hier, in `010-eisen.sql`.
