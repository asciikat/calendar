/* Tests for core.js. "Now" is pinned to Thursday 1 October 2026, 10:00 local. */
const C = window.EasyCore;
const NOW = new Date(2026, 9, 1, 10, 0).getTime();
const at = (h, m = 0, day = 1) => new Date(2026, 9, day, h, m).getTime();
const P = (text, nowMs = NOW) => C.parseQuick(text, nowMs, { weekStart: 1 });
const pick = (o, keys) => keys.reduce((acc, k) => { acc[k] = o[k]; return acc; }, {});
const PK = ['title', 'date', 'endDate', 'time', 'durationMin', 'travelMin', 'type'];
const item = (f) => C.normalizeItem({ id: f.id || f.title, createdAt: 1, updatedAt: 1, ...f });

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

// ── dates ──
test('toISO / fromISO round trip', () => {
  eq(C.toISO(new Date(2026, 9, 1)), '2026-10-01');
  eq(C.toISO(C.fromISO('2024-02-29')), '2024-02-29');
});
test('isISO rejects impossible dates', () => {
  ok(C.isISO('2026-10-01'));
  ok(!C.isISO('2026-02-30'));
  ok(!C.isISO('2026-1-01'));
  ok(!C.isISO(null));
});
test('addDays crosses months, years and DST', () => {
  eq(C.addDays('2026-10-31', 1), '2026-11-01');
  eq(C.addDays('2026-12-31', 1), '2027-01-01');
  eq(C.addDays('2026-03-28', 2), '2026-03-30'); // UK clocks go forward 29 Mar 2026
  eq(C.addDays('2026-10-24', 3), '2026-10-27'); // and back 25 Oct 2026
  eq(C.addDays('2026-03-01', -1), '2026-02-28');
});
test('daysBetween is DST-safe', () => {
  eq(C.daysBetween('2026-03-28', '2026-03-30'), 2);
  eq(C.daysBetween('2026-10-01', '2026-09-30'), -1);
});
test('startOfWeek honours Monday or Sunday starts', () => {
  eq(C.startOfWeek('2026-10-01', 1), '2026-09-28');
  eq(C.startOfWeek('2026-10-01', 0), '2026-09-27');
  eq(C.startOfWeek('2026-09-28', 1), '2026-09-28');
  eq(C.startOfWeek('2026-10-04', 1), '2026-09-28'); // Sunday belongs to the Monday week
});
test('addMonths clamps to the end of short months', () => {
  eq(C.addMonths('2026-01-31', 1), '2026-02-28');
  eq(C.addMonths('2026-12-15', 1), '2027-01-15');
  eq(C.addMonths('2026-01-15', -1), '2025-12-15');
  eq(C.addMonths('2026-10-01', 12), '2027-10-01');
});
test('time helpers', () => {
  eq(C.timeToMin('15:30'), 930);
  eq(C.minToTime(930), '15:30');
  eq(C.minToTime(1440 + 15), '00:15');
  eq(C.minToTime(-15), '23:45');
});

// ── formatting ──
test('fmtTime 12h and 24h', () => {
  eq(C.fmtTime(900), '3pm');
  eq(C.fmtTime(930), '3:30pm');
  eq(C.fmtTime(0), '12am');
  eq(C.fmtTime(720), '12pm');
  eq(C.fmtTime(930, true), '15:30');
});
test('fmtDuration', () => {
  eq(C.fmtDuration(40), '40 min');
  eq(C.fmtDuration(60), '1 h');
  eq(C.fmtDuration(130), '2 h 10 min');
});
test('fmtDay relative labels', () => {
  eq(C.fmtDay('2026-10-01', '2026-10-01'), 'Today');
  eq(C.fmtDay('2026-10-02', '2026-10-01'), 'Tomorrow');
  eq(C.fmtDay('2026-09-30', '2026-10-01'), 'Yesterday');
  eq(C.fmtDay('2026-10-05', '2026-10-01'), 'Mon 5 Oct');
  eq(C.fmtDay('2027-01-05', '2026-10-01'), 'Tue 5 Jan 2027');
});

