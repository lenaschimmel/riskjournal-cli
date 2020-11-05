import { PlainActivity, PlainCohabitation, PlainLocation, PlainPerson } from './PlainData';
import fs from 'fs';
import { __spreadArrays } from 'tslib';
import { ActivityCrud } from './ActivityCrud';
import { PersonCrud } from './PersonCrud';
import { LocationCrud } from './LocationCrud';
import { CohabitationCrud } from './CohabitationCrud';
const { prompt } = require('enquirer');
import Table from 'cli-table3';
import dateAndTime from 'date-and-time';
import crypto  from "crypto";
const de = require('date-and-time/locale/de');
dateAndTime.locale(de);

import { defaultValues, calculateLocationPersonAverage, calculatePersonRisk, calculateActivityRisk } from './data/calculate';
import { Locations } from './data/location';
import { inspect } from 'util';
import { endianness } from 'os';

interface AnalysisDay {
    date: Date,
    incomingRisk: number,
    outgoingRisk: number,
    hasError: boolean
}

// Add support for Maps, from https://stackoverflow.com/a/56150320/39946
function replacer(this: { [key: string]: any } , key: string, value: any) {
  const originalObject = this[key];
  if (originalObject instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
    };
  } else {
    return value;
  }
}

// Add support for Maps, from https://stackoverflow.com/a/56150320/39946
function reviver(key: string, value: any) {
  if (typeof value === 'object' && value !== null) {
    if (value.dataType === 'Map') {
      return new Map(value.value);
    }
  }
  return value;
}

export default class Profile {
  name         : string;
  persons      : Map<string, PlainPerson>;
  locations    : Map<string, PlainLocation>;
  activities   : Map<string, PlainActivity>;
  cohabitations: Map<string, PlainCohabitation>;

  activityCrud    : ActivityCrud     | undefined;
  locationCrud    : LocationCrud     | undefined;
  personCrud      : PersonCrud       | undefined;
  cohabitationCrud: CohabitationCrud | undefined;

  privateKey : string | undefined;
  publicKey  : string | undefined;

  constructor(name: string) {
    this.name = name;

    this.locations     = this.loadFile("locations");
    this.activities    = this.loadFile("activities");
    this.persons       = this.loadFile("persons");
    this.cohabitations = this.loadFile("cohabitations");
    for (const [key, activity] of this.activities) {
      activity.begin = new Date(activity.begin)
      activity.end   = new Date(activity.end)
    }   
    for (const [key, cohabitation] of this.cohabitations) {
      cohabitation.begin = new Date(cohabitation.begin)
      cohabitation.end   = new Date(cohabitation.end)
    }
    this.initKeys();
  }

  save() {
    this.saveObject("locations"       , this.locations);
    this.saveObject("activities"      , this.activities);
    this.saveObject("persons"         , this.persons);
    this.saveObject("cohabitations"   , this.cohabitations);
  }

  filename(kind: string, ending: string = "json"): string {
    return "data/" + this.name + "/" + kind + "." + ending;
  }

  loadFile(kind: string) {
    try {
      const data = fs.readFileSync(this.filename(kind), { encoding: "utf8" });
      return JSON.parse(data, reviver);
    } catch (e) {
      return new Map();
    }
  }

  saveObject(kind: string, value: object, ending: string = "json") {
    const data = JSON.stringify(value, replacer, 2);
    this.saveString(kind, data, ending);
  }

  saveString(kind: string, value: string, ending: string = "json") {
    fs.writeFileSync(this.filename(kind, ending), value, { encoding: "utf8" });
  }

  saveBuffer(kind: string, value: Buffer, ending: string = "json") {
    fs.writeFileSync(this.filename(kind, ending), value);
  }

  loadBuffer(kind: string, ending: string = "json"): Buffer {
    return fs.readFileSync(this.filename(kind, ending));
  }

  addActivity(activity: PlainActivity) {
    this.activities.set(activity.id, activity);
  }

  addLocation(location: PlainLocation) {
    this.locations.set(location.id, location);
  }

  addPerson(person: PlainPerson) {
    this.persons.set(person.id, person);
  }

  addCohabitation(cohabitation: PlainCohabitation) {
    this.cohabitations.set(cohabitation.id, cohabitation);
  }

  static dateWithoutTime(datetime: Date): Date {
    // from https://stackoverflow.com/a/38050824/39946
    // but with local time zone
    return new Date(datetime.getFullYear(), datetime.getMonth(), datetime.getDate());
  }

  getActivityChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.activities.values()).map(activity => ({ name: activity.id, message: activity.title })));
  }

  getLocationChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.locations.values()).map(location => ({ name: location.id, message: location.title })));
  }

  getPersonChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.persons.values()).map(person => ({ name: person.id, message: person.name })));
  }

  getCohabitationTitle(cohabitation: PlainCohabitation): string {
    let begin = dateAndTime.format(cohabitation.begin, 'DD.MM.YY');
    let end   = dateAndTime.format(cohabitation.end  , 'DD.MM.YY');
    return "Mit " + this.persons.get(cohabitation.knownPersonId)?.name + " von " + begin +  " bis " + end;
  }

  getCohabitationChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.cohabitations.values()).map(cohabitation => ({ name: cohabitation.id, message: this.getCohabitationTitle(cohabitation) })));
  }

  static getProfileChoices(): Array<{ message: string, name: string }> {
    let subDirs = fs.readdirSync("./data/", { encoding: "utf-8", withFileTypes: true });
    return subDirs.filter(dir => dir.isDirectory()).map(dir => ({ message: dir.name, name: dir.name }));
  }

  static timeSpanString(begin: Date, end: Date) {
    let diffSeconds = (Math.floor(end.getTime() - begin.getTime())) / 1000;
    if (diffSeconds < 90) {
      return diffSeconds + " Sekunden";
    }
    let diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 120) {
      return diffMinutes + " Minuten";
    }
    let diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 49) {
      return diffHours + " Stunden";
    }
    let diffDays = Math.floor(diffHours / 24);
    if (diffDays < 15) {
      return diffDays + " Tage";
    }
    let diffWeeks = Math.floor(diffDays / 7);
    return diffWeeks + " Wochen";
  }

  async showMenu() {
    this.activityCrud     = new ActivityCrud(this);
    this.locationCrud     = new LocationCrud(this);
    this.personCrud       = new PersonCrud(this);
    this.cohabitationCrud = new CohabitationCrud(this);

    while (true) {
      const response = await prompt({
        type: 'select',
        name: 'action',
        message: 'Was möchtest du tun?',
        choices: ["Gesamtrikiso anzeigen", "Aktivitäten…", "Orte…", "Personen…", "Zusammenleben…", "Fremdes Risiko anzeigen…", "Speichern und Exportieren", "Speichern, Exportieren und Beenden"]
      });

      switch (response.action) {
        case "Gesamtrikiso anzeigen":
          let analysis = await this.computeRiskAnalysis();
          await this.showRiskAnalysis(analysis);
          break;
        case "Aktivitäten…":
          await this.activityCrud?.showMenu();
          break;
        case "Orte…":
          await this.locationCrud?.showMenu();
          break;
        case "Personen…":
          await this.personCrud?.showMenu();
          break;
        case "Zusammenleben…":
          await this.cohabitationCrud?.showMenu();
          break;
        case "Fremdes Risiko anzeigen…":
          await this.showExternalRiskAnalysis();
          break;
        case "Speichern und Exportieren":
          this.save();
          await this.export();
          console.log("Profil wurde gepspeichert.");
          break;
        case "Speichern, Exportieren und Beenden":
          this.save();
          await this.export();
          console.log("Profil wurde gepspeichert. Tschüss!");
          return;
      }
    }
  }

    
  computeOverlapWeeks(begin: Date, end: Date, day: Date): number {
    return this.computeOverlapMilliseconds(begin, end, day) / (60 * 60 * 1000 * 24 * 7);
  }
  
  computeOverlapMinutes(begin: Date, end: Date, day: Date): number {
    return this.computeOverlapMilliseconds(begin, end, day) / (60 * 1000);
  }
  
  computeOverlapMilliseconds(begin: Date, end: Date, day: Date): number {
    let eventBeginTime = begin.getTime();
    let eventEndTime   = end.getTime();
    let dayBeginTime   = Profile.dateWithoutTime(day).getTime();
    let dayEndTime     = dayBeginTime + 1000 * 3600 * 24;
    
    return Math.max(0, Math.min(dayEndTime, eventEndTime) - Math.max(dayBeginTime, eventBeginTime));
  }

  async showRiskAnalysis(analysis: Array<AnalysisDay>) {
    // let analysis = await this.computeRiskAnalysis();
    let table = new Table({
      head: ['Datum', 'Risiko neu', 'Infektiosität', 'Fehler']
    });

    for (let offset = 28; offset >= 0; offset--) {
      let data = analysis[offset];
      table.push([
        dateAndTime.format(data.date, 'dd, DD MMMM:'),
        { content: Math.floor(data.incomingRisk), hAlign:'right' },
        { content: Math.floor(data.outgoingRisk), hAlign:'right' },
        data.hasError ? "!" : ""
      ]);
    }

    console.log(table.toString());
  }

  async export() {
    let anaylsis = await this.computeRiskAnalysis();
    await this.exportRiskAnalysis(anaylsis);
    for (const person of this.persons.values()) {
      if (person.publicKey?.length > 0) {
        await this.exportRiskAnalysisEnc(anaylsis, person);
      }
    }
  }

  async exportRiskAnalysis(analysis: Array<AnalysisDay>) {
    let dataExport = [];
    for (let offset = 28; offset >= 0; offset--) {
      let data = analysis[offset];
      dataExport.push({ date: dateAndTime.format(data.date, "YYYY-MM-DD"), contagiosity: data.outgoingRisk });
    }
    this.saveObject("export", dataExport);
  }

  async exportRiskAnalysisEnc(analysis: Array<AnalysisDay>, recipient: PlainPerson) {
    let daysCount = 29;
    let unencrypedData = Buffer.alloc(9 + daysCount * 2);

    unencrypedData.writeInt8('M'.charCodeAt(0), 0);
    unencrypedData.writeInt8('C'.charCodeAt(0), 1);
    unencrypedData.writeInt8('A'.charCodeAt(0), 2);
    unencrypedData.writeInt8(1, 3); // File format version
    unencrypedData.writeUInt32LE(analysis[daysCount - 1].date.getTime() / 1000, 4);
    unencrypedData.writeInt8(daysCount, 8);
    
    for (let offset = daysCount - 1; offset >= 0; offset--) {
      let data = analysis[offset];
      unencrypedData.writeUInt16LE(data.outgoingRisk, 9 + 2 * (daysCount - 1 - offset));
    }
    
    const encryptedData = crypto.publicEncrypt(
      {
        key: recipient.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      // We convert the data string to a buffer using `Buffer.from`
      unencrypedData
    )

    // const signature = crypto.sign("sha256", encryptedData, {
    //   key: this.privateKey!,
    //   padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    // })

    const signedData = crypto.privateEncrypt(
      {
        key: this.privateKey!,
        padding: crypto.constants.RSA_NO_PADDING
      },
      encryptedData
    );

    this.saveBuffer("export", unencrypedData, "unenc");
    this.saveBuffer("export_for_" + recipient.profileName.toLowerCase(), encryptedData,  "enc");
    this.saveBuffer("export_for_" + recipient.profileName.toLowerCase(), signedData,  "sign");

    // TODO either concatenate encryptedData and signature into a single file (each are 256 byte)
    // or use the recipients key with crypto.privateEncrypt for double encryption instead of
    // a proper signature.
  }

  async showExternalRiskAnalysis() {
    let ids = this.getPersonChoices();
    if (ids.length == 0) {
      console.log("Keine Personen vorhanden.");
      return;
    }

    const response = await prompt({
      type: 'select',
      name: 'id',
      message: "Wähle aus, von welcher Person die Daten gelesen werden sollen.",
      choices: ["<Abbrechen>", ...ids]
    });

    if (response.id != "<Abbrechen>") {
      let person = this.persons.get(response.id)!;
      let analysis = this.loadRiskAnalysisEnc(person);
      await this.showRiskAnalysis(analysis!);
    }
  }

  loadRiskAnalysisEnc(sender: PlainPerson): Array<AnalysisDay> | null {
    try {
      let analysis: Array<AnalysisDay> = [];
      
      let signedData = fs.readFileSync("data/" + sender.profileName + "/" + "export_for_" + this.name.toLowerCase() + "." + "sign");
      let encryptedData = crypto.publicDecrypt(
        {
          key: sender.publicKey,
          padding: crypto.constants.RSA_NO_PADDING
        },
        signedData);

      this.saveBuffer("from_signed", encryptedData,  "enc");
      
      let decryptedData = crypto.privateDecrypt(
        {
          key: this.privateKey!,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        encryptedData);

      if(decryptedData.readInt8(0) != 'M'.charCodeAt(0) ||
         decryptedData.readInt8(1) != 'C'.charCodeAt(0) || 
         decryptedData.readInt8(2) != 'A'.charCodeAt(0)) {
          throw new Error("Magic bytes at the beginning are wrong.");
      }
      let version = decryptedData.readInt8(3);
      if(version != 1) {
        throw new Error("Can only read version 1, but version is " + version);
      }
      let firstDate = new Date(decryptedData.readUInt32LE(4) * 1000);
      let daysCount = decryptedData.readInt8(8);
      
      console.log("Habe Daten gelesen, erstes Datum ist: " + firstDate.toDateString());

      for (let offset = daysCount - 1; offset >= 0; offset--) {
        let risk = decryptedData.readUInt16LE(9 + 2 * (daysCount - 1 - offset));
        analysis[offset] = {
          date: this.addDays(firstDate, daysCount - 1 - offset),
          incomingRisk: 0,
          outgoingRisk: risk,
          hasError: false
        }
      }
      return analysis;
    } catch (e) {
      console.log("Fehler beim Lesen: " + e);
    }
    return null;
  }

  addDays(inDate: Date, days: number) {
    var date = new Date(inDate.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}

  async computeRiskAnalysis(): Promise<Array<AnalysisDay>> {
    // From Feretti et al., "Quantifying SARS-CoV-2 transmission suggests epidemic control with digital contact tracing", Fig. 2
    // First entry is 0 days after infection, without knowing if the case will be symtomatic or not
    const transmissionProb = [0, 0.045, 0.13, 0.245, 0.35, 0.375, 0.34, 0.25, 0.15, 0.075, 0.025, 0.01, 0.001, 0];

    const activityArray = Array.from(this.activities.values());

    let incomingRisk: Array<number> = [];
    let outgoingRisk: Array<number> = [];
    let hasError: Array<boolean> = [];

    let ret: Array<AnalysisDay> = [];

    for (let offset = 42; offset >= 0; offset--) {
      let date = new Date();
      date.setDate(date.getDate() - offset);
      date = Profile.dateWithoutTime(date);
      incomingRisk[offset] = 0;

      for (const [key, activity] of this.activities) {
        let overlapMinutes = this.computeOverlapMinutes(activity.begin, activity.end, date);

        if (overlapMinutes > 0) {
          let activityRisk = this.computeActivityRisk(activity, overlapMinutes);
          if (activityRisk == null) {
            hasError[offset] = true;
          } else {
            incomingRisk[offset] += activityRisk;
          }
        }
      }

      for (const [key, cohabitation] of this.cohabitations) {
        let overlapWeeks = this.computeOverlapWeeks(cohabitation.begin, cohabitation.end, date);

        if (overlapWeeks > 0) {
          let cohabitationRisk = this.computeCohabitationRisk(cohabitation, overlapWeeks, date);
          if (cohabitationRisk == null) {
            hasError[offset] = true;
          } else {
            incomingRisk[offset] += cohabitationRisk;
          }
        }
      }
    }

    for (let offset = 0; offset <= 28; offset++) {
      outgoingRisk[offset] = 0;
      for (let incomingOffset = 42; incomingOffset >= 0; incomingOffset--) {
        let daysSinceInfection = incomingOffset - offset;
        if (daysSinceInfection >= 0 && daysSinceInfection <= 13) {
          outgoingRisk[offset] += incomingRisk[incomingOffset] * transmissionProb[daysSinceInfection];
        }
      }

      let date = new Date();
      date.setDate(date.getDate() - offset);
      date = Profile.dateWithoutTime(date);

      ret.push({
        date,
        incomingRisk: incomingRisk[offset],
        outgoingRisk: outgoingRisk[offset],
        hasError: hasError[offset]
      });  
    }
    
    return ret;
  }

  computeActivityRisk(activity: PlainActivity, duration: number): number | null {
    // TODO refactor the calculation code from the original microCOVID project, or rewrite it,
    // so that we can put in the combined person risk of all persons
    let personRisk;
    if (activity.unknownPersonCount > 0) {
      let riskPerUnknownPerson = this.getPersonRisk(activity.unknownPersonRiskProfile, activity.locationId);
      if (riskPerUnknownPerson == null) {
        console.log("Konnte Risiko für unbekannte Personen nicht bestimmen.");
        return null;
      }
      personRisk = activity.unknownPersonCount * riskPerUnknownPerson;
    } else {
      personRisk = 0;
    }
    
    for (const personId of activity.knownPersonIds) {
      let specificPersonRisk = this.getPersonRiskOnDay(personId, activity.begin);
      if (specificPersonRisk == null) {
        console.log("Konnte Risiko für " + personId + " nicht bestimmen.");
        return null;
      }
      personRisk += specificPersonRisk;
    }

    let calculatorData = {
      ...defaultValues,
      ...activity,
      personCount: 1,
      interaction: "oneTime",
      duration: duration,
    }

    let activityRisk = calculateActivityRisk(calculatorData);
    if (activityRisk == null) {
      console.log("Konnte Risiko für '" + activity.title + "' nicht bestimmen.");
      return null;
    }

    return personRisk * activityRisk;
  }


  computeCohabitationRisk(cohabitation: PlainCohabitation, duration: number, date: Date): number | null {
    // TODO refactor the calculation code from the original microCOVID project, or rewrite it,
    // so that we can put in the combined person risk of all persons
    let personRisk = this.getPersonRiskOnDay(cohabitation.knownPersonId, date);
    if (personRisk == null) {
      console.log("Konnte Risiko für " + cohabitation.knownPersonId + " nicht bestimmen.");
      return null;
    }
    
    let calculatorData = {
      ...defaultValues,
      ...cohabitation,
      personCount: 1,
      interaction: cohabitation.sleepingTogether ? "partner" : "repeated",
    }

    let activityRisk = calculateActivityRisk(calculatorData);
    if (activityRisk == null) {
      console.log("Konnte Risiko für '" + cohabitation.id + "' nicht bestimmen.");
      return null;
    }

    return personRisk * activityRisk  * duration;
  }

  /// Calculates the risk for non-specific person given their location and risk profile
  getPersonRisk(riskProfile : string, locationId: string): number | null {
    let location = this.locations.get(locationId)!;

    let dataLocation = Locations[location.sub || location.top];

    let calculatorData = {
      ...defaultValues,
      ...dataLocation,
      topLocation: location.top,
      subLocation: location.sub,
      riskProfile: riskProfile,
      personCount: 1,
    }

    // console.log("Berechne Risiko für " + inspect(calculatorData));
    
    const averagePersonRisk = calculateLocationPersonAverage(calculatorData);
    if (averagePersonRisk === null) {
      console.log("No average risk");
      return null;
    }

    // Person risk
    let points = calculatePersonRisk(calculatorData, averagePersonRisk);
    if (points === null) {
      console.log("No person risk");
      return null;
    }
    return points;
  }

  /// Calculates the risk for a specific person on a specific day
  getPersonRiskOnDay(personId: string, date: Date): number | null {
    let person = this.persons.get(personId)!;
    if (!person) {
      return null;
    }

    if (person.profileName?.length >0) {
      let filename = "data/" + person.profileName + "/export.json";
      const rawData = fs.readFileSync(filename, { encoding: "utf8" });
      let data = JSON.parse(rawData);
      for (let record of data) {
        // console.log(record.date + " == " + date + "   ==>>  " + new Date(record.date).getTime() + " == " + date.getTime());
        if (Math.abs(new Date(record.date).getTime() - date.getTime()) < 8000000) {
          return record.contagiosity;
        }
      }
    }
  
    // TODO usually, we would now check if we have specific data from this person,
    // and only if we don't, we would fall back to their risk profile
    return this.getPersonRisk(person.riskProfile, person.locationId);
    
  }

  initKeys() {
    try {
      this.privateKey = fs.readFileSync(this.filename("private", "key"), { encoding: "utf8" });
      this.publicKey  = fs.readFileSync(this.filename("public",  "key"), { encoding: "utf8" });
    } catch (e) {
      console.log("Konnte Schlüsselpaar nicht lesen, erzeuge neues…");
      const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        // The standard secure default length for RSA keys is 2048 bits
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        }
      })
      this.privateKey = privateKey;
      this.publicKey  = publicKey;
      fs.writeFileSync(this.filename("private", "key"), this.privateKey, { encoding: "utf8" });
      fs.writeFileSync(this.filename("public" , "key"), this.publicKey , { encoding: "utf8" });
      console.log("Neues Schlüsselpaar wurde erzeugt und geschrieben.");
    }
  }
}