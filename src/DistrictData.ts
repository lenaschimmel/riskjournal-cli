import dateAndTime from 'date-and-time';
import fs from 'fs';
import parse from 'csv-parse/lib/sync';
import { inspect } from 'util';

interface Record {
  IdLandkreis: string;
  Landkreis: string;
  Inzidenz: number;
  Altersgruppe: string;
}

interface District {
  id: string;
  name: string;
  incidenceByDate: Map<string, Map<string, number>>; // Map<datestring, Map<agegroupstring, incidence>>
}

export default class DistrictData {
  districts: Map<string, District>;

  constructor() {
    this.districts = new Map();
    this.load();
  }

  load() {
    let subDirs = fs.readdirSync("./data/incidence/output/", { encoding: "utf-8", withFileTypes: true });
    let dateStrings = subDirs.filter(dir => dir.isDirectory()).map(dir => dir.name);
    for (let dateString of dateStrings) {
      this.loadFile("./data/incidence/output/" + dateString + "/resultSum.csv", dateString, false);
      this.loadFile("./data/incidence/output/" + dateString + "/resultByAltersgruppe.csv", dateString, true);
    }
    // console.log(inspect(this, {depth:null}));
  }

  loadFile(filePath: string, dateString: string, hasAgeGroups: boolean) {
    let csv = fs.readFileSync(filePath);
    let records: Array<Record> = parse(csv, {columns: true});
    for(let record of records) {
      let district;
      if (this.districts.has(record.IdLandkreis)) {
        district = this.districts.get(record.IdLandkreis)!;
      } else {
        district = {
          id: record.IdLandkreis,
          name: record.Landkreis,
          incidenceByDate: new Map()
        };
        this.districts.set(record.IdLandkreis, district);
      }
      
      let dataForDate;
      if (district.incidenceByDate.has(dateString)) {
        dataForDate = district.incidenceByDate.get(dateString);
      } else {
        dataForDate = new Map();
        district.incidenceByDate.set(dateString, dataForDate);
      }

      if (hasAgeGroups) {
        dataForDate.set(record.Altersgruppe, record.Inzidenz);
      } else {
        dataForDate.set("all", record.Inzidenz);
      }
    }
  }

  getName(idLandkreis: string): string {
    let district = this.districts.get(idLandkreis);
    return district!.name;
  }

  getIncidence(idLandkreis: string, date: Date, ageGroup: string): number {
    let district = this.districts.get(idLandkreis);
    let dateString = dateAndTime.format(date, "YYYY-MM-DD");
    if (!district!.incidenceByDate.has(dateString)) {
      let minDate = Array.from(district!.incidenceByDate.keys()).sort()[0];
      console.log("No incidence for " + dateString, " using " + minDate + " instead.");
      dateString = minDate;
    }
    return district!.incidenceByDate.get(dateString)!.get(ageGroup)! * 1;
  }

  getChoices(): Array<{ name: string, message: string }> {
    return Array.from(Array.from(this.districts.keys()).map(key => { 
      let district = this.districts.get(key)!;
      return {
        name: district.id,
        message: district.name
      }
    }));
  }

  getDataForCalculator(idLandkreis: string, date: Date, ageGroup: string) {
    var d = new Date(date);
    d.setDate(d.getDate()-7);
    let casesNow = this.getIncidence(idLandkreis, date, ageGroup);
    let casesBefore = this.getIncidence(idLandkreis, d, ageGroup);
    let percentage = (casesNow / (casesBefore + 1) * 100 - 100);
    let ret = {
      population: "100000", // cases are already normalized to 100.000 population (this is a string because microCOVID needs it this way)
      casesPastWeek: casesNow,
      casesIncreasingPercentage: percentage,
      positiveCasePercentage: 7 // need to get this data up to date, this is the number for week 44
    };
    return ret;
  }
}