// ── parser ──
test('parse: dentist 3pm tomorrow', () => {
  eq(pick(P('dentist 3pm tomorrow'), PK), {
    title: 'Dentist', date: '2026-10-02', endDate: null, time: '15:00', durationMin: null, travelMin: null, type: 'health',
  });
});
test('parse: gym 6-7pm is today with a length', () => {
  eq(pick(P('gym 6-7pm'), PK), {
    title: 'Gym', date: '2026-10-01', endDate: null, time: '18:00', durationMin: 60, travelMin: null, type: 'personal',
  });
});
test('parse: no date means an open task', () => {
  eq(pick(P('call mum'), PK), {
    title: 'Call mum', date: null, endDate: null, time: null, durationMin: null, travelMin: null, type: 'task',
  });
});
test('parse: lunch with Sam at 1pm on friday', () => {
  const r = P('lunch with Sam at 1pm on friday');
  eq([r.title, r.date, r.time], ['Lunch with Sam', '2026-10-02', '13:00']);
});
test('parse: holiday 12-19 oct is multi-day adventure', () => {
  const r = P('holiday 12-19 oct');
  eq([r.title, r.date, r.endDate, r.type], ['Holiday', '2026-10-12', '2026-10-19', 'adventure']);
});
test('parse: range across months', () => {
  const r = P('trip 28 oct to 3 nov');
  eq([r.title, r.date, r.endDate], ['Trip', '2026-10-28', '2026-11-03']);
});
test('parse: a time that has passed today means tomorrow', () => {
  const r = P('meeting 9am');
  eq([r.date, r.time, r.assumedTomorrow, r.type], ['2026-10-02', '09:00', true, 'appointment']);
});
test('parse: a time still to come is today', () => {
  const r = P('meeting 11am');
  eq([r.date, r.assumedTomorrow], ['2026-10-01', false]);
});
test('parse: 24h time with a duration', () => {
  const r = P('standup 14:30 for 15m');
  eq([r.title, r.time, r.durationMin], ['Standup', '14:30', 15]);
});
test('parse: durations in words and hours', () => {
  eq(P('read for an hour').durationMin, 60);
  eq(P('read for half an hour').durationMin, 30);
  eq(P('read for 1.5 hours').durationMin, 90);
  eq(P('read for 1h 30').durationMin, 90);
  eq(P('read for an hour and a half').durationMin, 90);
  eq(P('read for 1.5 hours').title, 'Read');
});
test('parse: UK numeric date with time and travel', () => {
  const r = P('dentist 3/10 2:30pm travel 20');
  eq([r.title, r.date, r.time, r.travelMin], ['Dentist', '2026-10-03', '14:30', 20]);
});
test('parse: travel written the other way round', () => {
  eq(P('vet 4pm 15 min drive').travelMin, 15);
  eq(P('vet 4pm 15 min drive').title, 'Vet');
});
test('parse: sat at the end is Saturday, sun cream is not Sunday', () => {
  eq(P('party sat').date, '2026-10-03');
  const r = P('buy sun cream');
  eq([r.title, r.date], ['Buy sun cream', null]);
  eq(P('sat nav fix').date, null);
});
test('parse: a date that has passed this year rolls to next year', () => {
  eq(P('new year 1 jan').date, '2027-01-01');
  eq(P('bonfire 5th november').date, '2026-11-05');
  eq(P('payday oct 30').date, '2026-10-30');
});
test('parse: the 5th is this month, the 1st is today', () => {
  eq(P('rent the 5th').date, '2026-10-05');
  eq(P('rent the 1st').date, '2026-10-01');
});
test('parse: relative days and weeks', () => {
  eq(P('check in 2 weeks').date, '2026-10-15');
  eq(P('check in 3 days').date, '2026-10-04');
  eq(P('plan next week').date, '2026-10-05');
  eq(P('chill this weekend').date, '2026-10-03');
  eq(P('thing day after tomorrow').date, '2026-10-03');
});
test('parse: weekday today vs next', () => {
  eq(P('gym thursday').date, '2026-10-01');
  eq(P('gym next thursday').date, '2026-10-08');
  eq(P('gym monday').date, '2026-10-05');
  eq(P('gym on mon').date, '2026-10-05');
});
test('parse: 11-1pm starts in the morning', () => {
  const r = P('lunch thing 11-1pm');
  eq([r.time, r.durationMin], ['11:00', 120]);
});
test('parse: 24h ranges', () => {
  const r = P('focus block 15:00-16:30');
  eq([r.title, r.time, r.durationMin], ['Focus block', '15:00', 90]);
});
test('parse: #tags set the type and vanish from the title', () => {
  const r = P('#health yoga');
  eq([r.title, r.type], ['Yoga', 'health']);
  eq(P('stuff #work').title, 'Stuff #work'); // unknown tags stay
});
test('parse: bare "at 3" means 3pm, "at 9" means 9am', () => {
  eq(P('coffee at 3').time, '15:00');
  eq(P('coffee at 9 tomorrow').time, '09:00');
});
test('parse: 7.30pm and at 15.30 and 15.30', () => {
  eq(P('film 7.30pm').time, '19:30');
  eq(P('call at 15.30').time, '15:30');
  eq(P('call 15.30').time, '15:30');
  eq(P('call 15.30').title, 'Call');
});
test('parse: noon', () => {
  eq(P('lunch noon tomorrow').time, '12:00');
  eq(P('lunch noon tomorrow').title, 'Lunch');
});
test('parse: empty and date-only input give no title', () => {
  eq(P('').title, '');
  eq(P('   ').title, '');
  eq(P('tomorrow at 3pm').title, '');
});
test('parse: "at 3 oct" is a date, not a time', () => {
  const r = P('party on 3 oct');
  eq([r.title, r.date, r.time], ['Party', '2026-10-03', null]);
});

