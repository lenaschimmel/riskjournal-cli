import { Setting, Interaction, Distance, TheirMask, YourMask, Voice, RiskProfile } from "./data/data";
import { Crud, Question } from "./Crud";
const { prompt } = require('enquirer');
const datePrompt = require('date-prompt')
import Profile from "./Profile";
import moment from 'moment';
import Table from 'cli-table3';
import dateAndTime from 'date-and-time';
import { PlainActivity, PlainLocation, PlainPerson } from './PlainData';
import lodash from "lodash";

export class ActivityCrud extends Crud {
  static tileQuestion: Question = {
    type: 'input',
    name: 'title',
    message: 'Bezeichnung?',
    hint: 'Eine sehr kurze Beschreibung der Aktivität, die zusammen mit dem Datum eindeutig sein sollte.',
  };

  static locationIdQuestion: Question = {
    type: 'select',
    name: 'locationId',
    message: 'Wo findet die Aktivität statt?',
    hint: 'Wähle einen Eintrag aus der Liste oder lege einen neuen an. Ob es ein Innenraum ist oder nicht, kannst du gleich unabhängig auswählen.',
    choices: [],
  };

  static settingQuestion: Question = {
    type: 'select',
    name: 'setting',
    message: 'Belüftung?',
    hint: 'Findet die Aktität innen oder außen statt?',
    choices: [ ],
  };

  static distanceQuestion: Question = {
    type: 'select',
    name: 'distance',
    message: 'Dein Abstand?',
    hint: 'Wie viel Abstand hast du etwa von den anderen Personen?',
    initial: "normal",
    choices: [ ],
  };

  static yourMaskQuestion: Question = {
    type: 'select',
    name: 'yourMask',
    message: 'Deine Maske?',
    hint: 'Welche Art von Maske trägst du während der Aktivität?',
    choices: [ ],
  };

  static theirMaskQuestion: Question = {
    type: 'select',
    name: 'theirMask',
    message: 'Deren Maske?',
    hint: 'Welche Art von Maske tragen die anderen während der Aktivität?',
    choices: [ ],
  };

  static voiceQuestion: Question = {
    type: 'select',
    name: 'voice',
    message: 'Stimme?',
    hint: 'Wie laut verhalten sich die Anwesenden (in erste Linie die anderen) in etwa?',
    choices: [ ],
  };

  static knownPersonIdsQuestion: Question = {
    type: 'multiselect',
    name: 'knownPersonIds',
    message: 'Bekannte Personen?',
    hint: 'Welche dir bekannten Personen sind mit dabei?',
    choices: [ ],
  };

  static knownPersonNewQuestion: Question = {
    type: 'confirm',
    name: 'knownPersonNew',
    message: 'Neue Personen?',
    hint: 'Möchtest du jetzt Einträge für weitere Personen anlegen, die auch dabei sind? Du kannst außerdem auch eine Anzahl unbekannter Personen angeben.',
  };

  static unknownPersonCountQuestion: Question = {
    type: 'numeral',
    name: 'unknownPersonCount',
    message: 'Unbekannte Personen?',
    hint: 'Wie viele Personen sind mit dabei, die du nicht kennst, oder für die du hier keinen eigenen Eintrag hast?',
    choices: [ ],
  };

  static unknownPersonRiskProfileQuestion: Question = {
    type: 'select',
    name: 'unknownPersonRiskProfile',
    message: 'Risikoprofil für unbekannte Personen?',
    hint: 'Wie schätzt du das durchschnittliche Risikoprofil der Personen ein, die du nicht einzeln eingetragen hast?',
    choices: [ ],
  };

  static questionsBeforeDate: Array<Question> = [
    ActivityCrud.tileQuestion, 
    ActivityCrud.locationIdQuestion, 
  ];

  static questionsAfterDate: Array<Question> = [
    ActivityCrud.settingQuestion, 
    ActivityCrud.distanceQuestion, 
    ActivityCrud.yourMaskQuestion, 
    ActivityCrud.theirMaskQuestion, 
    ActivityCrud.voiceQuestion, 
    ActivityCrud.knownPersonIdsQuestion,
    ActivityCrud.knownPersonNewQuestion,
    ActivityCrud.unknownPersonCountQuestion, 
    ActivityCrud.unknownPersonRiskProfileQuestion
  ];

