// Add support for Maps, from https://stackoverflow.com/a/56150320/39946
export function replacer(this: { [key: string]: any }, key: string, value: any) {
  const originalObject = this[key];
  if (originalObject instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
    };
  } else {
    return value;
  }
}

// Add support for Maps, from https://stackoverflow.com/a/56150320/39946
export function reviver(key: string, value: any) {
  if (typeof value === 'object' && value !== null) {
    if (value.dataType === 'Map') {
      return new Map(value.value);
    }
  }
  return value;
}

export function dateWithoutTime(datetime: Date): Date {
  // from https://stackoverflow.com/a/38050824/39946
  // but with local time zone
  return new Date(datetime.getFullYear(), datetime.getMonth(), datetime.getDate());
}

export function addDays(inDate: Date, days: number) {
  var date = new Date(inDate.valueOf());
  date.setDate(date.getDate() + days);
  return date;
}

export function timeSpanString(begin: Date, end: Date) {
  let diffSeconds = (Math.floor(end.getTime() - begin.getTime())) / 1000;
  if (diffSeconds < 90) {
    return diffSeconds + " Sekunden";
  }
  let diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 120) {
    return diffMinutes + " Minuten";
  }
  let diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 49) {
    return diffHours + " Stunden";
  }
  let diffDays = Math.floor(diffHours / 24);
  if (diffDays < 15) {
    return diffDays + " Tage";
  }
  let diffWeeks = Math.floor(diffDays / 7);
  return diffWeeks + " Wochen";
}

// I _think_ this computes how much of the given day overlaps with an event that ranges from begin to end.
export function computeOverlapWeeks(begin: Date, end: Date, day: Date): number {
  return computeOverlapMilliseconds(begin, end, day) / (60 * 60 * 1000 * 24 * 7);
}

export function computeOverlapMinutes(begin: Date, end: Date, day: Date): number {
  return computeOverlapMilliseconds(begin, end, day) / (60 * 1000);
}

export function computeOverlapMilliseconds(begin: Date, end: Date, day: Date): number {
  let eventBeginTime = begin.getTime();
  let eventEndTime = end.getTime();
  let dayBeginTime = dateWithoutTime(day).getTime();
  let dayEndTime = dayBeginTime + 1000 * 3600 * 24;

  return Math.max(0, Math.min(dayEndTime, eventEndTime) - Math.max(dayBeginTime, eventBeginTime));
}