// regressions from the review
test('parse: H:MM without am/pm follows the same afternoon rule as "at 3"', () => {
  eq(P('call at 3:30').time, '15:30');
  eq(P('catch the 5:15 train').time, '17:15');
  eq(P('pick up prescription 4:30').time, '16:30');
  eq(P('meet at 2.30').time, '14:30');
  eq(P('dinner at 7:30').time, '19:30');
  const r = P('piano 4:00-5:00');
  eq([r.time, r.durationMin, r.date], ['16:00', 60, '2026-10-01']);
  eq(P('standup 07:30 tomorrow').time, '07:30'); // leading zero is literal
  eq(P('meeting 10:30 tomorrow').time, '10:30'); // 8-11 stay in the morning
});
test('parse: tonight makes an unmarked hour the evening', () => {
  eq(P('dinner at 8 tonight').time, '20:00');
  eq(P('tonight 7:30').time, '19:30');
  eq(P('tonight at 8').time, '20:00');
  eq(P('film this evening at 9').time, '21:00');
  eq(P('film tonight 9pm').time, '21:00');
  eq(P('dinner at 8 tonight').date, '2026-10-01');
});
test('parse: an explicit date beats a weekday next to it', () => {
  let r = P('Fri 9 Oct dentist');
  eq([r.date, r.title], ['2026-10-09', 'Dentist']);
  r = P('sat 10 oct party');
  eq([r.date, r.title], ['2026-10-10', 'Party']);
  r = P('dentist mon 12/10');
  eq([r.date, r.title], ['2026-10-12', 'Dentist']);
  eq(P('tue 13 oct gym').date, '2026-10-13');
  eq(P('gym fri').date, '2026-10-02'); // a lone weekday still works
});
test('parse: next weekend / next fri / friday next week', () => {
  eq(P('next weekend').date, '2026-10-10');
  eq(P('next weekend', at(9, 0, 3)).date, '2026-10-10'); // on Saturday 3 Oct
  eq(P('drinks friday next week').date, '2026-10-09');
  eq(P('drinks friday next week').title, 'Drinks');
  eq(P('fri next week').date, '2026-10-09');
  eq(P('gym next fri').date, '2026-10-09');
  eq(P('gym this fri').date, '2026-10-02');
});
test('parse: a bare number after drive/commute/travel is not minutes mid-sentence', () => {
  let r = P('drive 2 kids to school 8am');
  eq([r.travelMin, r.title], [null, 'Drive 2 kids to school']);
  r = P('commute 2 trains');
  eq([r.travelMin, r.title], [null, 'Commute 2 trains']);
  r = P('travel 3 days');
  eq([r.travelMin, r.title], [null, 'Travel 3 days']);
  eq(P('vet 4pm travel 20').travelMin, 20);
  eq(P('vet travel 20 tomorrow').travelMin, 20);
  eq(P('vet 4pm drive 15 min').travelMin, 15);
});
test('parse: real words at the ends of a title are kept', () => {
  eq(P('check in 3pm').title, 'Check in');
  eq(P('hotel check in').title, 'Hotel check in');
  eq(P('turn heating on').title, 'Turn heating on');
  eq(P('put the washing on').title, 'Put the washing on');
  eq(P('log in').title, 'Log in');
  eq(P('The Crown pub quiz 8pm').title, 'The Crown pub quiz');
  eq(P('next door bins').title, 'Next door bins');
  eq(P('in person meeting fri').title, 'In person meeting');
});
test('parse: minutes after "for N hours" do not swallow a day number', () => {
  let r = P('spa for 2 hours 12 dec');
  eq([r.durationMin, r.date, r.title], [120, '2026-12-12', 'Spa']);
  r = P('gym for 1 hour 3 oct');
  eq([r.durationMin, r.date], [60, '2026-10-03']);
  eq(P('read for 1h 30').durationMin, 90);
  eq(P('read for 2 hours 30 min').durationMin, 150);
});
test('parse: money and versions are not dates, bare H.MM is a time', () => {
  let r = P('pay £10.05 fine');
  eq([r.date, r.time, r.title], [null, null, 'Pay £10.05 fine']);
  r = P('read chapter 2.1');
  eq([r.date, r.title], [null, 'Read chapter 2.1']);
  r = P('meeting 10.30 tomorrow');
  eq([r.time, r.date, r.title], ['10:30', '2026-10-02', 'Meeting']);
  r = P('call 9.45');
  eq([r.time, r.date, r.title], ['09:45', '2026-10-02', 'Call']); // 9:45 has gone today
  eq(P('thing 12.10.2026').date, '2026-10-12');
});
test('parse: sun / sat with an article before are not days', () => {
  eq(P('sit in the sun').date, null);
  eq(P('sit in the sun').title, 'Sit in the sun');
  eq(P('enjoy the sun').title, 'Enjoy the sun');
  eq(P('party sat').date, '2026-10-03');
});
test('parse: month-first ranges and ranges already under way', () => {
  let r = P('oct 12-19');
  eq([r.date, r.endDate, r.title], ['2026-10-12', '2026-10-19', '']);
  const mid = new Date(2026, 9, 8, 14, 20).getTime();
  r = P('trip to rome 7-10 oct', mid);
  eq([r.date, r.endDate], ['2026-10-07', '2026-10-10']);
  r = P('trip 8 oct - 11 oct', mid);
  eq([r.date, r.endDate], ['2026-10-08', '2026-10-11']);
  r = P('conference 5-12 oct', mid);
  eq([r.date, r.endDate], ['2026-10-05', '2026-10-12']);
  r = P('conference 5-6 oct', mid); // wholly in the past: next year
  eq([r.date, r.endDate], ['2027-10-05', '2027-10-06']);
  r = P('break 28 dec to 3 jan');
  eq([r.date, r.endDate], ['2026-12-28', '2027-01-03']);
});
test('a timed item that runs past midnight still counts after midnight', () => {
  const shift = item({ id: 'ns', title: 'Night shift', date: '2026-10-01', time: '22:00', durationMin: 480 });
  const t = new Date(2026, 9, 2, 2, 0).getTime();
  eq(C.rightNow([shift], t).current.id, 'ns');
  eq(C.busyBlocks([shift], '2026-10-02'), [[0, 360]]);
  eq(C.findSlot([shift], '2026-10-02', 60, 120, 1380), 360);
  eq(C.rightNow([shift], new Date(2026, 9, 2, 7, 0).getTime()).current, null);
});

