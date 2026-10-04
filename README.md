# Hoeven+

Onze eigen streamingdienst voor familie en vrienden. Een Netflix-achtig platform met profielen, kijkvoortgang, "Mijn lijst" en een eigen beheeromgeving (de **Studio**, zoiets als YouTube Studio) om films en series toe te voegen.

- **Geen build-stap.** Gewone HTML, CSS en JavaScript (ES-modules). Wat in deze map staat, is de website.
- **Hosting:** GitHub + Cloudflare Pages. **Backend:** Supabase (accounts, database, opslag).
- **Demo-modus:** zolang `js/config.js` leeg is, draait alles op voorbeeldgegevens in je eigen browser. Handig om het ontwerp te bekijken en de Studio uit te proberen.

## Wat zit erin

**Voor kijkers**
- Openbare voorpagina voor bezoekers zonder account, met uitleg over het platform en een populair-rij
- Intro-animatie, inloggen en registreren (nieuwe accounts moeten door jou worden goedgekeurd)
- Profielen per account (max. 5) met kleur, symbool en kinderprofiel (alleen Kijkwijzer AL, 6 en 9)
- Startpagina met uitgelichte carrousel, "Verder kijken", "Mijn lijst", eigen rijen en "Binnenkort"
- Films, Series, Mijn lijst en zoeken
- Titelvenster met afleveringen per seizoen
- Eigen speler: hervatten, voortgang opslaan, intro overslaan, volgende aflevering met aftelling, snelheid, beeld-in-beeld, volledig scherm, dubbeltikken om te spoelen op je telefoon
- Werkt op telefoon, tablet en computer (te installeren als app via "Zet op beginscherm")

**Voor jou als beheerder (Studio)**
- Dashboard met kijktijd, populairste titels, recente activiteit
- Content beheren: titels, afleveringen, posters, achtergronden, thumbnails, beschrijvingen, Kijkwijzer, status (concept, gepubliceerd, binnenkort met releasedatum)
- Video's uploaden met voortgangsbalk, of een externe link gebruiken
- Rijen van de startpagina samenstellen en herordenen
- Leden goedkeuren, blokkeren en beheerder maken
- Mededeling voor alle kijkers

## 1. Lokaal bekijken (demo-modus)

Dubbelklikken op `index.html` werkt niet (browsers blokkeren dan JavaScript-modules). Start een klein servertje in deze map, op Windows in PowerShell:

```powershell
py -m http.server 8080
```

Ga naar <http://localhost:8080>. Inloggen kan met een willekeurig e-mailadres en wachtwoord; je bent dan beheerder van de demo. Alles wat je wijzigt blijft in je browser staan. Resetten kan in de Studio onder Instellingen.

## 2. Supabase instellen

