import { PlainActivity, PlainCohabitation, PlainLocation, PlainPerson } from './PlainData';
import fs from 'fs';
import { __spreadArrays } from 'tslib';
import dateAndTime from 'date-and-time';
import crypto from "crypto";
import { BASE_URL, HOST, PORT } from './constants';
import DistrictData from './DistrictData';
const de = require('date-and-time/locale/de');
dateAndTime.locale(de);
import { addDays, dateWithoutTime, computeOverlapMinutes, computeOverlapWeeks, replacer, reviver } from './Helpers';

import { defaultValues, calculateLocationPersonAverage, calculatePersonRisk, calculateActivityRisk } from './data/calculate';
import http from 'http';

export interface AnalysisDay {
  date: Date,
  incomingRisk: number,
  outgoingRisk: number,
  hasError: boolean
}

export class Profile {
  name: string;
  persons: Map<string, PlainPerson>;
  locations: Map<string, PlainLocation>;
  activities: Map<string, PlainActivity>;
  cohabitations: Map<string, PlainCohabitation>;

  districtData: DistrictData;

  privateKey: string | undefined;
  publicKey: string | undefined;

  constructor(name: string) {
    this.name = name;

    this.locations = this.loadFile("locations");
    this.activities = this.loadFile("activities");
    this.persons = this.loadFile("persons");
    this.cohabitations = this.loadFile("cohabitations");
    for (const [key, activity] of this.activities) {
      activity.begin = new Date(activity.begin)
      activity.end = new Date(activity.end)
    }
    for (const [key, cohabitation] of this.cohabitations) {
      cohabitation.begin = new Date(cohabitation.begin)
      cohabitation.end = new Date(cohabitation.end)
    }
    this.initKeys();
    this.districtData = new DistrictData();
  }