// ── items ──
test('normalizeItem fills defaults and drops junk', () => {
  const it = C.normalizeItem({ id: 7, title: '  hi  ', date: 'nope', time: '25:00', type: 'zzz', status: 'weird' });
  eq([it.id, it.title, it.date, it.time, it.type, it.status, it.deleted], ['7', 'hi', null, null, 'task', 'open', false]);
  eq(C.normalizeItem({ title: 'x', date: '2026-10-01', endDate: '2026-09-01' }).endDate, null);
  eq(C.normalizeItem({ title: 'x', status: 'slipped' }).status, 'open');
});
test('timed vs any-time vs multi-day', () => {
  ok(C.isTimed(item({ title: 'a', date: '2026-10-01', time: '09:00' })));
  ok(!C.isTimed(item({ title: 'b', date: '2026-10-01' })));
  ok(!C.isTimed(item({ title: 'c', date: '2026-10-01', endDate: '2026-10-03', time: '09:00' })));
  ok(C.isMultiDay(item({ title: 'c', date: '2026-10-01', endDate: '2026-10-03' })));
});
test('dueToSlip: timed items slip at their end, any-time items the next day', () => {
  const items = [
    item({ id: 'past', title: 'past', date: '2026-10-01', time: '08:00', durationMin: 60 }),
    item({ id: 'ongoing', title: 'ongoing', date: '2026-10-01', time: '09:30', durationMin: 60 }),
    item({ id: 'anytime', title: 'anytime', date: '2026-10-01' }),
    item({ id: 'yday', title: 'yday', date: '2026-09-30' }),
    item({ id: 'done', title: 'done', date: '2026-09-30', status: 'done' }),
    item({ id: 'task', title: 'task' }),
  ];
  eq(C.dueToSlip(items, NOW).sort(), ['past', 'yday']);
});
test('shiftTime rolls over midnight', () => {
  eq(C.shiftTime(item({ title: 'a', date: '2026-10-01', time: '23:50' }), 15), { date: '2026-10-02', time: '00:05' });
  eq(C.shiftTime(item({ title: 'a', date: '2026-10-01', time: '09:00' }), 15), { date: '2026-10-01', time: '09:15' });
});
test('moveToDate keeps a multi-day length', () => {
  eq(C.moveToDate(item({ title: 'a', date: '2026-10-01', endDate: '2026-10-03' }), '2026-10-10'), { date: '2026-10-10', endDate: '2026-10-12' });
  eq(C.moveToDate(item({ title: 'b', date: '2026-10-01' }), '2026-10-10'), { date: '2026-10-10', endDate: null });
});
test('occurrences expands multi-day items inside a range and sorts', () => {
  const items = [
    item({ id: 'h', title: 'Holiday', date: '2026-09-29', endDate: '2026-10-03' }),
    item({ id: 'd', title: 'Dentist', date: '2026-10-02', time: '15:00' }),
    item({ id: 'g', title: 'Gym', date: '2026-10-02', time: '07:00' }),
    item({ id: 'x', title: 'Gone', date: '2026-10-02', deleted: true }),
    item({ id: 'z', title: 'Dropped', date: '2026-10-02', status: 'dismissed' }),
  ];
  const occ = C.occurrences(items, '2026-10-01', '2026-10-02');
  eq(occ.map((o) => `${o.iso}:${o.item.id}:${o.dayIndex}/${o.dayCount}`), [
    '2026-10-01:h:3/5', '2026-10-02:h:4/5', '2026-10-02:g:1/1', '2026-10-02:d:1/1',
  ]);
});
test('rangeFor each view', () => {
  eq(C.rangeFor('day', '2026-10-01', 1), { start: '2026-10-01', end: '2026-10-01' });
  eq(C.rangeFor('week', '2026-10-01', 1), { start: '2026-09-28', end: '2026-10-04' });
  eq(C.rangeFor('month', '2026-10-15', 1), { start: '2026-10-01', end: '2026-10-31' });
  eq(C.rangeFor('month2', '2026-12-15', 1), { start: '2026-12-01', end: '2027-01-31' });
  eq(C.rangeFor('month3', '2026-10-15', 1), { start: '2026-10-01', end: '2026-12-31' });
  eq(C.rangeFor('year', '2026-10-15', 1), { start: '2026-01-01', end: '2026-12-31' });
});
test('2-week and 6-month ranges and steps', () => {
  eq(C.rangeFor('week2', '2026-10-01', 1), { start: '2026-09-28', end: '2026-10-11' });
  eq(C.rangeFor('month6', '2026-10-15', 1), { start: '2026-10-01', end: '2027-03-31' });
  eq(C.stepAnchor('week2', '2026-10-01', 1, '2026-10-01', 1), '2026-10-15');
  eq(C.stepAnchor('month6', '2026-10-01', 1, '2026-10-01', 1), '2027-04-01');
  eq(C.stepAnchor('month6', '2027-04-01', -1, '2026-10-01', 1), '2026-10-01');
});
test('stepAnchor moves by a view length and snaps back to today', () => {
  eq(C.stepAnchor('day', '2026-10-01', 1, '2026-10-01', 1), '2026-10-02');
  eq(C.stepAnchor('week', '2026-10-01', 1, '2026-10-01', 1), '2026-10-08');
  eq(C.stepAnchor('month', '2026-10-15', 1, '2026-10-01', 1), '2026-11-01');
  eq(C.stepAnchor('month', '2026-11-01', -1, '2026-10-01', 1), '2026-10-01');
  eq(C.stepAnchor('month3', '2026-10-01', 1, '2026-10-01', 1), '2027-01-01');
  eq(C.stepAnchor('year', '2026-10-01', -1, '2026-10-01', 1), '2025-10-01'); // keeps the month
  eq(C.stepAnchor('year', '2025-10-01', 1, '2026-10-01', 1), '2026-10-01');
});

