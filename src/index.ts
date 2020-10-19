import 'reflect-metadata';
import Profile from './Profile';
const { prompt } = require('enquirer');
import { CalculatorData, calculate } from './data/calculate';
import fs from 'fs';

var profile: Profile | null = null;

async function main() {

  let response = await prompt({
    type: 'select',
    name: 'username',
    message: 'Bitte Profilnamen auswählen:',
    choices: [... Profile.getProfileChoices(), {name:"<new>", message: "<Neu anlegen>"}],
  });
  
  if (response.username == "<new>") {
    response = await prompt({
      type: 'input',
      name: 'username',
      message: 'Bitte neuen Profilnamen eingeben:',
    });
    fs.mkdirSync("./data/" + response.username);
  }
  profile = new Profile(response.username);

  await profile.showMenu();
}


main();