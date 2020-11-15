import 'reflect-metadata';
import Profile from './Profile';
const { prompt } = require('enquirer');
import { CalculatorData, calculate } from './data/calculate';
import fs from 'fs';
import https from 'https';
import http from 'http';
var targz = require('targz');
import { BASE_URL} from './constants';

var profile: Profile | null = null;

async function main() {
  console.log("Lade aktuelle Inzidenz-Werte herunter…");
  await downloadIncidence();
  console.log("…Inzidenz-Werte fertig.");
  let timer = setInterval(downloadIncidence, 3600 * 1000); // 1 hour

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
  await profile.run();
  clearInterval(timer);
}

async function downloadIncidence() {
  const filePath = "data/incidence/download.tar.gz";
  const dirPath = "data/incidence/";
  http.get(BASE_URL + "incidence", res => {
    let body = "";
    let stream = fs.createWriteStream(filePath);
    res.on("error", error => {
      console.log("Download error: " + error);
    });
    res.on("data", data => {
      stream.write(data);
    });
    res.on("end", () => {
      stream.close();
      targz.decompress({
        src: filePath,
        dest: dirPath
      }, function(err: Error){
        if(err) {
            console.log(err);
        } else {
            console.log("Download and extraction done!");
        }
      });
    });
  });
}

main();