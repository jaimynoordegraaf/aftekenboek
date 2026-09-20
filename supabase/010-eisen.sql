-- aftekenboek — de diploma's en hun eisen
--
-- This file is the catalogue. It is written to be run again, as often as you
-- like: every row upserts on its `code`, so ids stay the same and aftekeningen
-- that already exist keep pointing at the same eis. That is what makes it safe
-- to correct a typo, sharpen a toelichting or add a diploma and re-run the
-- whole file against a database that is already in use.
--
-- Source per diploma is in the `source` column and in docs/EISEN.md. Where the
-- handboek is ambiguous the list here is deliberately the longer one: an eis
-- too many is visible on screen and can be deleted, an eis that is missing is
-- invisible and gets forgotten.
--
-- Strings are dollar-quoted ($$...$$) throughout, so an apostrophe in
-- "Roeicommando's" needs no escaping and cannot silently break the file.
--
-- Run after 003-rpc.sql.

-- ---------------------------------------------------------------- disciplines

insert into disciplines (code, name, subtitle, sort_order) values
  ('roeien',   $$Roeien$$,            $$Roeivlet$$,               1),
  ('kielboot', $$Zeilen$$,            $$Kielboot$$,               2),
  ('bbm',      $$Buitenboordmotor$$,  $$Boot met buitenboordmotor$$, 3),
  ('sloep',    $$Sloep en motorvlet$$, $$Motorvaren$$,            4)
on conflict (code) do update set
  name       = excluded.name,
  subtitle   = excluded.subtitle,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- diploma's

insert into diplomas (discipline_id, code, name, level_label, summary, sort_order, source)
select d.id, v.code, v.name, v.level_label, v.summary, v.sort_order, v.source
from (values
  ('roeien', 'roeien-12', $$Roeien I/II$$, $$I/II$$,
   $$Voor wie onder niet te moeilijke omstandigheden op meren en plassen kan varen in een roeivlet: niet te druk vaarwater, overdag, met voldoende zicht.$$,
   1, $$Handboek Opleidingen deel 3.2 Roeien (2015), §3.2.4$$),

  ('roeien', 'roeien-3', $$Roeien III$$, $$III$$,
   $$Voor wie het commando kan voeren over een roeivlet met een groep roeiers, op meren, plassen en kanalen tot en met windkracht 5 Beaufort.$$,
   2, $$Handboek Opleidingen deel 3.2 Roeien (2015), §3.2.5$$),

  ('kielboot', 'kielboot-1', $$Kielboot I$$, $$I$$,
   $$Voor wie onder gunstige omstandigheden kan zeilen: rustig vaarwater en matige wind tot en met 3 Beaufort, in een boot van minstens 200 kg met maximaal 20 m² zeil.$$,
   1, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.4$$),

  ('kielboot', 'kielboot-2', $$Kielboot II$$, $$II$$,
   $$Voor wie onder niet te moeilijke omstandigheden op meren en plassen kan zeilen, overdag en met voldoende zicht, tot en met windkracht 4 Beaufort.$$,
   2, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.5$$),

  ('kielboot', 'kielboot-3', $$Kielboot III$$, $$III$$,
   $$Voor wie tot en met windkracht 6 zelfstandig kan varen op meren, plassen en kanalen, in een boot van minstens 200 kg met maximaal 30 m² zeil.$$,
   3, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.6$$),

  ('kielboot', 'kielboot-4', $$Kielboot IV$$, $$IV$$,
   $$Voor wie onder alle omstandigheden kan varen. Alleen te halen met een examen onder toezicht van een erkend examinator, bij 7 tot 25 knopen wind. Gelijk aan het eigenvaardigheidsniveau van de Zeilinstructeur 3-opleiding.$$,
   4, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.7$$),

  ('bbm', 'bbm-12', $$Buitenboordmotor I/II$$, $$I/II$$,
   $$Voor wie onder eenvoudige omstandigheden met een buitenboordmotor vaart: tot en met windkracht 3 Beaufort, bij daglicht, op meren en kanalen.$$,
   1, $$Handboek Opleidingen deel 3.3 Buitenboordmotor (2015), §3.3.4$$),

  ('bbm', 'bbm-3', $$Buitenboordmotor III$$, $$III$$,
   $$Voor wie tot en met windkracht 5 Beaufort zelfstandig vaart op meren en kanalen, vaarwater klasse 1 t/m 4.$$,
   2, $$Handboek Opleidingen deel 3.3 Buitenboordmotor (2015), §3.3.5$$),

  ('sloep', 'sloep-1', $$Bemanningslid$$, $$CWO I$$,
   $$Vanaf 12 jaar. Kan onder verantwoordelijkheid van de schipper als bemanningslid op een sloep of motorvlet meedraaien.$$,
   1, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.1 en §4.1$$),

  ('sloep', 'sloep-2', $$Dagschipper$$, $$CWO II$$,
   $$Vanaf 16 jaar. Vaart, manoeuvreert en navigeert zelfstandig bij daglicht tot windkracht 4, en geeft daarbij leiding aan de bemanning.$$,
   2, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.2 en §4.1$$),

  ('sloep', 'sloep-3', $$Schipper$$, $$CWO III$$,
   $$Vanaf 18 jaar. Vaart zelfstandig bij dag en nacht tot windkracht 6 en geeft onder alle omstandigheden leiding aan de bemanning. Eigenvaardigheidsniveau van Instructeur I-2.$$,
   3, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.3 en §4.1$$),

  ('sloep', 'sloep-4', $$All Round Schipper$$, $$CWO IV$$,
   $$Vanaf 18 jaar. Draagt de eindverantwoordelijkheid voor bemanning en schip op meerdaagse tochten naar onbekende bestemmingen. Instapeis: een tochtplanning voor een door de examinator opgegeven tocht.$$,
   4, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.4 en §4.1$$)
) as v(discipline, code, name, level_label, summary, sort_order, source)
join disciplines d on d.code = v.discipline
on conflict (code) do update set
  discipline_id = excluded.discipline_id,
  name          = excluded.name,
  level_label   = excluded.level_label,
  summary       = excluded.summary,
  sort_order    = excluded.sort_order,
  source        = excluded.source;

