import { Crud, Question } from "./Crud";
import Profile from "./Profile";
import { RiskProfile } from "./data/data";
const { prompt } = require('enquirer');
import lodash from "lodash";

export class PersonCrud extends Crud {
  static nameQuestion = {
    type: 'input',
    name: 'name',
    message: 'Alltagsname?',
    hint: 'Name, mit dem du im Alltag über diese Person sprichst.'
  };
  static fullNameQuestion = {
    type: 'input',
    name: 'fullName',
    message: 'Voller Name?',
    hint: 'Name, den du z.B dem Gesundheitsamt mitteilen würdest.',
    initial: '<Gleicher Wert wie Alltagsname>'
  };
  static locationQuestion = {
    type: 'select',
    name: 'locationId',
    message: 'Gewöhnlicher Aufenthaltsort?',
    choices: [{ message: "<Neuer Ort>", name: "<new>" }]
  };
  static riskProfileQuestion: Question = {
    type: 'select',
    name: 'riskProfile',
    message: 'Risikoprofil?',
    choices: [ ]
  };
  static questions: Array<Question> = [PersonCrud.nameQuestion, PersonCrud.fullNameQuestion, PersonCrud.locationQuestion, PersonCrud.riskProfileQuestion];

  constructor(profile: Profile) {
    super(profile, "Personen");

    if (PersonCrud.riskProfileQuestion.choices?.length == 0) {  
      for (const key in RiskProfile) {
        if (Object.prototype.hasOwnProperty.call(RiskProfile, key)) {
          const element = RiskProfile[key];
          PersonCrud.riskProfileQuestion.choices?.push( {
            message: key, // translate
            name: key,
            hint: element.label // translate
          } );
        }
      }
    }
  }

  async printList(): Promise<void> {
    for (let person of this.profile.persons.values()) {
      console.log(person.id + ": " + person.name);
    }
  }

  async performEdit(id: string): Promise<void> {
    console.log("Begin performEdit");
    PersonCrud.locationQuestion.choices = [...this.profile.getLocationChoices(), { message: "<Neuer Ort>", name: "<new>" }];
    let person = this.profile.persons.get(id);
    this.initAnswers(PersonCrud.questions, person as any);

    let answers = lodash.pick(person, ["name", "fullName", "loctionId", "riskProfile"]);
    console.log("Before prompt performEdit");
    const response = await prompt(PersonCrud.questions, answers);
    console.log("After prompt performEdit");
    if (response.locationId == "<new>") {
      response.locationId = await this.profile.locationCrud?.performAdd();
    }
    Object.assign(person, response);
  }

  async performDelete(id: string): Promise<void> {
    this.profile.persons.delete(id);
  }

  async performAdd(): Promise<string> {
    console.log("Neue Person anlegen:");
    PersonCrud.locationQuestion.choices = [...this.profile.getLocationChoices(), { message: "<Neuer Ort>", name: "<new>" }];
    this.initAnswers(PersonCrud.questions, {} as any);
    const response = await prompt(PersonCrud.questions);

    if (response.fullName == '<Gleicher Wert wie Alltagsname>') {
      response.fullName = response.name;
    }

    if (response.locationId == "<new>") {
      response.locationId = await this.profile.locationCrud?.performAdd();
    }

    let person = {
      id: this.createId(response.name, Array.from(this.profile.persons.keys())),
      name: response.name,
      fullName: response.fullName,
      riskProfile: response.riskProfile,
      locationId: response.locationId,
      timedRisk: new Map(),
      profileName: "",
    };

    this.profile.addPerson(person);

    return person.id;
  }

  async performDuplicate(id: string): Promise<void> {
    console.log("Noch nicht fertig.");
  }

  getEntityChoices(): Array<{ name: string, message: string }> {
    return this.profile.getPersonChoices();
  }
}