// ── right now ──
test('rightNow: current, next, any-time and later', () => {
  const items = [
    item({ id: 'cur', title: 'Writing', date: '2026-10-01', time: '09:30', durationMin: 60 }),
    item({ id: 'n1', title: 'Dentist', date: '2026-10-01', time: '15:00' }),
    item({ id: 'n2', title: 'Gym', date: '2026-10-01', time: '18:00' }),
    item({ id: 'any', title: 'Groceries', date: '2026-10-01' }),
    item({ id: 'later', title: 'Tomorrow thing', date: '2026-10-02', time: '09:00' }),
    item({ id: 'done', title: 'Done', date: '2026-10-01', time: '10:00', status: 'done' }),
  ];
  const r = C.rightNow(items, NOW);
  eq(r.current.id, 'cur');
  eq(r.next.id, 'n1');
  eq(r.upcoming.map((x) => x.id), ['n1', 'n2']);
  eq(r.anyTime.map((x) => x.id), ['any']);
  eq(r.later.id, 'later');
});
test('rightNow: nothing on means nulls', () => {
  const r = C.rightNow([], NOW);
  eq([r.current, r.next, r.anyTime.length, r.later], [null, null, 0, null]);
});
test('leaveAtMs subtracts travel', () => {
  const it = item({ title: 'Dentist', date: '2026-10-01', time: '15:00', travelMin: 45 });
  eq(C.leaveAtMs(it), at(14, 15));
  eq(C.leaveAtMs(item({ title: 'x', date: '2026-10-01', time: '15:00' })), null);
});
test('pickCandidates: undated tasks and today any-time only', () => {
  const items = [
    item({ id: 't', title: 'task' }),
    item({ id: 'a', title: 'any', date: '2026-10-01' }),
    item({ id: 'timed', title: 'timed', date: '2026-10-01', time: '15:00' }),
    item({ id: 'tmrw', title: 'tmrw', date: '2026-10-02' }),
    item({ id: 'done', title: 'done', status: 'done' }),
  ];
  eq(C.pickCandidates(items, NOW).map((x) => x.id).sort(), ['a', 't']);
});