  constructor(profile: Profile) {
    super(profile, "Aktivitäten");
    
    ActivityCrud.unknownPersonRiskProfileQuestion.choices = this.getChoices(RiskProfile);
    ActivityCrud.settingQuestion.choices   = this.getChoices(Setting);
    ActivityCrud.distanceQuestion.choices  = this.getChoices(Distance);
    ActivityCrud.yourMaskQuestion.choices  = this.getChoices(YourMask);
    ActivityCrud.theirMaskQuestion.choices = this.getChoices(TheirMask);
    ActivityCrud.voiceQuestion.choices     = this.getChoices(Voice);
  }

  async printList(): Promise<void> {
    // instantiate
    let table = new Table({
      head: ['Aktivität', 'Ort', 'Personen', 'Risiko', 'Dauer']
    });

    const activityArray = Array.from(this.profile.activities.values());

    // gather all dates for which we have activities
    let datesWithoutTime = activityArray.map(activity => Profile.dateWithoutTime(activity.begin));
    // sort and remove duplicates, from https://stackoverflow.com/a/9229821/39946
    datesWithoutTime.sort().filter(function (item, pos, ary) {
      return !pos || item != ary[pos - 1];
    });

    for (let dateWithoutTime of datesWithoutTime) {
      let activitiesOfTheDay = activityArray.filter(activity => { 
        let diff = Profile.dateWithoutTime(activity.begin).getTime() - dateWithoutTime.getTime();
        return Math.abs(diff) < 3600 * 1000 * 6;
      });
      activitiesOfTheDay.sort((a, b) => a.begin.getTime() - b.begin.getTime());

      table.push([{ colSpan: 5, content: dateAndTime.format(dateWithoutTime, 'dddd, DD MMMM YYYY') }]);

      for (let activity of activitiesOfTheDay) {
        table.push(this.getTableRowForActivity(activity));
      }
    }

    console.log(table.toString());
  }


  getTableRowForActivity(activity: PlainActivity): Array<string> {
    let locationString = "unbekannt";
    let location = this.profile.locations.get(activity.locationId);
    if (location) {
      locationString = location.title;
    }

    let participantsString = activity.knownPersonIds.map(personId => this.profile.persons.get(personId)?.name).join(",");
    if (activity.unknownPersonCount > 0) {
      participantsString += " und " + activity.unknownPersonCount + " weitere"
    }
    let riskString = "unbekannt";

    // if (!this.risk) {
    //   this.calculateRisk();
    // }

    // if (this.risk) {
    //   riskString = sprintf("%i µCoV", this.risk);
    // }

    let durationString = Profile.timeSpanString(activity.begin, activity.end);
    return [activity.title, locationString, participantsString, riskString, durationString];
  }

  async performEdit(id: string): Promise<void> {
    console.log("Begin performEdit");
    ActivityCrud.locationIdQuestion.choices = [...this.profile.getLocationChoices(), { message: "<Neuer Ort>", name: "<new>" }];
    let activity = this.profile.activities.get(id);
    if(!activity) {
      return;
    }
    this.initAnswers(ActivityCrud.questionsBeforeDate, activity as any);
    this.initAnswers(ActivityCrud.questionsAfterDate, activity as any);
    ActivityCrud.knownPersonIdsQuestion.choices = [...this.profile.getPersonChoices()];
    ActivityCrud.locationIdQuestion.choices = [...this.profile.getLocationChoices(), { message: "<Neuer Ort>", name: "<new>" }];
    
    let answers = lodash.pick(activity, ["name", "fullName", "loctionId", "riskProfile"]);
    console.log("Before prompt performEdit");
    const responseBeforeDate = await prompt(ActivityCrud.questionsBeforeDate, answers);
    const beginDate = await datePrompt('Anfangszeit?', { value: moment(activity.begin)} );
    const endDate = await datePrompt('Endzeit?', { value: moment(activity.end)} );
    const responseAfterDate = await prompt(ActivityCrud.questionsAfterDate, answers);
    console.log("After prompt performEdit");
    if (responseBeforeDate.locationId == "<new>") {
      responseBeforeDate.locationId = await this.profile.locationCrud?.performAdd();
    }
    if (responseAfterDate.knownPersonNew) {
      // response.locationId = await this.profile.locationCrud?.performAdd();
      // TODO ask in a loop for new persons
      console.log("Sorry, das Hinzufügen neuer Personen ist noch nicht fertig. Bitte füge sie später ein.");
    }
    Object.assign(activity, responseBeforeDate);
    Object.assign(activity, responseAfterDate);
    activity.begin = new Date(beginDate);
    activity.end = new Date(endDate);
  }

