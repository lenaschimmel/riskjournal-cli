const { prompt } = require('enquirer');
const datePrompt = require('date-prompt');
import moment from 'moment';
import lodash from "lodash";
import Table from 'cli-table3';
import dateAndTime, { addDays } from 'date-and-time';

import { PlainCohabitation } from '../PlainData';
import { dateWithoutTime } from '../Helpers';

import { Crud, Question } from "./Crud";
import ProfileMenu from "./ProfileMenu";
import { DATE_FORMAT_LOCAL } from '../constants';

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
      head: ['Person', 'Von', 'Bis', 'Zusammen schlafen', 'Tägl. Risiko']
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
    let beginString = dateAndTime.format(dateWithoutTime(cohabitation.begin), DATE_FORMAT_LOCAL);
    let endString   = dateAndTime.format(dateWithoutTime(cohabitation.end  ), DATE_FORMAT_LOCAL);

    let minRisk = 100000;
    let maxRisk = 0;
    let date = dateWithoutTime(cohabitation.begin);
    while (date <= cohabitation.end) {
      let risk = this.profile.computeCohabitationRisk(cohabitation, 1.0/7.0, date);
      
      if (risk != null) {
        if (risk > maxRisk) {
           maxRisk = risk;
        } 
        if (risk < minRisk) {
          minRisk = risk;
        }
      }
      date = addDays(date, 1);
    }

    if (minRisk < maxRisk * 0.9) {
      riskString = Math.floor(minRisk) + " bis " + Math.floor(maxRisk) + " µCoV"; 
    } else {
      riskString = "ca. " +  Math.floor((minRisk + maxRisk) / 2) + " µCoV"; 
    }

    return [personString, beginString, endString, sleepString, riskString];
  }

  async performEdit(id: string): Promise<void> {
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
    Object.assign(cohabitation, response);
    cohabitation.begin = new Date(beginDate);
    cohabitation.end = new Date(endDate);
  }

  async performDelete(id: string): Promise<void> {
    this.profile.cohabitations.delete(id);
  }

  createCohabitationId(newCohabitation: PlainCohabitation): string {
    return this.createId(this.profile.persons.get(newCohabitation.knownPersonId)?.name + "-" + dateAndTime.format(dateWithoutTime(newCohabitation.begin), DATE_FORMAT_LOCAL),  Array.from(this.profile.cohabitations.keys()))
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