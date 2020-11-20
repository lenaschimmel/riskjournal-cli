const { prompt } = require('enquirer');
import lodash from "lodash";

import { Crud, Question } from "./Crud";
import ProfileMenu from "./ProfileMenu";

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

  static districtQuestion = {
    type: 'autocomplete',
    name: 'idLandkreis',
    message: 'In welchem Landkreis?',
    choices: [{ message: "<Landkreise noch nicht geladen>", name: "<none>" }]
  };

  static questions: Array<Question> = [LocationCrud.titleQuestion, LocationCrud.cityQuestion, LocationCrud.districtQuestion];

  constructor(profileMenu: ProfileMenu) {
    super(profileMenu, "Orte");
  }

  async printList(): Promise<void> {
    for (let location of this.profile.locations.values()) {
      console.log(location.id + ": " + location.title);
    }
  }

  async performEdit(id: string): Promise<void> {
    let location = this.profile.locations.get(id);
    this.initAnswers(LocationCrud.questions, location as any);
    LocationCrud.districtQuestion.choices = this.profile.getDistrictChoices();
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
    LocationCrud.districtQuestion.choices = this.profile.getDistrictChoices();
    const response = await prompt(LocationCrud.questions);

    let location = {
      id: this.createId(response.title, Array.from(this.profile.activities.keys())),
      idLandkreis: response.idLandkreis,
      title: response.title,
      city: response.city,
    };

    this.profile.addLocation(location);

    return location.id;
  }

  async performDuplicate(id: string): Promise<void> {
    console.log("Noch nicht fertig.");
  }

  getEntityChoices(): Array<{ name: string, message: string }> {
    return this.profile.getLocationChoices();
  }
}