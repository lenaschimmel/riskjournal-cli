import { Crud, Question } from "./Crud";
import Profile from "./Profile";
const { prompt } = require('enquirer');
import lodash from "lodash";

export class LocationCrud extends Crud {
  static titleQuestion = {
    type: 'input',
    name: 'title',
    message: 'Name des Ortes?',
  };

  static cityQuestion = {
    type: 'input',
    name: 'city',
    message: 'In welcher Stadt liegt der Ort?',
  };

  static subQuestion = {
    type: 'select',
    name: 'sub',
    message: 'In welchem Bundesland?',
    choices: [
      { name: 'Germany_Baden_Wurttemberg', message: 'Baden-Württemberg' },
      { name: 'Germany_Bayern', message: 'Bayern' },
      { name: 'Germany_Berlin', message: 'Berlin' },
      { name: 'Germany_Brandenburg', message: 'Brandenburg' },
      { name: 'Germany_Bremen', message: 'Bremen' },
      { name: 'Germany_Hamburg', message: 'Hamburg' },
      { name: 'Germany_Hessen', message: 'Hessen' },
      { name: 'Germany_Mecklenburg_Vorpommern', message: 'Mecklenburg-Vorpommern' },
      { name: 'Germany_Niedersachsen', message: 'Niedersachsen' },
      { name: 'Germany_Nordrhein_Westfalen', message: 'Nordrhein-Westfalen' },
      { name: 'Germany_Rheinland_Pfalz', message: 'Rheinland-Pfalz' },
      { name: 'Germany_Saarland', message: 'Saarland' },
      { name: 'Germany_Sachsen', message: 'Sachsen' },
      { name: 'Germany_Sachsen_Anhalt', message: 'Sachsen-Anhalt' },
      { name: 'Germany_Schleswig_Holstein', message: 'Schleswig-Holstein' },
      { name: 'Germany_Thuringen', message: 'Thüringen' },
      { name: 'Germany_Unknown', message: 'Unbekannt' },
    ],
  };

  static questions: Array<Question> = [LocationCrud.titleQuestion, LocationCrud.cityQuestion, LocationCrud.subQuestion];

  constructor(profile: Profile) {
    super(profile, "Orte");
  }

  async printList(): Promise<void> {
    for (let location of this.profile.locations.values()) {
      console.log(location.id + ": " + location.title);
    }
  }

  async performEdit(id: string): Promise<void> {
    let location = this.profile.locations.get(id);
    this.initAnswers(LocationCrud.questions, location as any);

    let answers = lodash.pick(location, ["title", "city", "sub"]);
    console.log("Before prompt performEdit");
    const response = await prompt(LocationCrud.questions, answers);
    console.log("After prompt performEdit");
    Object.assign(location, response);
  }

  async performDelete(id: string): Promise<void> {
    this.profile.locations.delete(id);
  }

  async performAdd(): Promise<string> {
    console.log("Ein Ort kann z.B. eine bestimmte Wohnung, ein Geschäft, ein Park, etc. sein.");
    this.initAnswers(LocationCrud.questions, {} as any);
    const response = await prompt(LocationCrud.questions);

    let location = {
      id: this.createId(response.title, Array.from(this.profile.activities.keys())),
      title: response.title,
      city: response.city,
      top: "Germany",
      sub: response.sub
    };

    this.profile.addLocation(location);

    return location.id;
  }

  getEntityChoices(): Array<{ name: string, message: string }> {
    return this.profile.getLocationChoices();
  }
}