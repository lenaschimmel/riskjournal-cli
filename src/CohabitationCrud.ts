import { Interaction } from "./data/data";
import { Crud, Question } from "./Crud";
const { prompt } = require('enquirer');
const datePrompt = require('date-prompt')
import { Profile } from "./Profile";
import ProfileMenu from "./ProfileMenu";
import moment from 'moment';
import Table from 'cli-table3';
import dateAndTime from 'date-and-time';
import { PlainCohabitation } from './PlainData';
import lodash from "lodash";
import { dateWithoutTime } from './Helpers';

export class CohabitationCrud extends Crud {
  static knownPersonIdQuestion: Question = {
    type: 'select',
    name: 'knownPersonId',
    message: 'Bekannte Person?',
    hint: 'Mit wem hast du in dem Zeitraum zusammen gelebt?',
    choices: [ ],
  };

  static sleepingTogetherQuestion: Question = {
    type: 'confirm',
    name: 'sleepingTogether',
    message: 'Zusammen übernachtet?',
    hint: 'Schlaft ihr im selben Bett?'
  };

  static questions: Array<Question> = [
    CohabitationCrud.knownPersonIdQuestion, 
    CohabitationCrud.sleepingTogetherQuestion, 
  ];

  constructor(profileMenu: ProfileMenu) {
    super(profileMenu, "Zusammenleben");
  }

  async printList(): Promise<void> {
    // instantiate
    let table = new Table({
      head: ['Person', 'Von', 'Bis', 'Zusammen schlafen', 'Risiko']
    });

    const cohabitationArray = Array.from(this.profile.cohabitations.values());

    cohabitationArray.sort((a, b) => a.begin.getTime() - b.begin.getTime());

    for (let cohabitation of cohabitationArray) {
      table.push(this.getTableRowForCohabitation(cohabitation));
    }

    console.log(table.toString());
  }

  getTableRowForCohabitation(cohabitation: PlainCohabitation): Array<string> {
    let person = this.profile.persons.get(cohabitation.knownPersonId)!;
    let personString = person.name;
    let riskString = "unbekannt";
    let sleepString = cohabitation.sleepingTogether ? "ja" : "nein";
    let beginString = dateAndTime.format(dateWithoutTime(cohabitation.begin), "DD-MM-YY");
    let endString   = dateAndTime.format(dateWithoutTime(cohabitation.end  ), "DD-MM-YY");

    // let risk = this.profile.computeCohabitationRisk(cohabitation);
    // if (risk != null) {
    //   if (risk > 5) {
    //     riskString = Math.floor(risk) + " µCoV"
    //   } else {
    //     riskString = (Math.floor(risk * 100) / 100) + " µCoV"
    //   }
    // }

    return [personString, beginString, endString, sleepString, riskString];
  }

  async performEdit(id: string): Promise<void> {
    console.log("Begin performEdit");
    let cohabitation = this.profile.cohabitations.get(id);
    if(!cohabitation) {
      return;
    }
    this.initAnswers(CohabitationCrud.questions, cohabitation as any);
    CohabitationCrud.knownPersonIdQuestion.choices = [...this.profile.getPersonChoices()];
    
    let answers = lodash.pick(cohabitation, ["knownPersonId", "sleepingTogether"]);
    console.log("Before prompt performEdit");
    const response = await prompt(CohabitationCrud.questions, answers);
    const beginDate = await datePrompt('Anfangsdatum?', { value: moment(cohabitation.begin)} );
    const endDate = await datePrompt('Enddatum?', { value: moment(cohabitation.end)} );
    console.log("After prompt performEdit");
    Object.assign(cohabitation, response);
    cohabitation.begin = new Date(beginDate);
    cohabitation.end = new Date(endDate);
  }

  async performDelete(id: string): Promise<void> {
    this.profile.cohabitations.delete(id);
  }

  createCohabitationId(newCohabitation: PlainCohabitation): string {
    return this.createId(this.profile.persons.get(newCohabitation.knownPersonId)?.name + "-" + dateAndTime.format(dateWithoutTime(newCohabitation.begin), "DD-MM-YY"),  Array.from(this.profile.cohabitations.keys()))
  }

  async performDuplicate(id: string): Promise<void> {
    let existingCohabitation = this.profile.cohabitations.get(id)!;
    let temporatyId = existingCohabitation.id + "_temporary_copy";
    let newCohabitation = {
      ...existingCohabitation,
      id: temporatyId,
    };
    
    // Uff, this is very hacky, I don't like it:
    this.profile.addCohabitation(newCohabitation);
    await this.performEdit(temporatyId);
    this.profile.cohabitations.delete(temporatyId);
    newCohabitation.id = this.createCohabitationId(newCohabitation);
    this.profile.addCohabitation(newCohabitation);
  }

  async performAdd(): Promise<string> {
    console.log("Neue Aktivität eintragen:");
    this.initAnswers(CohabitationCrud.questions, {} as any);
    CohabitationCrud.knownPersonIdQuestion.choices = [...this.profile.getPersonChoices()];
    
    const response = await prompt(CohabitationCrud.questions);
    const beginDate = await datePrompt('Anfangszeit?'); // { value: Profile.dateWithoutTime(new Date()) });
    const endDate = await datePrompt('Endzeit?', { value: moment(beginDate)} );

    let cohabitation = {
      id:                       "",
      begin:                    new Date(beginDate),
      end:                      new Date(endDate),
      knownPersonId:            response.knownPersonId,
      sleepingTogether:         response.sleepingTogether,
    };
    cohabitation.id = this.createCohabitationId(cohabitation),

    this.profile.addCohabitation(cohabitation);

    return cohabitation.id;
  }

  getEntityChoices(): Array<{ name: string, message: string }> {
    return this.profile.getCohabitationChoices();
  }
}