const { prompt } = require('enquirer');
import Table from 'cli-table3';
import dateAndTime from 'date-and-time';

import { Profile, AnalysisDay } from "../Profile";

import { ActivityCrud } from './ActivityCrud';
import { PersonCrud } from './PersonCrud';
import { LocationCrud } from './LocationCrud';
import { CohabitationCrud } from './CohabitationCrud';

export default class ProfileMenu {
  profile: Profile;
  activityCrud: ActivityCrud | undefined;
  locationCrud: LocationCrud | undefined;
  personCrud: PersonCrud | undefined;
  cohabitationCrud: CohabitationCrud | undefined;

  constructor(name: string) {
    this.profile = new Profile(name);
  }

  async run() {
    let timer = setInterval(() => { this.profile.cryptopNetwork.downloadExternalRisk(); }, 3600 * 1000); // 1 hour
    this.profile.cryptopNetwork.downloadExternalRisk();
    await this.showMenu();
    clearInterval(timer);
  }

  async showMenu() {
    this.activityCrud = new ActivityCrud(this);
    this.locationCrud = new LocationCrud(this);
    this.personCrud = new PersonCrud(this);
    this.cohabitationCrud = new CohabitationCrud(this);

    while (true) {
      const response = await prompt({
        type: 'select',
        name: 'action',
        message: 'Was möchtest du tun?',
        choices: ["Gesamtrikiso anzeigen", "Aktivitäten…", "Orte…", "Personen…", "Zusammenleben…", "Fremdes Risiko anzeigen…", "Speichern und Exportieren", "Speichern, Exportieren und Beenden"]
      });

      switch (response.action) {
        case "Gesamtrikiso anzeigen":
          let analysis = await this.profile.computeRiskAnalysis();
          await this.showRiskAnalysis(analysis);
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
        case "Fremdes Risiko anzeigen…":
          await this.showExternalRiskAnalysis();
          break;
        case "Speichern und Exportieren":
          this.profile.save();
          await this.profile.cryptopNetwork.export();
          console.log("Profil wurde gepspeichert.");
          break;
        case "Speichern, Exportieren und Beenden":
          this.profile.save();
          await this.profile.cryptopNetwork.export();
          console.log("Profil wurde gepspeichert. Tschüss!");
          return;
      }
    }
  }

  async showExternalRiskAnalysis() {
    let ids = this.profile.getLinkedPersonChoices();
    if (ids.length == 0) {
      console.log("Keine Personen vorhanden.");
      return;
    }

    const response = await prompt({
      type: 'select',
      name: 'id',
      message: "Wähle aus, von welcher Person die Daten gelesen werden sollen.",
      choices: ["<Abbrechen>", ...ids]
    });

    if (response.id != "<Abbrechen>") {
      let person = this.profile.persons.get(response.id)!;
      let analysis = this.profile.cryptopNetwork.loadRiskAnalysisEnc(person);
      await this.showRiskAnalysis(analysis!);
    }
  }

  async showRiskAnalysis(analysis: Array<AnalysisDay>) {
    // let analysis = await this.computeRiskAnalysis();
    let table = new Table({
      head: ['Datum', 'Risiko neu', 'Infektiosität', 'Fehler']
    });

    for (let offset = 28; offset >= 0; offset--) {
      let data = analysis[offset];
      table.push([
        dateAndTime.format(data.date, 'dd, DD MMMM:'),
        { content: Math.floor(data.incomingRisk), hAlign: 'right' },
        { content: Math.floor(data.outgoingRisk), hAlign: 'right' },
        data.hasError ? "!" : ""
      ]);
    }

    console.log(table.toString());
  }
}