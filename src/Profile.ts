import { PlainActivity, PlainCohabitation, PlainLocation, PlainPerson } from './PlainData';
import fs from 'fs';
import { __spreadArrays } from 'tslib';
import DistrictData from './DistrictData';
import { dateWithoutTime, computeOverlapMinutes, computeOverlapWeeks, replacer, reviver } from './Helpers';
import { defaultValues, calculateLocationPersonAverage, calculatePersonRisk, calculateActivityRisk } from './data/calculate';
import CryptoNetwork from './CryptoNetwork';
import dateAndTime from 'date-and-time';

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
  cryptopNetwork: CryptoNetwork;

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

    this.cryptopNetwork = new CryptoNetwork(this);
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
    return subDirs.filter(dir => dir.isDirectory() && dir.name != "incidence").map(dir => ({ message: dir.name, name: dir.name }));
  }
  
  async computeRiskAnalysis(personToExclude: PlainPerson | null = null): Promise<Array<AnalysisDay>> {
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
          let activityRisk = this.computeActivityRisk(activity, overlapMinutes, personToExclude);
          if (activityRisk == null) {
            hasError[offset] = true;
          } else {
            incomingRisk[offset] += activityRisk;
          }
        }
      }

      for (const [key, cohabitation] of this.cohabitations) {
        if (cohabitation.knownPersonId == personToExclude?.id) {
          continue;
        }

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

  computeActivityRisk(activity: PlainActivity, duration: number, personToExclude: PlainPerson | null): number | null {
    // TODO refactor the calculation code from the original microCOVID project, or rewrite it,
    // so that we can put in the combined person risk of all persons
    let personRisk;
    if (activity.unknownPersonCount > 0) {
      let location = this.locations.get(activity.locationId);
      let riskPerUnknownPerson = this.getUnknownPersonRisk(activity.unknownPersonRiskProfile, location!.idLandkreis, activity.begin, "all");
      if (riskPerUnknownPerson == null) {
        console.log("Konnte Risiko für unbekannte Personen nicht bestimmen.");
        return null;
      }
      personRisk = activity.unknownPersonCount * riskPerUnknownPerson;
    } else {
      personRisk = 0;
    }

    for (const personId of activity.knownPersonIds) {
      if (personId == personToExclude?.id) {
        continue;
      }
      let specificPersonRisk = this.getSpecificPersonRisk(personId, activity.begin);
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
    let personRisk = this.getSpecificPersonRisk(cohabitation.knownPersonId, date);
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
  getUnknownPersonRisk(riskProfile: string, idLandkreis: string, date: Date, ageGroup: string): number | null {

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
  getSpecificPersonRisk(personId: string, date: Date): number | null {
    let person = this.persons.get(personId)!;
    if (!person) {
      return null;
    }

    if (person.profileName?.length > 0) {
      let filename = "data/" + person.profileName + "/export.json";
      // TODO read and use encrypted risk data

      let analysisDays = this.cryptopNetwork.loadRiskAnalysisEnc(person);
      if (analysisDays) {
        for (let analysisDay of analysisDays) {
          if (Math.abs(new Date(analysisDay.date).getTime() - date.getTime()) < 8000000) { 
            return analysisDay.outgoingRisk;
          }
        }
      }
    }

    return this.getUnknownPersonRisk(person.riskProfile, person.idLandkreis, date, "all");
  }
}