1. Maak een gratis project op [supabase.com](https://supabase.com). Kies een regio in de EU (bijv. Frankfurt).
2. Ga naar **SQL Editor > New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**. Dit maakt alle tabellen, beveiligingsregels en opslagmappen (buckets) aan. Je kunt het later gerust opnieuw draaien.
3. Ga naar **Authentication > Sign In / Providers > Email** en zet **Confirm email** uit. Jij keurt leden toch al zelf goed, dus dit voorkomt gedoe met mails die in de spam belanden.
4. Ga naar **Project Settings > API** en kopieer de **Project URL** en de **anon public** key naar [`js/config.js`](js/config.js):

   ```js
   SUPABASE_URL: "https://jouwproject.supabase.co",
   SUPABASE_ANON_KEY: "eyJ...",
   ```

   De anon key is bedoeld om openbaar te zijn; de beveiliging zit in de regels uit `schema.sql`. Gebruik **nooit** de `service_role` key in dit bestand.

## 3. Jezelf beheerder maken

1. Open de site, kies **Registreren** en maak je account aan.
2. Ga in Supabase naar de **SQL Editor** en draai (met je eigen e-mailadres):

   ```sql
   update public.members set role = 'admin', approved = true where email = 'jouw-email@voorbeeld.nl';
   ```
3. Ververs de site. In het profielmenu (rechtsboven) staat nu **Hoeven+ Studio**.

Anderen die zich registreren zien "Bijna klaar!" tot jij ze goedkeurt onder **Studio > Leden**.

## 4. Online zetten: GitHub en Cloudflare Pages

1. Zet deze map in een GitHub-repository en push.
2. Ga in Cloudflare naar **Workers & Pages > Create > Pages > Connect to Git** en kies de repository.
3. Build-instellingen: framework **None**, build command **leeg laten**, build output directory **`/`** (de hoofdmap).
4. Klik op **Save and Deploy**. Je site staat nu op `jouwproject.pages.dev`. Bij elke push naar GitHub wordt hij automatisch opnieuw uitgerold.
5. Ga in Supabase naar **Authentication > URL Configuration** en zet bij **Site URL** het adres van je site (eerst de `pages.dev`-URL, later je eigen domein). Voeg dezelfde URL toe onder **Redirect URLs**. Zo werken de links in de mails voor wachtwoord herstellen.

Het bestand [`_headers`](_headers) stelt beveiligingsheaders en caching in voor Cloudflare Pages.

## 5. Je eigen domein (TransIP)

Er zijn twee manieren, afhankelijk van welk adres je wilt:

- **Subdomein** (bijv. `kijken.jouwdomein.nl`): het makkelijkst. Voeg in Cloudflare Pages onder **Custom domains** dit subdomein toe. In het TransIP-controlepaneel maak je bij de DNS-instellingen van je domein een **CNAME**-record: naam `kijken`, waarde `jouwproject.pages.dev`. Je nameservers hoeven niet te veranderen.
- **Hoofddomein** (bijv. `jouwdomein.nl`): dit werkt alleen als Cloudflare je DNS beheert. Voeg je domein toe als site in Cloudflare en zet bij TransIP de **nameservers** van je domein op de twee nameservers die Cloudflare je geeft. Voeg daarna het domein toe onder **Custom domains** van je Pages-project.

Het kan even duren voordat DNS-wijzigingen overal zichtbaar zijn en Cloudflare het beveiligingscertificaat heeft aangemaakt.

## 6. Video's toevoegen

Ga in de Studio naar **Content > Nieuwe titel**. Vul de gegevens in, upload een poster (staand) en een achtergrond (breed) en voeg daarna de video toe. Er zijn twee manieren:

- **Uploaden** naar Supabase Storage. Het gratis plan heeft **50 MB per bestand** en **1 GB totaal**. Dat is snel vol; een Pro-plan geeft meer ruimte.
- **Externe link** naar een `.mp4` of `.m3u8` (HLS)-bestand. Dit is de beste optie voor grote video's. Een gratis mogelijkheid is Cloudflare R2 (een bucket met openbare toegang, of met een eigen domein). De host moet "Range requests" ondersteunen, anders kun je niet spoelen. R2 en Cloudflare Stream doen dat.

### YouTube als videobron (aanrader voor lange video's)

YouTube heeft geen bestandslimiet van 50 MB en verwerkt je video naar alle formaten. In de Studio kies je bij een video de bron **YouTube** en plak je de link. De video speelt dan af in de Hoeven+-speler, met dezelfde bediening, voortgang, hervatten en volgende aflevering als de andere bronnen.

1. Upload de video via [studio.youtube.com](https://studio.youtube.com) en zet de zichtbaarheid op **Niet openbaar vermeld**. Voor video's langer dan 15 minuten moet je YouTube-account eerst geverifieerd zijn met je telefoonnummer.
2. Laat **Inbedden toestaan** aan staan (bij "Meer opties").
3. Plak de link in de Studio bij **Bron: YouTube**.

Goed om te weten:
- **Niet openbaar vermeld is niet privé.** Iedereen met de link kan de video op YouTube zelf bekijken. Video's met zichtbaarheid **Privé** kunnen niet worden afgespeeld op Hoeven+. Gebruik YouTube dus niet voor beelden die echt niemand mag zien.
- Hoeven+ verbergt de YouTube-bediening en gebruikt een eigen. YouTube kan tijdens pauzeren of aan het eind toch zelf iets tonen. `rel=0` zorgt dat het alleen video's van je eigen kanaal zijn.
- Er is geen beeld-in-beeld voor YouTube-video's. De speler laadt via `youtube-nocookie.com`.
- De duur van een YouTube-video wordt bij het afspelen bepaald. Wil je hem al eerder in de kaartjes zien, vul hem dan zelf in.

Tips voor bestanden die overal afspelen, ook op een iPhone: **MP4 met H.264-video en AAC-audio**. Met [HandBrake](https://handbrake.fr) (Windows) kies je preset "Fast 1080p30" en zet je **Web optimized** aan. Zo start de video snel en werkt spoelen soepel.

**Kijkwijzer:** AL, 6 en 9 zijn zichtbaar voor kinderprofielen. Titels met een hogere leeftijd blijven voor kinderprofielen verborgen.

## 7. E-mail bij een nieuwe registratie

Wil je een mailtje als iemand zich registreert? Gebruik hiervoor [Resend](https://resend.com) (gratis) en het script [`supabase/notify-registration.sql`](supabase/notify-registration.sql):

1. Maak een Resend-account met **hetzelfde e-mailadres** waar je de meldingen wilt ontvangen. Het gratis afzenderadres `onboarding@resend.dev` kan alleen naar het adres van je eigen Resend-account mailen.
2. Maak in Resend onder **API Keys** een key aan met alleen "Sending access". De key begint met `re_`.
3. Vul de drie waarden bovenin het SQL-script in (in de SQL Editor, niet op GitHub) en draai het.
4. Test het door je met een tweede e-mailadres te registreren. Komt er niets binnen, kijk dan in je spam en in Resend onder **Emails**.

De gegevens staan versleuteld in Supabase Vault. Mislukt de mail, dan gaat de registratie gewoon door.

## 8. Openbare voorpagina

Bezoekers die niet zijn ingelogd zien een voorpagina met uitleg, veelgestelde vragen en knoppen voor Inloggen en Account aanvragen. Er staat standaard **geen enkele titel** op. Jij kiest per titel of hij openbaar mag zijn:

1. Draai **eenmalig** [`supabase/updates.sql`](supabase/updates.sql) in de SQL Editor (nieuwe installaties hebben dit al in `schema.sql`).
2. Zet in de Studio bij een titel de schakelaar **Tonen op de openbare voorpagina** aan. Dan zien bezoekers alleen de titel en de poster.

De posters vormen het schuine raster bovenaan en de rij **Populair op Hoeven+**. De volgorde van die rij is de kijktijd van de laatste 14 dagen, daarna uitgelicht en nieuwste. Titels zonder schakelaar (bijvoorbeeld privé-familievideo's) blijven verborgen, ook al staat de poster in een openbare map.

## Studio-extra's

- **Nieuw-label**: zet bij een titel (Studio > Content > titel) de schakelaar **Nieuw-label** aan. De kaart krijgt dan het label "Nieuw" en de titel komt vooraan in "Nieuw op Hoeven+". Je zet hem zelf weer uit. Draai eenmalig `supabase/updates.sql` zodat de database de kolom `is_new` heeft.
- **Profielpictogrammen**: upload onder Studio > Instellingen > **Profielpictogrammen** plaatjes (ze worden vierkant bijgesneden en verkleind). Kijkers kiezen ze bij het maken of bewerken van een profiel, boven de kleuren en symbolen. Hiervoor is geen extra SQL nodig.
- **Speler**: bij een serie verschijnt in de laatste 10 seconden rechtsonder "Volgende aflevering" met aftelling en een knop Annuleren (na annuleren gaat hij niet vanzelf door). Bij een film, en bij de laatste aflevering van een serie, verschijnen in de laatste 15 seconden aanbevelingen.

## 9. Mooie e-mails (wachtwoord vergeten en meer)

De mails over wachtwoord resetten, bevestigen en inloggen verstuurt Supabase. De standaardtekst is Engels en kaal. In [`supabase/email-templates/`](supabase/email-templates/) staan Nederlandse templates in de stijl van Hoeven+ (donker, met logo en een kleurrijke knop).

**Templates plakken** (Supabase > Authentication > Emails > Templates, de menunamen kunnen iets afwijken):

| Template in Supabase | Bestand | Onderwerp (Subject) |
|---|---|---|
| Reset password | `wachtwoord-vergeten.html` | Kies een nieuw wachtwoord voor Hoeven+ |
| Confirm sign up | `account-bevestigen.html` | Bevestig je e-mailadres voor Hoeven+ |
| Magic link | `inloglink.html` | Je inloglink voor Hoeven+ |
| Invite user | `uitnodiging.html` | Je bent uitgenodigd voor Hoeven+ |
| Change email address | `e-mailadres-wijzigen.html` | Bevestig je nieuwe e-mailadres voor Hoeven+ |

Open het bestand, kopieer alles, plak het in het vak van de template en vul het onderwerp in. Laat de stukjes tussen `{{ }}` staan: Supabase vult daar het e-mailadres en de link in.

**Twee instellingen die het echt goed maken:**

1. **Site URL**: zet onder Authentication > URL Configuration de **Site URL** op het echte adres van je site (bijvoorbeeld `https://hoeven.jouwdomein.nl`) en zet dat adres ook bij **Redirect URLs**. De link naar de site in de mail komt hieruit. Staat hier nog `localhost`, dan kapot je logo en link.
2. **Eigen afzender (SMTP)**: de standaardmails van Supabase komen van "Supabase Auth" en er mogen maar een paar per uur uit. Zet onder Authentication > SMTP Settings je eigen afzender aan, bijvoorbeeld via Resend (heb je al voor de registratiemelding): host `smtp.resend.com`, poort `465`, gebruikersnaam `resend` en als wachtwoord je Resend API-key. Typ die key alleen in Supabase, nergens anders. Als afzender (Sender email) moet je een adres van een domein gebruiken dat je in Resend hebt geverifieerd, bijvoorbeeld `noreply@jouwdomein.nl`, en als naam `Hoeven+`.

Test het door op de inlogpagina op **Wachtwoord vergeten** te klikken.

## Veiligheid, eerlijk uitgelegd

- Alleen goedgekeurde leden kunnen titels, video's en voortgang lezen. Dit wordt afgedwongen in de database (Row Level Security), niet alleen in de website.
- Video's staan in een privé-bucket en worden afgespeeld via tijdelijke links (6 uur geldig). Posters en thumbnails staan in een openbare bucket, zodat ze snel laden.
- Iemand die een video kan afspelen, kan hem ook downloaden. Er is geen kopieerbeveiliging (DRM). Geef dus alleen toegang aan mensen die je vertrouwt.
- Externe links (bijv. R2) zijn zo openbaar als jij ze maakt.
- Gratis Supabase-projecten worden gepauzeerd na een week zonder activiteit. Eén keer inloggen of de knop "Restore" in het dashboard zet hem weer aan.

## Sneltoetsen in de speler

| Toets | Actie |
| --- | --- |
| Spatie of K | Afspelen of pauzeren |
| Pijl links of J / pijl rechts of L | 10 seconden terug / vooruit |
| Pijl omhoog / omlaag | Volume |
| M | Geluid uit of aan |
| F | Volledig scherm |
| N | Volgende aflevering |
| C | Ondertiteling aan of uit (alleen YouTube) |
| `<` en `>` | Langzamer of sneller |
| 0 tot 9 | Naar 0 tot 90 procent van de video |
| Esc | Terug |

## Projectstructuur

```
index.html            Startpunt
_headers              Cloudflare-headers (beveiliging, cache)
manifest.webmanifest  Installeerbaar als app
css/                  base, animations, components, landing, views (kijker), player, studio
js/main.js            Opstarten, routes en toegangsregels
js/config.js          Supabase-gegevens (hier vul je ze in)
js/api/               supabase.js (echt) en demo.js (voorbeelddata), zelfde interface
js/core/              router, sessie
js/data/              catalogus en kijkvoortgang
js/ui/                bouwstenen (knoppen, modals, kaarten, iconen, ...)
js/views/             voorpagina, schermen van de kijker + views/studio/ voor de beheerder
supabase/schema.sql   Database, beveiliging en opslag
vendor/               supabase-js en hls.js (lokaal, geen CDN nodig)
assets/               logo, iconen, lettertypen
demo/                 Voorbeeldvideo voor de demo-modus
```

## Problemen oplossen

- **Wit of leeg scherm bij lokaal openen:** je opent het bestand direct. Gebruik het servertje uit stap 1.
- **"Je hebt hier geen toegang toe":** je account is nog niet goedgekeurd of `schema.sql` is niet (helemaal) uitgevoerd.
- **Upload mislukt bij een grote video:** de limiet is 50 MB op het gratis plan. Gebruik een externe link.
- **Video speelt niet of spoelen werkt niet:** controleer of het een MP4 met H.264/AAC is en of de host Range requests toestaat.
- **Wijziging niet zichtbaar na deploy:** ververs hard met `Ctrl + F5`.
