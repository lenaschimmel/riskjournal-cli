import { StringifyOptions } from "querystring";

export interface PlainActivity {
    id: string;
    title: string;
    begin: Date;
    end: Date;
    setting: string;
    distance: string;
    yourMask: string;
    theirMask: string;
    voice: string;
    unknownPersonCount: number;
    unknownPersonRiskProfile: string;
    knownPersonIds: Array<string>;
    locationId: string; //used as location for unknown persons
}

export interface PlainCohabitation {
    id: string;
    begin: Date;
    end: Date;
    knownPersonId: string;
    sleepingTogether: boolean;
}

export interface PlainLocation {
    id: string;
    title: string;
    city: string;
    top: string;
    sub: string;
}

export interface PlainPerson {
    id: string;
    name: string;
    fullName: string;
    riskProfile: string;
    locationId: string;
    timedRisk: Map<Date, number>; // TODO needes proper definition of which risk this is
}