-- ---------------------------------------------------------------- de eisen
--
-- `position` is the number the eis carries in the handboek, so the lijst on
-- screen and het boekje in de hand tellen gelijk op.

insert into requirements (diploma_id, code, kind, position, title, detail)
select dp.id, v.code, v.kind::requirement_kind, v.position, v.title, v.detail
from (values

-- ---------------- Roeien I/II — praktijk
('roeien-12', 'roeien-12.p1',  'praktijk', 1, $$Het schip vaarklaar en nachtklaar maken$$,
 $$Inventaris controleren, schip schoon en droog maken. Riemen juist neerleggen: blad naar de boeg, wrikriem aan stuurboord met het blad naar de spiegel. Controleren op lek- en regenwater. Voor iedere opvarende een reddingvest aan boord, bij voorkeur aangetrokken.$$),
('roeien-12', 'roeien-12.p2',  'praktijk', 2, $$Verhalen van het schip$$,
 $$Zonder motor. Alle manieren op spierkracht mogen, zolang het geen gevaar oplevert voor bemanning, materiaal of andere scheepvaart. Op het schip zelf zo veel mogelijk vanuit de kuip werken.$$),
('roeien-12', 'roeien-12.p3',  'praktijk', 3, $$Roeicommando's uitvoeren$$,
 $$Op bevel van de schipper kunnen uitvoeren: dollen in; los voor en los achter; op riemen; haalt op gelijk; stopt af; strijkt gelijk; zet af; riemen lopen; riemen geroeid. De commando's kunnen vooraf worden gegaan door 'beide boorden', 'stuurboord' of 'bakboord'.$$),
('roeien-12', 'roeien-12.p4',  'praktijk', 4, $$Aanleg met de punt van het schip$$,
 $$In de wind aanleggen op een vooraf aangewezen punt, met roeicommando's, zó dat het schip zonder noemenswaardige kracht afgehouden kan worden. De instructeur mag aanwijzingen geven om het veilig te laten verlopen.$$),
('roeien-12', 'roeien-12.p5',  'praktijk', 5, $$Een acht varen$$,
 $$Zonder noemenswaardig roergebruik: twee rondjes in tegengestelde richting. De bochten worden gemaakt door de ene boord te laten halen en de andere te laten strijken.$$),
('roeien-12', 'roeien-12.p6',  'praktijk', 6, $$Jagen$$,
 $$Met een aantal mensen het schip aan een lijn vooruittrekken. De lijn vlak bij het draaipunt vastmaken, zodat de boeg niet naar de kant wordt getrokken, lang genoeg, en met gebruik van de driftbeperkende middelen. Let op de natuur en andermans spullen.$$),
('roeien-12', 'roeien-12.p7',  'praktijk', 7, $$Wrikken$$,
 $$Met één riem in het wrikgat het schip in een rechte lijn voortbewegen.$$),
('roeien-12', 'roeien-12.p8',  'praktijk', 8, $$Het schip afmeren$$,
 $$Zo vastleggen dat ook op lange termijn geen schade aan eigen of andere schepen mogelijk is. Zo min mogelijk lijnen naar de wal (minder dan 3 of meer dan 6 is altijd fout), zo lang mogelijk gekozen. Eerst de lijnen die de natuurlijke beweging van het schip tegengaan.$$),
('roeien-12', 'roeien-12.p9',  'praktijk', 9, $$Toepassing van de reglementen$$,
 $$De uitwijkregels voor het eigen vaargebied toepassen. Een uitwijkmanoeuvre wordt tijdig ingezet. De bemanning mag waarschuwen voor andere scheepvaart.$$),

-- ---------------- Roeien I/II — theorie
('roeien-12', 'roeien-12.t1',  'theorie', 1, $$Schiemanswerk$$,
 $$Bij naam kennen, kunnen leggen en de functie kennen van: twee halve steken (de eerste slippend), achtknoop, platte knoop, mastworp (met slipsteek als borg). Ook: een lijn opschieten en een lijn beleggen op een kikker.$$),
('roeien-12', 'roeien-12.t2',  'theorie', 2, $$Roeitermen$$,
 $$Kunnen aangeven wat bedoeld wordt met: slagroeier, boegroeier, midroeier, roerganger, haakvoor, stuurboord, bakboord, hogerwal, lagerwal, bomen, jagen, wrikken, in de wind, opschieten, beleggen. Plus alle roeicommando's.$$),
('roeien-12', 'roeien-12.t3',  'theorie', 3, $$Onderdelen$$,
 $$Van de eigen boot en tuigage, in de praktijk én op een tekening, minstens 15 onderdelen bij de juiste naam noemen. In ieder geval: boeg, hek, dolboord, doften, roer, helmstok, stuurboord en bakboord, roeiriem, wrikriem.$$),
('roeien-12', 'roeien-12.t4',  'theorie', 4, $$Veiligheid$$,
 $$De eisen kennen die aan een reddingvest gesteld worden. Weten hoe te handelen bij een omgeslagen boot.$$),
('roeien-12', 'roeien-12.t5',  'theorie', 5, $$Reglementen$$,
 $$De genoemde artikelen uit het Binnenvaartpolitiereglement kunnen toepassen: begripsbepalingen 1.01, voorzorgsmaatregelen 1.04, afwijking 1.05, tegengestelde koersen 6.01/6.03/6.04, voorbijlopen 6.10, vertrek 6.14, kruisende koersen 6.17, ligplaats innemen 7.01. Weten dat er naast het BPR andere reglementen gelden en waar die te vinden zijn.$$),
('roeien-12', 'roeien-12.t6',  'theorie', 6, $$Gedragsregels$$,
 $$De goede gebruiken kennen ten opzichte van andere watersporters, waaronder wedstrijdzeilers. De verantwoording kennen ten opzichte van het milieu.$$),
('roeien-12', 'roeien-12.t7',  'theorie', 7, $$Weersinvloeden$$,
 $$Het weerbericht kunnen interpreteren met het oog op de veiligheid en de eigen vaardigheid. Voortekenen van plotselinge weersomslagen, zoals onweer en zware windvlagen, tijdig herkennen.$$),
('roeien-12', 'roeien-12.t8',  'theorie', 8, $$Vaarproblematiek andersoortige schepen$$,
 $$Het gevaar kennen van de dode hoek en van de zuiging van grote schepen. Weten dat grote schepen op smal vaarwater niet kunnen wijken, en dat ook grote vrachtschepen sterk kunnen verlijeren.$$),

-- ---------------- Roeien III — praktijk
('roeien-3', 'roeien-3.p1',  'praktijk',  1, $$Het schip vaarklaar en nachtklaar maken$$, null),
('roeien-3', 'roeien-3.p2',  'praktijk',  2, $$Verhalen van het schip$$, null),
('roeien-3', 'roeien-3.p3',  'praktijk',  3, $$Roeitechnieken en roeicommando's kunnen uitvoeren$$, null),
('roeien-3', 'roeien-3.p4',  'praktijk',  4, $$Roeicommando's kunnen geven$$, null),
('roeien-3', 'roeien-3.p5',  'praktijk',  5, $$Aanleg met de punt van het schip$$, null),
('roeien-3', 'roeien-3.p6',  'praktijk',  6, $$Aanleggen met de spiegel van het schip$$, null),
('roeien-3', 'roeien-3.p7',  'praktijk',  7, $$Zijwaartse aanleg$$, null),
('roeien-3', 'roeien-3.p8',  'praktijk',  8, $$Een kleine acht varen$$, null),
('roeien-3', 'roeien-3.p9',  'praktijk',  9, $$Man over boord manoeuvre$$, null),
('roeien-3', 'roeien-3.p10', 'praktijk', 10, $$Eenvoudig ankeren$$, null),
('roeien-3', 'roeien-3.p11', 'praktijk', 11, $$Roeimanoeuvres zonder roer$$, null),
('roeien-3', 'roeien-3.p12', 'praktijk', 12, $$Jagen$$, null),
('roeien-3', 'roeien-3.p13', 'praktijk', 13, $$Wrikken$$, null),
('roeien-3', 'roeien-3.p14', 'praktijk', 14, $$Het schip afmeren$$, null),
('roeien-3', 'roeien-3.p15', 'praktijk', 15, $$Aanvarings- en achtergrondpeiling kunnen maken$$, null),
('roeien-3', 'roeien-3.p16', 'praktijk', 16, $$Toepassing van de reglementen$$, null),
('roeien-3', 'roeien-3.p17', 'praktijk', 17, $$Terminologie$$, null),
('roeien-3', 'roeien-3.p18', 'praktijk', 18, $$Tonen van inzicht, veiligheid$$, null),
('roeien-3', 'roeien-3.p19', 'praktijk', 19, $$Schiemannen praktijk$$, null),

-- ---------------- Roeien III — theorie
('roeien-3', 'roeien-3.t1', 'theorie', 1, $$Schiemanswerk$$, null),
('roeien-3', 'roeien-3.t2', 'theorie', 2, $$Roeitermen$$, null),
('roeien-3', 'roeien-3.t3', 'theorie', 3, $$Onderdelen$$, null),
('roeien-3', 'roeien-3.t4', 'theorie', 4, $$Veiligheid$$, null),
('roeien-3', 'roeien-3.t5', 'theorie', 5, $$Reglementen$$, null),
('roeien-3', 'roeien-3.t6', 'theorie', 6, $$Theorie van het roeien$$, null),
('roeien-3', 'roeien-3.t7', 'theorie', 7, $$Gedragsregels, vlagvoering en jachtetiquette$$, null),
('roeien-3', 'roeien-3.t8', 'theorie', 8, $$Weersinvloeden$$, null),
('roeien-3', 'roeien-3.t9', 'theorie', 9, $$Vaarproblematiek andersoortige schepen$$, null),

-- ---------------- Kielboot I — praktijk
('kielboot-1', 'kielboot-1.p1',  'praktijk',  1, $$Het schip zeilklaar en nachtklaar maken$$, null),
('kielboot-1', 'kielboot-1.p2',  'praktijk',  2, $$Verhalen van het schip$$, null),
('kielboot-1', 'kielboot-1.p3',  'praktijk',  3, $$Stilliggend hijsen en strijken van de zeilen$$, null),
('kielboot-1', 'kielboot-1.p4',  'praktijk',  4, $$Stand en bediening van de zeilen$$, null),
('kielboot-1', 'kielboot-1.p5',  'praktijk',  5, $$Sturen, roer- en schootbediening$$, null),
('kielboot-1', 'kielboot-1.p6',  'praktijk',  6, $$Overstag gaan$$, null),
('kielboot-1', 'kielboot-1.p7',  'praktijk',  7, $$Opkruisen in breed vaarwater$$, null),
('kielboot-1', 'kielboot-1.p8',  'praktijk',  8, $$Gijpen$$, null),
('kielboot-1', 'kielboot-1.p9',  'praktijk',  9, $$Afvaren van hogerwal$$, null),
('kielboot-1', 'kielboot-1.p10', 'praktijk', 10, $$Onder toezicht aankomen aan hogerwal$$, null),
('kielboot-1', 'kielboot-1.p11', 'praktijk', 11, $$Afmeren op de eigen ligplaats$$, null),
('kielboot-1', 'kielboot-1.p12', 'praktijk', 12, $$De noodzaak van het reven onderkennen$$, null),
('kielboot-1', 'kielboot-1.p13', 'praktijk', 13, $$Toepassing van de reglementen$$, null),

-- ---------------- Kielboot I — theorie
('kielboot-1', 'kielboot-1.t1', 'theorie', 1, $$Schiemanswerk$$, null),
('kielboot-1', 'kielboot-1.t2', 'theorie', 2, $$Zeiltermen$$, null),
('kielboot-1', 'kielboot-1.t3', 'theorie', 3, $$Onderdelen$$, null),
('kielboot-1', 'kielboot-1.t4', 'theorie', 4, $$Veiligheid$$, null),
('kielboot-1', 'kielboot-1.t5', 'theorie', 5, $$Reglementen$$, null),
('kielboot-1', 'kielboot-1.t6', 'theorie', 6, $$Krachten op het schip en hun gevolgen$$, null),

-- ---------------- Kielboot II — praktijk
('kielboot-2', 'kielboot-2.p1',  'praktijk',  1, $$Het schip zeilklaar en nachtklaar maken$$, null),
('kielboot-2', 'kielboot-2.p2',  'praktijk',  2, $$Verhalen van het schip$$, null),
('kielboot-2', 'kielboot-2.p3',  'praktijk',  3, $$Stilliggend hijsen en strijken van de zeilen$$, null),
('kielboot-2', 'kielboot-2.p4',  'praktijk',  4, $$Stand en bediening van de zeilen$$, null),
('kielboot-2', 'kielboot-2.p5',  'praktijk',  5, $$Sturen, roer- en schootbediening$$, null),
('kielboot-2', 'kielboot-2.p6',  'praktijk',  6, $$Overstag gaan$$, null),
('kielboot-2', 'kielboot-2.p7',  'praktijk',  7, $$Opkruisen in nauw vaarwater$$, null),
('kielboot-2', 'kielboot-2.p8',  'praktijk',  8, $$Gijpen en gijpen kunnen vermijden$$, null),
('kielboot-2', 'kielboot-2.p9',  'praktijk',  9, $$Afvaren van hogerwal$$, null),
('kielboot-2', 'kielboot-2.p10', 'praktijk', 10, $$Aankomen aan hogerwal (onder alle omstandigheden)$$, null),
('kielboot-2', 'kielboot-2.p11', 'praktijk', 11, $$Afmeren van het schip$$, null),
('kielboot-2', 'kielboot-2.p12', 'praktijk', 12, $$Kunnen reven op het eigen schip$$, null),
('kielboot-2', 'kielboot-2.p13', 'praktijk', 13, $$Toepassing van de reglementen$$, null),
('kielboot-2', 'kielboot-2.p14', 'praktijk', 14, $$Man over boord manoeuvre$$, null),
('kielboot-2', 'kielboot-2.p15', 'praktijk', 15, $$Loskomen van aan de grond$$, null),
('kielboot-2', 'kielboot-2.p16', 'praktijk', 16, $$Gebruik buitenboordmotor$$, null),

-- ---------------- Kielboot II — theorie
('kielboot-2', 'kielboot-2.t1', 'theorie', 1, $$Schiemanswerk$$, null),
('kielboot-2', 'kielboot-2.t2', 'theorie', 2, $$Zeiltermen$$, null),
('kielboot-2', 'kielboot-2.t3', 'theorie', 3, $$Onderdelen$$, null),
('kielboot-2', 'kielboot-2.t4', 'theorie', 4, $$Veiligheid$$, null),
('kielboot-2', 'kielboot-2.t5', 'theorie', 5, $$Reglementen$$, null),
('kielboot-2', 'kielboot-2.t6', 'theorie', 6, $$Krachten op het schip en hun gevolgen$$, null),
('kielboot-2', 'kielboot-2.t7', 'theorie', 7, $$Gedragsregels$$, null),
('kielboot-2', 'kielboot-2.t8', 'theorie', 8, $$Weersinvloeden$$, null),
('kielboot-2', 'kielboot-2.t9', 'theorie', 9, $$Vaarproblematiek andersoortige schepen$$, null),

-- ---------------- Kielboot III — praktijk
('kielboot-3', 'kielboot-3.p1',  'praktijk',  1, $$Het aanslaan van de zeilen$$, null),
('kielboot-3', 'kielboot-3.p2',  'praktijk',  2, $$Het schip zeilklaar maken en klaarmaken voor de nacht$$, null),
('kielboot-3', 'kielboot-3.p3',  'praktijk',  3, $$Verhalen van het schip$$, null),
('kielboot-3', 'kielboot-3.p4',  'praktijk',  4, $$Hijsen en strijken van de zeilen, stilliggend en varend$$, null),
('kielboot-3', 'kielboot-3.p5',  'praktijk',  5, $$Stand en bediening van de zeilen$$, null),
('kielboot-3', 'kielboot-3.p6',  'praktijk',  6, $$Bovenwinds gelegen punt kunnen bezeilen$$, null),
('kielboot-3', 'kielboot-3.p7',  'praktijk',  7, $$Opkruisen in nauw vaarwater$$, null),
('kielboot-3', 'kielboot-3.p8',  'praktijk',  8, $$Gijpen en gijpen kunnen vermijden$$, null),
('kielboot-3', 'kielboot-3.p9',  'praktijk',  9, $$Afvaren van en aankomen aan hogerwal$$, null),
('kielboot-3', 'kielboot-3.p10', 'praktijk', 10, $$Man over boord manoeuvre$$, null),
('kielboot-3', 'kielboot-3.p11', 'praktijk', 11, $$Aankomen aan lagerwal$$, null),
('kielboot-3', 'kielboot-3.p12', 'praktijk', 12, $$Afmeren$$, null),
('kielboot-3', 'kielboot-3.p13', 'praktijk', 13, $$Kunnen reven op het eigen schip$$, null),
('kielboot-3', 'kielboot-3.p14', 'praktijk', 14, $$Eenvoudig ankeren$$, null),
('kielboot-3', 'kielboot-3.p15', 'praktijk', 15, $$Eenvoudige zeil- en scheepstrim$$, null),
('kielboot-3', 'kielboot-3.p16', 'praktijk', 16, $$Loskomen van aan de grond$$, null),
('kielboot-3', 'kielboot-3.p17', 'praktijk', 17, $$Bedienen van een binnen- of buitenboordmotor$$, null),
('kielboot-3', 'kielboot-3.p18', 'praktijk', 18, $$Schiemanswerk$$, null),
('kielboot-3', 'kielboot-3.p19', 'praktijk', 19, $$Aanvarings- en achtergrondpeiling kunnen maken$$, null),
('kielboot-3', 'kielboot-3.p20', 'praktijk', 20, $$Toepassing van de reglementen$$, null),
('kielboot-3', 'kielboot-3.p21', 'praktijk', 21, $$Terminologie$$, null),

-- ---------------- Kielboot III — theorie
('kielboot-3', 'kielboot-3.t1',  'theorie',  1, $$Schiemanswerk$$, null),
('kielboot-3', 'kielboot-3.t2',  'theorie',  2, $$Zeiltermen$$, null),
('kielboot-3', 'kielboot-3.t3',  'theorie',  3, $$Onderdelen$$, null),
('kielboot-3', 'kielboot-3.t4',  'theorie',  4, $$Veiligheid$$, null),
('kielboot-3', 'kielboot-3.t5',  'theorie',  5, $$Reglementen$$, null),
('kielboot-3', 'kielboot-3.t6',  'theorie',  6, $$Krachten op het schip en hun gevolgen$$, null),
('kielboot-3', 'kielboot-3.t7',  'theorie',  7, $$Gedragsregels, vlagvoering en jachtetiquette$$, null),
('kielboot-3', 'kielboot-3.t8',  'theorie',  8, $$Weersinvloeden$$, null),
('kielboot-3', 'kielboot-3.t9',  'theorie',  9, $$Vaarproblematiek andersoortige schepen$$, null),
('kielboot-3', 'kielboot-3.t10', 'theorie', 10, $$Dagelijks onderhoud van het eigen schip$$, null),
('kielboot-3', 'kielboot-3.t11', 'theorie', 11, $$Het kennen van twee andere reefsystemen dan die op het eigen schip$$, null),

-- ---------------- Kielboot IV — praktijk
('kielboot-4', 'kielboot-4.p1',  'praktijk',  1, $$Aanslaan van de zeilen$$, null),
('kielboot-4', 'kielboot-4.p2',  'praktijk',  2, $$Schip zeilklaar maken en klaarmaken voor de nacht$$, null),
('kielboot-4', 'kielboot-4.p3',  'praktijk',  3, $$Verhalen van het schip$$, null),
('kielboot-4', 'kielboot-4.p4',  'praktijk',  4, $$Hijsen en strijken van de zeilen, stilliggend en varend$$, null),
('kielboot-4', 'kielboot-4.p5',  'praktijk',  5, $$Stand en bediening van de zeilen$$, null),
('kielboot-4', 'kielboot-4.p6',  'praktijk',  6, $$Bovenwinds gelegen punt kunnen bezeilen$$, null),
('kielboot-4', 'kielboot-4.p7',  'praktijk',  7, $$Opkruisen in nauw vaarwater$$, null),
('kielboot-4', 'kielboot-4.p8',  'praktijk',  8, $$Gijpen en gijpen kunnen vermijden$$, null),
('kielboot-4', 'kielboot-4.p9',  'praktijk',  9, $$Afvaren van en aankomen aan hogerwal$$, null),
('kielboot-4', 'kielboot-4.p10', 'praktijk', 10, $$Man over boord manoeuvre kunnen uitvoeren$$, null),
('kielboot-4', 'kielboot-4.p11', 'praktijk', 11, $$Wegvaren van en aankomen aan lagerwal$$, null),
('kielboot-4', 'kielboot-4.p12', 'praktijk', 12, $$Afmeren$$, null),
('kielboot-4', 'kielboot-4.p13', 'praktijk', 13, $$Kunnen reven op het eigen schip$$, null),
('kielboot-4', 'kielboot-4.p14', 'praktijk', 14, $$Ankeren en anker op gaan$$, null),
('kielboot-4', 'kielboot-4.p15', 'praktijk', 15, $$Varen in kanalen, passeren van bruggen en sluizen$$, null),
('kielboot-4', 'kielboot-4.p16', 'praktijk', 16, $$Doelmatigheid in vaargedrag vertonen$$, null),
('kielboot-4', 'kielboot-4.p17', 'praktijk', 17, $$Zeil- en scheepstrim$$, null),
('kielboot-4', 'kielboot-4.p18', 'praktijk', 18, $$Loskomen van aan de grond$$, null),
('kielboot-4', 'kielboot-4.p19', 'praktijk', 19, $$Bedienen van een binnen- of buitenboordmotor$$, null),
('kielboot-4', 'kielboot-4.p20', 'praktijk', 20, $$Schiemanswerk$$, null),
('kielboot-4', 'kielboot-4.p21', 'praktijk', 21, $$Aanvarings- en achtergrondpeiling kunnen maken$$, null),
('kielboot-4', 'kielboot-4.p22', 'praktijk', 22, $$Toepassing van de reglementen$$, null),
('kielboot-4', 'kielboot-4.p23', 'praktijk', 23, $$Terminologie$$, null),

-- ---------------- Kielboot IV — theorie
('kielboot-4', 'kielboot-4.t1',  'theorie',  1, $$Schiemanswerk$$, null),
('kielboot-4', 'kielboot-4.t2',  'theorie',  2, $$Dagelijks onderhoud van het eigen schip en de binnen- of buitenboordmotor$$, null),
('kielboot-4', 'kielboot-4.t3',  'theorie',  3, $$Scheepsbouw, materialen en onderdelen$$, null),
('kielboot-4', 'kielboot-4.t4',  'theorie',  4, $$Veiligheid en (blessure)preventie$$, null),
('kielboot-4', 'kielboot-4.t5',  'theorie',  5, $$Reglementen$$, null),
('kielboot-4', 'kielboot-4.t6',  'theorie',  6, $$Navigatie$$, null),
('kielboot-4', 'kielboot-4.t7',  'theorie',  7, $$Vaarproblematiek grote schepen$$, null),
('kielboot-4', 'kielboot-4.t8',  'theorie',  8, $$Vlagvoering en jachtetiquette$$, null),
('kielboot-4', 'kielboot-4.t9',  'theorie',  9, $$Stabiliteit$$, null),
('kielboot-4', 'kielboot-4.t10', 'theorie', 10, $$Voortstuwende en remmende krachten$$, null),
('kielboot-4', 'kielboot-4.t11', 'theorie', 11, $$Ankergerei$$, null),
('kielboot-4', 'kielboot-4.t12', 'theorie', 12, $$De meest voorkomende scheepssoorten in het eigen vaargebied herkennen en benoemen$$, null),

-- ---------------- Buitenboordmotor I/II — praktijk
('bbm-12', 'bbm-12.p1',  'praktijk',  1, $$Het schip vaarklaar maken en klaarmaken voor de nacht$$, null),
('bbm-12', 'bbm-12.p2',  'praktijk',  2, $$Benzinetank aansluiten$$, null),
('bbm-12', 'bbm-12.p3',  'praktijk',  3, $$Uitwendige controle van de motor$$, null),
('bbm-12', 'bbm-12.p4',  'praktijk',  4, $$Starten van de motor$$, null),
('bbm-12', 'bbm-12.p5',  'praktijk',  5, $$Controle op goede werking$$, null),
('bbm-12', 'bbm-12.p6',  'praktijk',  6, $$Gestrekte koers varen$$, null),
('bbm-12', 'bbm-12.p7',  'praktijk',  7, $$Stuurwerking van de motor$$, null),
('bbm-12', 'bbm-12.p8',  'praktijk',  8, $$Vaart minderen en stoppen$$,
 $$Tijdig gas terugnemen; het stoppen gebeurt achteruitslaand, waarbij het schip op koers blijft.$$),
('bbm-12', 'bbm-12.p9',  'praktijk',  9, $$Drijvend voorwerp kunnen benaderen$$, null),
('bbm-12', 'bbm-12.p10', 'praktijk', 10, $$Een acht en een slalom kunnen varen$$, null),
('bbm-12', 'bbm-12.p11', 'praktijk', 11, $$Afvaren en aankomen aan een langswal$$, null),
('bbm-12', 'bbm-12.p12', 'praktijk', 12, $$Afmeren$$, null),
('bbm-12', 'bbm-12.p13', 'praktijk', 13, $$Ankeren en anker op gaan$$, null),
('bbm-12', 'bbm-12.p14', 'praktijk', 14, $$Brandstof bijvullen$$, null),
('bbm-12', 'bbm-12.p15', 'praktijk', 15, $$Schiemanswerk$$, null),
('bbm-12', 'bbm-12.p16', 'praktijk', 16, $$Terminologie$$, null),

-- ---------------- Buitenboordmotor I/II — theorie
('bbm-12', 'bbm-12.t1', 'theorie', 1, $$Terminologie van schip en motor$$, null),
('bbm-12', 'bbm-12.t2', 'theorie', 2, $$Meest voorkomende storingen kunnen verhelpen$$, null),
('bbm-12', 'bbm-12.t3', 'theorie', 3, $$Vlagvoering en jachtetiquette$$, null),
('bbm-12', 'bbm-12.t4', 'theorie', 4, $$Veiligheid$$, null),
('bbm-12', 'bbm-12.t5', 'theorie', 5, $$Reglementen$$, null),

-- ---------------- Buitenboordmotor III — praktijk
('bbm-3', 'bbm-3.p1',  'praktijk',  1, $$Het schip vaarklaar maken en klaarmaken voor de nacht$$, null),
('bbm-3', 'bbm-3.p2',  'praktijk',  2, $$Vaartechnieken: koersen varen, afstoppen, gaande houden, noodstop maken$$, null),
('bbm-3', 'bbm-3.p3',  'praktijk',  3, $$Afvaren en aankomen bij hoger- en lagerwal$$, null),
('bbm-3', 'bbm-3.p4',  'praktijk',  4, $$Man over boord manoeuvre$$, null),
('bbm-3', 'bbm-3.p5',  'praktijk',  5, $$Ankeren en anker op gaan$$, null),
('bbm-3', 'bbm-3.p6',  'praktijk',  6, $$Bijzondere verrichtingen$$, null),
('bbm-3', 'bbm-3.p7',  'praktijk',  7, $$Loskomen van aan de grond$$, null),
('bbm-3', 'bbm-3.p8',  'praktijk',  8, $$Passeren van bruggen en/of sluizen$$, null),
('bbm-3', 'bbm-3.p9',  'praktijk',  9, $$Aanvarings- en achtergrondpeiling$$, null),
('bbm-3', 'bbm-3.p10', 'praktijk', 10, $$Toepassing reglementen$$, null),
('bbm-3', 'bbm-3.p11', 'praktijk', 11, $$Langszij een varend schip komen en vastmaken$$, null),
('bbm-3', 'bbm-3.p12', 'praktijk', 12, $$Slepen en gesleept worden$$, null),
('bbm-3', 'bbm-3.p13', 'praktijk', 13, $$Een tocht in het donker$$, null),
('bbm-3', 'bbm-3.p14', 'praktijk', 14, $$Eenvoudige reparaties aan de motor$$, null),

-- ---------------- Buitenboordmotor III — theorie
('bbm-3', 'bbm-3.t1',  'theorie',  1, $$Terminologie$$, null),
('bbm-3', 'bbm-3.t2',  'theorie',  2, $$Veiligheids- en reddingsmiddelen$$, null),
('bbm-3', 'bbm-3.t3',  'theorie',  3, $$Handelen bij averij$$, null),
('bbm-3', 'bbm-3.t4',  'theorie',  4, $$Eenvoudige EHBO$$, null),
('bbm-3', 'bbm-3.t5',  'theorie',  5, $$Reglementen$$, null),
('bbm-3', 'bbm-3.t6',  'theorie',  6, $$Betonning en bebakening$$, null),
('bbm-3', 'bbm-3.t7',  'theorie',  7, $$Krachten op het schip en hun gevolgen$$, null),
('bbm-3', 'bbm-3.t8',  'theorie',  8, $$Jachtetiquette en vlagvoering$$, null),
('bbm-3', 'bbm-3.t9',  'theorie',  9, $$Weersinvloeden$$, null),
('bbm-3', 'bbm-3.t10', 'theorie', 10, $$Gebruik van almanak en waterkaarten$$, null)

) as v(diploma, code, kind, position, title, detail)
join diplomas dp on dp.code = v.diploma
on conflict (code) do update set
  diploma_id = excluded.diploma_id,
  kind       = excluded.kind,
  position   = excluded.position,
  title      = excluded.title,
  detail     = excluded.detail;

-- ---------------------------------------------------------------- sloep/motorvlet
--
-- Het handboek Sloep- en motorvletvaren zet de eisen niet per niveau onder
-- elkaar, maar in één matrix met een kolom per niveau. Die kolommen zijn in de
-- PDF niet betrouwbaar uit te lezen, dus staat hieronder bij alle vier de
-- niveaus dezelfde volledige lijst. Dat is bewust de ruime kant: een eis die
-- er niet bij hoort zie je staan en haal je weg, een eis die ontbreekt zie je
-- nooit. Loop de lijst één keer met het handboek naast je na — zie
-- docs/EISEN.md.

insert into requirements (diploma_id, code, kind, position, title, detail)
select dp.id, dp.code || '.' || v.suffix, v.kind::requirement_kind, v.position, v.title, v.detail
from diplomas dp
cross join (values
  ('p1',  'praktijk',  1, $$Vaarklaar maken en controleren van het schip$$,        $$Het schip en basale zaken$$),
  ('p2',  'praktijk',  2, $$Verzorgen van de waterdichtheid van het schip$$,       $$Het schip en basale zaken$$),
  ('p3',  'praktijk',  3, $$Aan dek werken$$,                                      $$Het schip en basale zaken$$),
  ('p4',  'praktijk',  4, $$Behandeling lijnen en schiemannen$$,                   $$Het schip en basale zaken$$),
  ('p5',  'praktijk',  5, $$Bedienen van de motor$$,                               $$Het schip en basale zaken$$),
  ('p6',  'praktijk',  6, $$Zorg voor de motor en motorkamer$$,                    $$Het schip en basale zaken$$),
  ('p7',  'praktijk',  7, $$Communiceren$$,                                        $$Het schip en basale zaken$$),
  ('p8',  'praktijk',  8, $$Sturen$$,                                              $$Manoeuvreren$$),
  ('p9',  'praktijk',  9, $$Manoeuvreren$$,                                        $$Manoeuvreren$$),
  ('p10', 'praktijk', 10, $$Afvaren van een hogerwal en langswal steiger$$,        $$Havenmanoeuvres$$),
  ('p11', 'praktijk', 11, $$Aankomen aan een hogerwal en langswal steiger$$,       $$Havenmanoeuvres$$),
  ('p12', 'praktijk', 12, $$Afvaren van een hogerwal en lagerwal box$$,            $$Havenmanoeuvres$$),
  ('p13', 'praktijk', 13, $$Aankomen in een hogerwal en lagerwal box$$,            $$Havenmanoeuvres$$),
  ('p14', 'praktijk', 14, $$Afvaren van een lagerwal steiger$$,                    $$Havenmanoeuvres$$),
  ('p15', 'praktijk', 15, $$Aankomen aan een lagerwal steiger$$,                   $$Havenmanoeuvres$$),
  ('p16', 'praktijk', 16, $$Afvaren uit een box met dwarswind$$,                   $$Havenmanoeuvres$$),
  ('p17', 'praktijk', 17, $$Aankomen in een box met dwarswind$$,                   $$Havenmanoeuvres$$),
  ('p18', 'praktijk', 18, $$Afmeren$$,                                             $$Havenmanoeuvres$$),
  ('p19', 'praktijk', 19, $$Gebruik van kaart en almanak$$,                        $$Navigatie$$),
  ('p20', 'praktijk', 20, $$Gebruik navigatie-instrumenten$$,                      $$Navigatie$$),
  ('p21', 'praktijk', 21, $$Navigeren aan boord$$,                                 $$Navigatie$$),
  ('p22', 'praktijk', 22, $$Tochtvoorbereiding en het aanlopen van havens$$,       $$Tochtvaren$$),
  ('p23', 'praktijk', 23, $$Passeren van sluizen en bruggen$$,                     $$Tochtvaren$$),
  ('p24', 'praktijk', 24, $$Toepassen van de reglementen$$,                        $$Tochtvaren$$),
  ('p25', 'praktijk', 25, $$Nachtvaren$$,                                          $$Tochtvaren — in het handboek pas vanaf Schipper (CWO III)$$),
  ('p26', 'praktijk', 26, $$Gebruik van de veiligheidsuitrusting en reddingsmiddelen aan boord$$, $$Noodsituaties$$),
  ('p27', 'praktijk', 27, $$Man over boord$$,                                      $$Noodsituaties$$),
  ('p28', 'praktijk', 28, $$Slepen en gesleept worden$$,                           $$Noodsituaties — hiervoor bestaat een aparte module; verplicht voor All Round Schipper$$),
  ('p29', 'praktijk', 29, $$Loskomen van aan de grond$$,                           $$Noodsituaties$$),
  ('p30', 'praktijk', 30, $$Verhelpen van storingen$$,                             $$Noodsituaties$$),
  ('p31', 'praktijk', 31, $$EHBO$$,                                                $$Noodsituaties$$),
  ('p32', 'praktijk', 32, $$Ankeren$$,                                             $$Overig$$),
  ('p33', 'praktijk', 33, $$Vaar- en jachtetiquette en zorg voor het schip$$,      $$Overig$$),
  ('t1',  'theorie',   1, $$Scheeps- en motortermen$$,                             null),
  ('t2',  'theorie',   2, $$Werking van de motor$$,                                null),
  ('t3',  'theorie',   3, $$Theoretische beginselen van het manoeuvreren op de motor$$, null),
  ('t4',  'theorie',   4, $$Theorie van alle genoemde praktijkmanoeuvres$$,        null),
  ('t5',  'theorie',   5, $$Reglementen$$,                                         null),
  ('t6',  'theorie',   6, $$Klein Vaarbewijs$$,
   $$Kennis van KVB I vanaf Schipper (CWO III); voor All Round Schipper (CWO IV) is het certificaat zelf vereist. Een Klein Vaarbewijs geeft vrijstelling van het theorie-examen.$$)
) as v(suffix, kind, position, title, detail)
where dp.code in ('sloep-1', 'sloep-2', 'sloep-3', 'sloep-4')
on conflict (code) do update set
  diploma_id = excluded.diploma_id,
  kind       = excluded.kind,
  position   = excluded.position,
  title      = excluded.title,
  detail     = excluded.detail;
