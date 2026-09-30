/**
 * Een ondertekende Android-bundel op deze machine bouwen, buiten EAS om.
 *
 * `eas build --local` weigert op Windows ("macOS or Linux is required"), en de
 * gratis wachtrij van EAS kan een uur duren — lang om te ontdekken dat er één
 * veld verkeerd stond. Dit doet hetzelfde werk hier: prebuild, ondertekenen met
 * de uploadsleutel, Gradle laten draaien.
 *
 * De EAS-opzet blijft ongemoeid. De map `android/` is gegenereerd en staat in
 * .gitignore, dus alles wat dit script daarin schrijft gooit de volgende
 * prebuild weer weg.
 *
 *   node scripts/android-lokaal.mjs --version-code=4 [--clean] [--minify]
 *
 * Nodig: een JDK 17 en een Android SDK. Zet JAVA_HOME en ANDROID_HOME, of laat
 * ze in %USERPROFILE%/dev staan als jdk-* en android-sdk.
 *
 * En de sleutel: signing/upload.jks met signing/upload.json ernaast. Die haal je
 * één keer bij EAS vandaan met `eas credentials --platform android`. Play kent
 * per app één uploadcertificaat en weigert alles wat met een andere sleutel is
 * ondertekend, dus zonder die sleutel heeft bouwen geen zin.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BACKSLASH = String.fromCharCode(92);
const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const clean = args.includes('--clean');

// R8 staat uit. Het levert hier een paar megabyte op en kan stil code weghalen
// die React Native via reflectie opzoekt; dat merk je pas in de productieversie.
const minify = args.includes('--minify');

const versionCodeArg = args.find((a) => a.startsWith('--version-code='));
const versionCode = Number(versionCodeArg?.split('=')[1]);

function stop(bericht) {
  console.error('\n' + bericht + '\n');
  process.exit(1);
}

if (!Number.isInteger(versionCode) || versionCode < 1) {
  stop(
    'Geef het versionCode mee: --version-code=4\n' +
      'Play wil bij elke upload een hoger nummer dan de vorige. Kijk in de Play\n' +
      'Console welke er al staat.',
  );
}

const bestaat = (paden) => paden.find((p) => p && fs.existsSync(p));

const dev = path.join(os.homedir(), 'dev');
const jdkGok = fs.existsSync(dev)
  ? fs.readdirSync(dev)
      .filter((naam) => naam.startsWith('jdk-'))
      .sort()
      .reverse()
      .map((naam) => path.join(dev, naam))
  : [];

const javaHome = bestaat([process.env.JAVA_HOME, ...jdkGok]);
const androidHome = bestaat([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  path.join(dev, 'android-sdk'),
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
]);

if (!javaHome) stop('Geen JDK gevonden. Zet JAVA_HOME, of pak een JDK 17 uit in %USERPROFILE%/dev/jdk-17...');
if (!androidHome) stop('Geen Android SDK gevonden. Zet ANDROID_HOME, of zet er een in %USERPROFILE%/dev/android-sdk');

const keystore = path.join(root, 'signing', 'upload.jks');
const credsBestand = path.join(root, 'signing', 'upload.json');
if (!fs.existsSync(keystore) || !fs.existsSync(credsBestand)) {
  stop(
    'signing/upload.jks en signing/upload.json ontbreken.\n' +
      'Haal ze bij EAS vandaan: eas credentials --platform android\n' +
      '  → production → Keystore: Manage everything → Download\n' +
      'Zet de wachtwoorden in signing/upload.json als { "storePassword", "keyAlias",\n' +
      '"keyPassword", "expectedSha1" }. De map staat in .gitignore: die sleutel kwijt\n' +
      'raken betekent dat Play geen nieuwe versies meer aanneemt.',
  );
}

const creds = JSON.parse(fs.readFileSync(credsBestand, 'utf8'));

// Eerst de sleutel nakijken, dan pas twaalf minuten bouwen. Play weigert een
// bundel die met een andere sleutel is ondertekend, en dat merk je anders pas
// bij het uploaden.
function vingerafdruk() {
  const uit = execFileSync(
    path.join(javaHome, 'bin', 'keytool.exe'),
    ['-list', '-v', '-keystore', keystore, '-storepass', creds.storePassword,
      '-alias', creds.keyAlias],
    { encoding: 'utf8' },
  );
  return uit.match(/SHA1:\s*([0-9A-F:]+)/)?.[1] ?? null;
}

const sha1 = vingerafdruk();
if (creds.expectedSha1 && sha1 && sha1 !== creds.expectedSha1) {
  stop(
    'signing/upload.jks is niet de sleutel die Play verwacht.\n' +
      '  verwacht ' + creds.expectedSha1 + '\n' +
      '  gevonden ' + sha1,
  );
}

console.log('JDK          ' + javaHome);
console.log('Android SDK  ' + androidHome);
console.log('versionCode  ' + versionCode + '\n');

function draai(commando, argumenten, opties = {}) {
  console.log('> ' + path.basename(commando) + ' ' + argumenten.join(' '));
  const uit = spawnSync(commando, argumenten, {
    stdio: 'inherit', shell: true, cwd: root, ...opties,
  });
  if (uit.status !== 0) stop(path.basename(commando) + ' stopte met code ' + uit.status);
}

function vervangEen(bron, patroon, vervanging, wat) {
  const uit = bron.replace(patroon, vervanging);
  if (uit === bron) {
    stop('Kon ' + wat + ' niet aanpassen in android/app/build.gradle.\n' +
      'De Expo-sjabloon is veranderd. Lees het bestand en pas dit script aan.');
  }
  return uit;
}

// 1. android/ maken uit app.json.
const prebuild = ['expo', 'prebuild', '--platform', 'android', '--no-install'];
if (clean) prebuild.push('--clean');
draai('npx', prebuild);

const androidDir = path.join(root, 'android');
const appDir = path.join(androidDir, 'app');

// 2. Gradle vertellen waar de SDK staat. In een .properties-bestand is een
//    backslash een ontsnappingsteken, dus een Windows-pad krijgt ze dubbel.
fs.writeFileSync(
  path.join(androidDir, 'local.properties'),
  'sdk.dir=' + androidHome.split(BACKSLASH).join(BACKSLASH + BACKSLASH) + '\n',
);

// 3. Meer geheugen dan de 2 GB uit het sjabloon. Met expo-updates erbij loopt
//    een releasebuild anders vast in "OutOfMemoryError: Metaspace": de daemon
//    blijft draaien, schrijft niets meer, en stopt uit zichzelf niet.
const propsPad = path.join(androidDir, 'gradle.properties');
const props = fs.readFileSync(propsPad, 'utf8');
const jvmRegel = /^org\.gradle\.jvmargs=.*$/m;
if (!jvmRegel.test(props)) {
  stop('org.gradle.jvmargs staat niet in android/gradle.properties. Sjabloon veranderd.');
}
fs.writeFileSync(propsPad, props.replace(jvmRegel,
  'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m'));

// 4. De sleutel neerzetten waar Gradle hem zoekt, met de wachtwoorden erbij.
fs.copyFileSync(keystore, path.join(appDir, 'upload.jks'));
fs.appendFileSync(propsPad, [
  '',
  '# Geschreven door scripts/android-lokaal.mjs',
  'UPLOAD_STORE_FILE=upload.jks',
  'UPLOAD_STORE_PASSWORD=' + creds.storePassword,
  'UPLOAD_KEY_ALIAS=' + creds.keyAlias,
  'UPLOAD_KEY_PASSWORD=' + creds.keyPassword,
  'android.enableMinifyInReleaseBuilds=' + String(minify),
  '',
].join('\n'));

// 5. De gegenereerde build.gradle ondertekent release met de debugsleutel, en
//    die weigert Play. Er komt een echte release-configuratie in.
const gradlePad = path.join(appDir, 'build.gradle');
let gradle = fs.readFileSync(gradlePad, 'utf8');

gradle = vervangEen(gradle, 'signingConfigs {', 'signingConfigs {' + [
  '',
  '        release {',
  '            storeFile file(UPLOAD_STORE_FILE)',
  '            storePassword UPLOAD_STORE_PASSWORD',
  '            keyAlias UPLOAD_KEY_ALIAS',
  '            keyPassword UPLOAD_KEY_PASSWORD',
  '        }',
].join('\n'), 'het signingConfigs-blok');

// "signingConfig signingConfigs.debug" staat er twee keer: één keer bij debug,
// waar het klopt, en één keer bij release, waar het fout is. Alleen de tweede.
let gezien = 0;
gradle = gradle.replace(/signingConfig signingConfigs\.debug/g, (match) => {
  gezien += 1;
  return gezien === 2 ? 'signingConfig signingConfigs.release' : match;
});
if (gezien !== 2) {
  stop('Verwachtte twee debug-signingConfig regels, gevonden ' + gezien + '. Sjabloon veranderd.');
}

gradle = vervangEen(gradle, /versionCode \d+/, 'versionCode ' + versionCode, 'het versionCode');
fs.writeFileSync(gradlePad, gradle);

// 6. Bouwen. --console=plain omdat de balk elke seconde opnieuw tekent en een
//    Windows-terminal elk beeld bewaart; de paar regels die ertoe doen verdwijnen
//    anders onder duizend keer "92% EXECUTING".
draai(path.join(androidDir, 'gradlew.bat'), ['bundleRelease', '--console=plain'], {
  cwd: androidDir,
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome },
});

const aab = path.join(appDir, 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!fs.existsSync(aab)) stop('Gradle is klaar, maar er staat geen bundel in ' + aab);

console.log('\n' + aab);
console.log((fs.statSync(aab).size / 1024 / 1024).toFixed(1) + ' MB, versionCode ' + versionCode);
if (sha1) console.log('ondertekend met SHA1 ' + sha1);
if (!minify) console.log('gebouwd zonder R8 (zet --minify om dat aan te zetten)');