// ── free time ──
test('busyBlocks merges overlaps', () => {
  const items = [
    item({ id: 'a', title: 'a', date: '2026-10-01', time: '09:00', durationMin: 60 }),
    item({ id: 'b', title: 'b', date: '2026-10-01', time: '09:30', durationMin: 60 }),
    item({ id: 'c', title: 'c', date: '2026-10-01', time: '12:00', durationMin: 30 }),
  ];
  eq(C.busyBlocks(items, '2026-10-01'), [[540, 630], [720, 750]]);
});
test('busyBlocks counts travel time as busy', () => {
  const items = [item({ id: 'd', title: 'Dentist', date: '2026-10-01', time: '15:00', durationMin: 60, travelMin: 20 })];
  eq(C.busyBlocks(items, '2026-10-01'), [[880, 960]]);
  eq(C.findSlot(items, '2026-10-01', 30, 870, 1000), 960);
});
test('freeGaps and findSlot', () => {
  const items = [
    item({ id: 'a', title: 'a', date: '2026-10-01', time: '10:00', durationMin: 60 }),
    item({ id: 'b', title: 'b', date: '2026-10-01', time: '11:20', durationMin: 40 }),
  ];
  eq(C.freeGaps(items, '2026-10-01', 600, 780), [[660, 680], [720, 780]]);
  eq(C.findSlot(items, '2026-10-01', 30, 600, 780), 720);
  eq(C.findSlot(items, '2026-10-01', 15, 600, 780), 660);
  eq(C.findSlot(items, '2026-10-01', 120, 600, 780), null);
  eq(C.findSlot(items, '2026-10-01', 15, 610, 780), 660);
});
test('freeGaps on an empty day is the whole window', () => {
  eq(C.freeGaps([], '2026-10-01', 605, 1320), [[605, 1320]]);
  eq(C.findSlot([], '2026-10-01', 30, 605, 1320), 615);
});
test('assignLanes stacks overlaps', () => {
  const r = C.assignLanes([{ s: 540, e: 600 }, { s: 570, e: 630 }, { s: 600, e: 660 }, { s: 610, e: 620 }]);
  eq(r.lanes, [0, 1, 0, 2]);
  eq(r.count, 3);
});