  save() {
    this.saveObject("locations", this.locations);
    this.saveObject("activities", this.activities);
    this.saveObject("persons", this.persons);
    this.saveObject("cohabitations", this.cohabitations);
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

  getActivityChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.activities.values()).map(activity => ({ name: activity.id, message: activity.title })));
  }

  getDistrictChoices(): Array<{ name: string, message: string }> {
    return this.districtData.getChoices();
  }

  getLocationChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.locations.values()).map(location => ({ name: location.id, message: location.title })));
  }

  getPersonChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.persons.values()).map(person => ({ name: person.id, message: person.name })));
  }

  getCohabitationTitle(cohabitation: PlainCohabitation): string {
    let begin = dateAndTime.format(cohabitation.begin, 'DD.MM.YY');
    let end = dateAndTime.format(cohabitation.end, 'DD.MM.YY');
    return "Mit " + this.persons.get(cohabitation.knownPersonId)?.name + " von " + begin + " bis " + end;
  }

  getCohabitationChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.cohabitations.values()).map(cohabitation => ({ name: cohabitation.id, message: this.getCohabitationTitle(cohabitation) })));
  }

  static getProfileChoices(): Array<{ message: string, name: string }> {
    let subDirs = fs.readdirSync("./data/", { encoding: "utf-8", withFileTypes: true });
    return subDirs.filter(dir => dir.isDirectory()).map(dir => ({ message: dir.name, name: dir.name }));
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

    this.saveBuffer("export", unencrypedData, "unenc");

    const encryptedData = crypto.publicEncrypt(
      {
        key: recipient.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      // We convert the data string to a buffer using `Buffer.from`
      unencrypedData
    )

    this.saveBuffer("export_for_" + recipient.profileName.toLowerCase(), encryptedData, "enc");
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

    this.saveBuffer("export_for_" + recipient.profileName.toLowerCase(), signedData, "sign");

    let messageId = this.computeMessageId(this.publicKey!, recipient.publicKey);

    await this.postToServer(messageId, signedData);
  }

  computeMessageId(senderKey: string, recipientKey: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(senderKey);
    hash.update(recipientKey);
    let messageId = hash.digest('hex');
    return messageId;
  }

  async postToServer(messageId: String, data: Buffer) {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/' + messageId,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length
      }
    }

    const req = http.request(options, res => {
      console.log(`statusCode: ${res.statusCode}`)
    })

    req.on('error', error => {
      console.error(error)
    })

    req.write(data)
    req.end()
  }

  loadRiskAnalysisEnc(sender: PlainPerson): Array<AnalysisDay> | null {
    try {
      let analysis: Array<AnalysisDay> = [];
      let filePath = "data/" + this.name + "/imports/" + sender.profileName + ".risk";
      let signedData = fs.readFileSync(filePath);
      let encryptedData = crypto.publicDecrypt(
        {
          key: sender.publicKey,
          padding: crypto.constants.RSA_NO_PADDING
        },
        signedData);

      this.saveBuffer("from_signed", encryptedData, "enc");

      let decryptedData = crypto.privateDecrypt(
        {
          key: this.privateKey!,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        encryptedData);

      if (decryptedData.readInt8(0) != 'M'.charCodeAt(0) ||
        decryptedData.readInt8(1) != 'C'.charCodeAt(0) ||
        decryptedData.readInt8(2) != 'A'.charCodeAt(0)) {
        throw new Error("Magic bytes at the beginning are wrong.");
      }
      let version = decryptedData.readInt8(3);
      if (version != 1) {
        throw new Error("Can only read version 1, but version is " + version);
      }
      let firstDate = new Date(decryptedData.readUInt32LE(4) * 1000);
      let daysCount = decryptedData.readInt8(8);

      console.log("Habe Daten gelesen, erstes Datum ist: " + firstDate.toDateString());

      for (let offset = daysCount - 1; offset >= 0; offset--) {
        let risk = decryptedData.readUInt16LE(9 + 2 * (daysCount - 1 - offset));
        analysis[offset] = {
          date: addDays(firstDate, daysCount - 1 - offset),
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
      date = dateWithoutTime(date);
      incomingRisk[offset] = 0;

      for (const [key, activity] of this.activities) {
        let overlapMinutes = computeOverlapMinutes(activity.begin, activity.end, date);

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
        let overlapWeeks = computeOverlapWeeks(cohabitation.begin, cohabitation.end, date);

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
      date = dateWithoutTime(date);

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
      let location = this.locations.get(activity.locationId);
      let riskPerUnknownPerson = this.getPersonRisk(activity.unknownPersonRiskProfile, location!.idLandkreis, activity.begin);
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

    return personRisk * activityRisk * duration;
  }

  /// Calculates the risk for non-specific person given their idLandkreis and risk profile
  getPersonRisk(riskProfile: string, idLandkreis: string, date: Date): number | null {

    let calculatorData = {
      ...defaultValues,
      topLocation: '',
      subLocation: '',
      ...this.districtData.getDataForCalculator(idLandkreis, date, "all"),
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

    if (person.profileName?.length > 0) {
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

    return this.getPersonRisk(person.riskProfile, person.idLandkreis, date);
  }

  initKeys() {
    try {
      this.privateKey = fs.readFileSync(this.filename("private", "key"), { encoding: "utf8" });
      this.publicKey = fs.readFileSync(this.filename("public", "key"), { encoding: "utf8" });
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
      this.publicKey = publicKey;
      fs.writeFileSync(this.filename("private", "key"), this.privateKey, { encoding: "utf8" });
      fs.writeFileSync(this.filename("public", "key"), this.publicKey, { encoding: "utf8" });
      console.log("Neues Schlüsselpaar wurde erzeugt und geschrieben.");
    }
  }

  downloadExternalRisk() {
    for (const person of this.persons.values()) {
      if (person.publicKey && person.publicKey.length > 1) {
        console.log("Now updating external risk for " + person.profileName);
        const filePath = "data/" + this.name + "/imports/" + person.profileName + ".risk";
        let messageId = this.computeMessageId(person.publicKey, this.publicKey!);
        http.get(BASE_URL + messageId, res => {
          if (res.statusCode == 200) {
            let body = "";
            let stream = fs.createWriteStream(filePath);
            res.on("error", error => {
              console.log("Download error: " + error);
            });
            res.on("data", data => {
              stream.write(data);
            });
            res.on("end", () => {
              stream.close();
              console.log("Finished updating external risk for " + person.profileName);
            });
          } else {
            console.log("Download status code: " + res.statusCode + " with message: " + res.statusMessage);
          }
        });
      }
    }
  }
}