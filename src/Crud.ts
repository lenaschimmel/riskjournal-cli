import Profile from "./Profile";
const { prompt } = require('enquirer');
import { PlainActivity, PlainLocation, PlainPerson } from './PlainData';
import { nodeModuleNameResolver } from "typescript";
import { throws } from "assert";
import { inspect } from "util";
import { RiskProfile } from "./data/data";

export interface Question {
  type: string,
  name: string,
  message: string,
  [key: string]: any,
  hint?: string,
  choices?: Array<object>,
}

export abstract class Crud {
  profile: Profile;
  name: string;

  constructor(profile: Profile, name: string) {
    this.profile = profile;
    this.name = name;
  }

  async showMenu() {
    while (true) {
      const response = await prompt({
        type: 'select',
        name: 'action',
        message: this.name + ' - Was möchtest du tun?',
        choices: ["Anzeigen", "Bearbeiten", "Hinzufügen", "Löschen", "Zurück"]
      });

      switch (response.action) {
        case "Anzeigen":
          console.log("Liste der " + this.name + " für " + this.profile.name + ":\n");
          await this.printList();
          break;
        case "Bearbeiten":
          await this.showEditMenu();
          break;
        case "Hinzufügen":
          await this.performAdd();
          break;
        case "Löschen":
          await this.showDeleteMenu();
          break;
        case "Zurück":
          return;
      }
    }
  }

  abstract async printList(): Promise<void>;
  abstract async performEdit(id: string): Promise<void>;
  abstract async performDelete(id: string): Promise<void>;
  abstract async performAdd(): Promise<string>;
  abstract getIds(): Array<string>;

  createId(name: string, currentIds: Array<string>) {
    name = name.toLowerCase().replace(" ", "_");
    while (currentIds.includes(name)) {
      name = name + "_";
    }
    return name;
  }

  async showEditMenu() {
    let ids = this.getIds();
    if (ids.length == 0) {
      console.log("Keine " + this.name + " vorhanden.");
      return;
    }

    const response = await prompt({
      type: 'select',
      name: 'id',
      message: this.name + ' - Welchen Eintrag möchtest du bearbeiten?',
      choices: ["<Abbrechen>", ...ids]
    });

    if (response.id != "<Abbrechen>") {
      await this.performEdit(response.id);
    }
  }

  async showDeleteMenu() {
    let ids = this.getIds();
    if (ids.length == 0) {
      console.log("Keine " + this.name + " vorhanden.");
      return;
    }

    const response = await prompt({
      type: 'select',
      name: 'id',
      message: this.name + ' - Welchen Eintrag möchtest du löschen?',
      choices: ["<Abbrechen>", ...ids]
    });

    if (response.id != "<Abbrechen>") {
      await this.performDelete(response.id);
    }
  }

  initAnswers(questions: Array<Question>, initials: { [key: string]: any }) {
    for (const question of questions) {
      let key = question.name;
      if (Object.prototype.hasOwnProperty.call(initials, key)) {
        question.initial = initials[key];
      } else {
        question.initial = null;
      }
    }
  }

  getChoices(map: { [key: string]: any }) {
    let ret = [];
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        const element = map[key];
        ret.push( {
          message: key, // translate
          name: key,
          hint: element.label // translate
        } );
      }
    }
    return ret;
  }
}