// ── store ──
test('store add / update / remove / restore persist', () => {
  const storage = fakeStorage();
  let t = 1000;
  const s = C.createStore({ storage, now: () => t });
  const a = s.add({ title: 'Dentist', date: '2026-10-02', time: '15:00' });
  eq(s.all().length, 1);
  t = 1000; // same clock tick still bumps updatedAt
  const u = s.update(a.id, { title: 'Dentist!' });
  ok(u.updatedAt > a.updatedAt, 'updatedAt strictly increases');
  eq(u.createdAt, a.createdAt);
  s.remove(a.id);
  eq(s.all().length, 0);
  eq(s.get(a.id), null);
  s.restore(a.id);
  eq(s.get(a.id).title, 'Dentist!');
  const again = C.createStore({ storage, now: () => t });
  eq(again.get(a.id).title, 'Dentist!');
});
test('store settings are sanitised and persisted', () => {
  const storage = fakeStorage();
  const s = C.createStore({ storage });
  s.setSettings({ view: 'week', clock24: true, weekStart: 7, focusMin: 'x' });
  const again = C.createStore({ storage }).settings();
  eq([again.view, again.clock24, again.weekStart, again.focusMin], ['week', true, 1, 25]);
});
test('store survives corrupt storage and blocked storage', () => {
  const storage = fakeStorage();
  storage.setItem('easycal.v1', '{nope');
  eq(C.createStore({ storage }).all().length, 0);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const s = C.createStore({ storage: blocked });
  s.add({ title: 'still works in memory' });
  eq(s.all().length, 1);
  eq(s.canSave(), false);
});
test('store subscribe fires on changes', () => {
  const s = C.createStore({ storage: fakeStorage() });
  const seen = [];
  const off = s.subscribe((c) => seen.push(c.type));
  const a = s.add({ title: 'x' });
  s.update(a.id, { status: 'done' });
  s.updateMany([a.id], { status: 'open' });
  off();
  s.remove(a.id);
  eq(seen, ['add', 'update', 'update']);
});
test('export → import merge keeps the newest copy', () => {
  let t = 100;
  const a = C.createStore({ storage: fakeStorage(), now: () => t });
  const x = a.add({ title: 'Shared' });
  const backup = a.exportData();
  const b = C.createStore({ storage: fakeStorage(), now: () => t });
  eq(b.importData(backup), { added: 1, updated: 0 });
  t = 500;
  b.update(x.id, { title: 'Newer on B' });
  eq(b.importData(backup), { added: 0, updated: 0 }); // older copy loses
  eq(b.get(x.id).title, 'Newer on B');
  eq(a.importData(b.exportData()), { added: 0, updated: 1 });
  eq(a.get(x.id).title, 'Newer on B');
});
test('import rejects files that are not backups', () => {
  const s = C.createStore({ storage: fakeStorage() });
  let threw = false;
  try { s.importData({ hello: 1 }); } catch (e) { threw = /not an Easy Cal backup/.test(e.message); }
  ok(threw);
});
test('deleted records merge as deletions', () => {
  let t = 100;
  const a = C.createStore({ storage: fakeStorage(), now: () => t });
  const x = a.add({ title: 'Will go' });
  const b = C.createStore({ storage: fakeStorage(), now: () => t });
  b.importData(a.exportData());
  t = 200;
  a.remove(x.id);
  b.importData(a.exportData());
  eq(b.get(x.id), null);
});
