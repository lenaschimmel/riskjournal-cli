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
const de = require('date-and-time/locale/de');
dateAndTime.locale(de);

import { defaultValues, calculateLocationPersonAverage, calculatePersonRisk, calculateActivityRisk } from './data/calculate';
import { Locations } from './data/location';
import { inspect } from 'util';
import { endianness } from 'os';

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
  }

  save() {
    this.saveFile("locations"       , this.locations);
    this.saveFile("activities"      , this.activities);
    this.saveFile("persons"         , this.persons);
    this.saveFile("cohabitations"   , this.cohabitations);
  }

  filename(kind: string): string {
    return "data/" + this.name + "/" + kind + ".json";
  }

  loadFile(kind: string) {
    try {
      const data = fs.readFileSync(this.filename(kind), { encoding: "utf8" });
      return JSON.parse(data, reviver);
    } catch (e) {
      return new Map();
    }
  }

  saveFile(kind: string, value: object) {
    const data = JSON.stringify(value, replacer, 2);
    fs.writeFileSync(this.filename(kind), data, { encoding: "utf8" });
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
        choices: ["Gesamtrikiso anzeigen", "Aktivitäten…", "Orte…", "Personen…", "Zusammenleben…", "Speichern", "Speichern und Beenden"]
      });

      switch (response.action) {
        case "Gesamtrikiso anzeigen":
          await this.showRiskAnalysis();
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
        case "Speichern":
          this.save();
          console.log("Profil wurde gepspeichert.");
          break;
        case "Speichern und Beenden":
          this.save();
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

  async showRiskAnalysis() {
    // From Feretti et al., "Quantifying SARS-CoV-2 transmission suggests epidemic control with digital contact tracing", Fig. 2
    // First entry is 0 days after infection, without knowing if the case will be symtomatic or not
    const transmissionProb = [0, 0.045, 0.13, 0.245, 0.35, 0.375, 0.34, 0.25, 0.15, 0.075, 0.025, 0.01, 0.001, 0];

    const activityArray = Array.from(this.activities.values());

    let table = new Table({
      head: ['Datum', 'Risiko neu', 'Infektiosität', 'Fehler']
    });

    let incomingRisk: Array<number> = [];
    let outgoingRisk: Array<number> = [];
    let hasError: Array<boolean> = [];

    
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

    for (let offset = 28; offset >= 0; offset--) {
      outgoingRisk[offset] = 0;
      for (let incomingOffset = 28; incomingOffset >= 0; incomingOffset--) {
        let daysSinceInfection = incomingOffset - offset;
        if (daysSinceInfection >= 0 && daysSinceInfection <= 13) {
          outgoingRisk[offset] += incomingRisk[incomingOffset] * transmissionProb[daysSinceInfection];
        }
      }

      let date = new Date();
      date.setDate(date.getDate() - offset);
      date = Profile.dateWithoutTime(date);

      table.push([
        dateAndTime.format(date, 'dd, DD MMMM:'),
        { content: Math.floor(incomingRisk[offset]), hAlign:'right' },
        { content: Math.floor(outgoingRisk[offset]), hAlign:'right' },
        hasError[offset] ? "!" : ""
      ]);
    }

    console.log(table.toString());
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
    // TODO usually, we would now check if we have specific data from this person,
    // and only if we don't, we would fall back to their risk profile
    return this.getPersonRisk(person.riskProfile, person.locationId);
  }
}