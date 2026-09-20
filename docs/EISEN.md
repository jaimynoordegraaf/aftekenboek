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