  async performDelete(id: string): Promise<void> {
    this.profile.activities.delete(id);
  }

  createActivityId(newActivity: PlainActivity): string {
    return this.createId(newActivity.title + "-" + dateAndTime.format(Profile.dateWithoutTime(newActivity.begin), "DD-MM-YY"),  Array.from(this.profile.activities.keys()))
  }

  async performDuplicate(id: string): Promise<void> {
    let existingActivity = this.profile.activities.get(id)!;
    let temporatyId = existingActivity.id + "_temporary_copy";
    let newActivity = {
      ...existingActivity,
      id: temporatyId,
    };
    
    // Uff, this is very hacky, I don't like it:
    this.profile.addActivity(newActivity);
    await this.performEdit(temporatyId);
    this.profile.activities.delete(temporatyId);
    newActivity.id = this.createActivityId(newActivity);
    this.profile.addActivity(newActivity);
  }

  async performAdd(): Promise<string> {
    console.log("Neue Aktivität eintragen:");
    this.initAnswers(ActivityCrud.questionsBeforeDate, {} as any);
    this.initAnswers(ActivityCrud.questionsAfterDate, {} as any);
    ActivityCrud.knownPersonIdsQuestion.choices = [...this.profile.getPersonChoices()];
    ActivityCrud.locationIdQuestion.choices = [...this.profile.getLocationChoices(), { message: "<Neuer Ort>", name: "<new>" }];
    
    const responseBeforeDate = await prompt(ActivityCrud.questionsBeforeDate);
    const beginDate = await datePrompt('Anfangszeit?'); // { value: Profile.dateWithoutTime(new Date()) });
    const endDate = await datePrompt('Endzeit?', { value: moment(beginDate)} );
    const responseAfterDate = await prompt(ActivityCrud.questionsAfterDate);

    if (responseBeforeDate.locationId == "<new>") {
      responseBeforeDate.locationId = await this.profile.locationCrud?.performAdd();
    }

    if (responseAfterDate.knownPersonNew) {
      // response.locationId = await this.profile.locationCrud?.performAdd();
      // TODO ask in a loop for new persons
      console.log("Sorry, das Hinzufügen neuer Personen ist noch nicht fertig. Bitte füge sie später ein.");
    }

    let activity = {
      id:                       "",
      title:                    responseBeforeDate.title,
      locationId:               responseBeforeDate.locationId,
      begin:                    new Date(beginDate),
      end:                      new Date(endDate),
      setting:                  responseAfterDate.setting,
      distance:                 responseAfterDate.distance,
      yourMask:                 responseAfterDate.yourMask,
      theirMask:                responseAfterDate.theirMask,
      voice:                    responseAfterDate.voice,
      unknownPersonCount:       responseAfterDate.unknownPersonCount,
      unknownPersonRiskProfile: responseAfterDate.unknownPersonRiskProfile,
      knownPersonIds:           responseAfterDate.knownPersonIds,
    };
    activity.id = this.createActivityId(activity),

    this.profile.addActivity(activity);

    return activity.id;
  }

  getEntityChoices(): Array<{ name: string, message: string }> {
    return this.profile.getActivityChoices();
  }
}