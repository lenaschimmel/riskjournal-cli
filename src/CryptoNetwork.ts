import crypto from "crypto";
import http from 'http';
import { BASE_URL, HOST, PORT } from './constants';
import { Profile, AnalysisDay } from './Profile';
import { PlainPerson } from './PlainData';
import { addDays } from './Helpers';
import fs from 'fs';
import dateAndTime from 'date-and-time';

export default class CryptoNetwork {
  profile: Profile;

  privateKey: string | undefined;
  publicKey: string | undefined;

  constructor(profile: Profile) {
    this.profile = profile;
    this.initKeys();
  }

  async exportRiskAnalysisEnc(analysis: Array<AnalysisDay>, recipient: PlainPerson) {
    let daysCount = 29;
    let unencrypedData = Buffer.alloc(9 + daysCount * 2);

    unencrypedData.writeInt8('M'.charCodeAt(0), 0);
    unencrypedData.writeInt8('C'.charCodeAt(0), 1);
    unencrypedData.writeInt8('A'.charCodeAt(0), 2);
    unencrypedData.writeInt8(1, 3); // File format version
    unencrypedData.writeUInt32LE(analysis[daysCount - 1].date.getTime() / 1000, 4);
    unencrypedData.writeInt8(daysCount, 8);

    for (let offset = daysCount - 1; offset >= 0; offset--) {
      let data = analysis[offset];
      unencrypedData.writeUInt16LE(data.outgoingRisk, 9 + 2 * (daysCount - 1 - offset));
    }

    this.profile.saveBuffer("export", unencrypedData, "unenc");

    const encryptedData = crypto.publicEncrypt(
      {
        key: recipient.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      // We convert the data string to a buffer using `Buffer.from`
      unencrypedData
    )

    this.profile.saveBuffer("export_for_" + recipient.profileName.toLowerCase(), encryptedData, "enc");
    // const signature = crypto.sign("sha256", encryptedData, {
    //   key: this.privateKey!,
    //   padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    // })

    const signedData = crypto.privateEncrypt(
      {
        key: this.privateKey!,
        padding: crypto.constants.RSA_NO_PADDING
      },
      encryptedData
    );

    this.profile.saveBuffer("export_for_" + recipient.profileName.toLowerCase(), signedData, "sign");

    let messageId = this.computeMessageId(this.publicKey!, recipient.publicKey);

    await this.postToServer(messageId, signedData);
  }

  computeMessageId(senderKey: string, recipientKey: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(senderKey);
    hash.update(recipientKey);
    let messageId = hash.digest('hex');
    return messageId;
  }



  async postToServer(messageId: String, data: Buffer) {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/' + messageId,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length
      }
    }

    const req = http.request(options, res => {
      console.log(`statusCode: ${res.statusCode}`)
    })

    req.on('error', error => {
      console.error(error)
    })

