import { PlainActivity, PlainLocation, PlainPerson } from './PlainData';
import fs from 'fs';
import { __spreadArrays } from 'tslib';
import { ActivityCrud } from './ActivityCrud';
import { PersonCrud } from './PersonCrud';
import { LocationCrud } from './LocationCrud';
import { Crud } from './Crud';
const { prompt } = require('enquirer');

import { throws } from 'assert';

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
  name: string;
  persons: Map<string, PlainPerson>;
  locations: Map<string, PlainLocation>;
  activities: Map<string, PlainActivity>;

  activityCrud: ActivityCrud | undefined;
  locationCrud: LocationCrud | undefined;
  personCrud: PersonCrud | undefined;

  constructor(name: string) {
    this.name = name;

    this.locations = this.loadFile("locations");
    this.activities = this.loadFile("activities");
    this.persons = this.loadFile("persons");
    for (const [key, activity] of this.activities) {
      activity.begin = new Date(activity.begin)
      activity.end = new Date(activity.end)
    }
  }

  save() {
    this.saveFile("locations", this.locations);
    this.saveFile("activities", this.activities);
    this.saveFile("persons", this.persons);
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

  computeRiskForActivity(id: string) {

  }

  static dateWithoutTime(datetime: Date): Date {
    // from https://stackoverflow.com/a/38050824/39946
    return new Date(Date.UTC(datetime.getUTCFullYear(), datetime.getUTCMonth(), datetime.getUTCDate()));
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
    this.activityCrud = new ActivityCrud(this);
    this.locationCrud = new LocationCrud(this);
    this.personCrud = new PersonCrud(this);

    while (true) {
      const response = await prompt({
        type: 'select',
        name: 'action',
        message: 'Was möchtest du tun?',
        choices: ["Aktivitäten…", "Orte…", "Personen…", "Speichern", "Speichern und Beenden"]
      });

      switch (response.action) {
        case "Aktivitäten…":
          await this.activityCrud?.showMenu();
          break;
        case "Orte…":
          await this.locationCrud?.showMenu();
          break;
        case "Personen…":
          await this.personCrud?.showMenu();
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
}