    req.write(data)
    req.end()
  }

  loadRiskAnalysisEnc(sender: PlainPerson): Array<AnalysisDay> | null {
    try {
      let analysis: Array<AnalysisDay> = [];
      fs.mkdirSync("data/" + this.profile.name + "/imports/", { recursive: true});
      let filePath = "data/" + this.profile.name + "/imports/" + sender.profileName + ".risk";
      let signedData = fs.readFileSync(filePath);
      let encryptedData = crypto.publicDecrypt(
        {
          key: sender.publicKey,
          padding: crypto.constants.RSA_NO_PADDING
        },
        signedData);

      this.profile.saveBuffer("from_signed", encryptedData, "enc");

      let decryptedData = crypto.privateDecrypt(
        {
          key: this.privateKey!,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        encryptedData);

      if (decryptedData.readInt8(0) != 'M'.charCodeAt(0) ||
        decryptedData.readInt8(1) != 'C'.charCodeAt(0) ||
        decryptedData.readInt8(2) != 'A'.charCodeAt(0)) {
        throw new Error("Magic bytes at the beginning are wrong.");
      }
      let version = decryptedData.readInt8(3);
      if (version != 1) {
        throw new Error("Can only read version 1, but version is " + version);
      }
      let firstDate = new Date(decryptedData.readUInt32LE(4) * 1000);
      let daysCount = decryptedData.readInt8(8);

      console.log("Habe Daten gelesen, erstes Datum ist: " + firstDate.toDateString());

      for (let offset = daysCount - 1; offset >= 0; offset--) {
        let risk = decryptedData.readUInt16LE(9 + 2 * (daysCount - 1 - offset));
        analysis[offset] = {
          date: addDays(firstDate, daysCount - 1 - offset),
          incomingRisk: 0,
          outgoingRisk: risk,
          hasError: false
        }
      }
      return analysis;
    } catch (e) {
      console.log("Fehler beim Lesen: " + e);
    }
    return null;
  }

  initKeys() {
    try {
      this.privateKey = fs.readFileSync(this.profile.filename("private", "key"), { encoding: "utf8" });
      this.publicKey = fs.readFileSync(this.profile.filename("public", "key"), { encoding: "utf8" });
    } catch (e) {
      console.log("Konnte Schlüsselpaar nicht lesen, erzeuge neues…");
      const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        // The standard secure default length for RSA keys is 2048 bits
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        }
      })
      this.privateKey = privateKey;
      this.publicKey = publicKey;
      fs.writeFileSync(this.profile.filename("private", "key"), this.privateKey, { encoding: "utf8" });
      fs.writeFileSync(this.profile.filename("public", "key"), this.publicKey, { encoding: "utf8" });
      console.log("Neues Schlüsselpaar wurde erzeugt und geschrieben.");
    }
  }

  downloadExternalRisk() {
    for (const person of this.profile.persons.values()) {
      if (person.publicKey && person.publicKey.length > 1) {
        try {
          console.log("Now updating external risk for " + person.profileName);
          fs.mkdirSync("data/" + this.profile.name + "/imports/", { recursive: true});
          const filePath = "data/" + this.profile.name + "/imports/" + person.profileName + ".risk";
          let messageId = this.computeMessageId(person.publicKey, this.publicKey!);

          var options = {
            host: HOST,
            port: PORT,
            path: '/' + messageId,
            method: 'GET'
          };
          
          let req = http.request(options, res => {
            if (res.statusCode == 200) {
              let body = "";
              let stream = fs.createWriteStream(filePath);
              res.on("error", error => {
                console.log("Inner handler got error in downloadExternalRisk: " + error);
              });
              res.on("data", data => {
                stream.write(data);
              });
              res.on("end", () => {
                stream.close();
                console.log("Finished updating external risk for " + person.profileName);
              });
            } else {
              console.log("Download status code: " + res.statusCode + " with message: " + res.statusMessage);
            }
          });
          req.on('error', e => {
            console.log("Outer handler got error in downloadExternalRisk: " + e);
          });
          req.end();
        } catch(e) {
          console.log("Caught error in downloadExternalRisk: " + e);
        }
      }
    }
  }

  async export() {
    let anaylsis = await this.profile.computeRiskAnalysis();
    await this.exportRiskAnalysis(anaylsis);
    for (const person of this.profile.persons.values()) {
      if (person.publicKey?.length > 0) {
        let exclusiveAnaylsis = await this.profile.computeRiskAnalysis(person);
        await this.exportRiskAnalysisEnc(exclusiveAnaylsis, person);
      }
    }
  }

  async exportRiskAnalysis(analysis: Array<AnalysisDay>) {
    let dataExport = [];
    for (let offset = 28; offset >= 0; offset--) {
      let data = analysis[offset];
      dataExport.push({ date: dateAndTime.format(data.date, "YYYY-MM-DD"), contagiosity: data.outgoingRisk });
    }
    this.profile.saveObject("export", dataExport);
  }
}