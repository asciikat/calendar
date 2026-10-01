/* Easy Cal core: the pure logic behind the planner. Dates, the quick-add parser,
   schedule maths, item records and the store. No DOM in here, so the browser
   tests in tests/ can exercise all of it directly.

   Dates are local 'YYYY-MM-DD' strings and times are 'HH:MM' strings, so they
   compare correctly as plain strings and never drift across DST changes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EasyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = ['personal', 'appointment', 'health', 'task', 'adventure'];
  const TYPE_LABEL = {
    personal: 'Personal', appointment: 'Appointment', health: 'Health', task: 'Task', adventure: 'Adventure',
  };
  const STATUSES = ['open', 'done', 'slipped', 'dismissed'];
  const VIEWS = ['day', 'week', 'month', 'month2', 'month3', 'year'];
  const DEFAULT_DURATION = 60;
  const DAY_MS = 86400000;
  const DEFAULT_SETTINGS = Object.freeze({
    clock24: false,
    weekStart: 1,
    sound: false,
    defaultDuration: 60,
    focusMin: 25,
    view: 'day',
    filter: 'next',
    full: false,
  });

  // ── dates ────────────────────────────────────────────────────────────────
  const pad2 = (n) => String(n).padStart(2, '0');
  const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];

  function toISO(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function fromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function isISO(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(fromISO(s)) === s;
  }
  function isTime(t) {
    return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  }
  function addDays(iso, n) {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  function dayNumber(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }
  function daysBetween(a, b) { return dayNumber(b) - dayNumber(a); }
  function weekday(iso) { return fromISO(iso).getDay(); }
  function startOfWeek(iso, weekStart) {
    return addDays(iso, -((weekday(iso) - weekStart + 7) % 7));
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function startOfMonth(iso) { return iso.slice(0, 8) + '01'; }
  function endOfMonth(iso) {
    const [y, m] = iso.split('-').map(Number);
    return `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`;
  }
  function addMonths(iso, n) {
    let [y, m, d] = iso.split('-').map(Number);
    m += n;
    y += Math.floor((m - 1) / 12);
    m = (((m - 1) % 12) + 12) % 12 + 1;
    d = Math.min(d, daysInMonth(y, m));
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  function timeToMin(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function minToTime(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }
  function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }
  function atTime(iso, min) {
    const d = fromISO(iso);
    d.setHours(Math.floor(min / 60), min % 60, 0, 0);
    return d;
  }

  // ── formatting ───────────────────────────────────────────────────────────
  function fmtTime(min, clock24) {
    if (min == null) return '';
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (clock24) return `${pad2(h)}:${pad2(mm)}`;
    const suf = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 || 12;
    return mm ? `${h12}:${pad2(mm)}${suf}` : `${h12}${suf}`;
  }
  function fmtDuration(min) {
    const total = Math.max(0, Math.round(min));
    if (total < 60) return `${total} min`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  // "Today", "Tomorrow", "Yesterday", else "Fri 2 Oct" (+ year when it differs)
  function fmtDay(iso, todayISO) {
    const diff = daysBetween(todayISO, iso);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    const d = fromISO(iso);
    const base = `${WD_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
    return iso.slice(0, 4) === todayISO.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
  }
  function fmtDateLong(iso) {
    const d = fromISO(iso);
    return `${WD_LONG[d.getDay()]} ${d.getDate()} ${MON_LONG[d.getMonth()]}`;
  }
  function fmtShortDate(iso) {
    const d = fromISO(iso);
    return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
  }

  // ── items ────────────────────────────────────────────────────────────────
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function cleanInt(v, min, max) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }
  // Coerce anything (a form, a backup file, an old record) into a valid item.
  function normalizeItem(raw) {
    const src = raw || {};
    const date = isISO(src.date) ? src.date : null;
    const created = Number(src.createdAt);
    const updated = Number(src.updatedAt);
    const it = {
      id: src.id != null && String(src.id) ? String(src.id) : newId(),
      title: String(src.title == null ? '' : src.title).replace(/\s+/g, ' ').trim().slice(0, 200) || 'Untitled',
      date,
      endDate: date && isISO(src.endDate) && src.endDate > date ? src.endDate : null,
      time: date && isTime(src.time) ? src.time : null,
      durationMin: cleanInt(src.durationMin, 5, 1440),
      travelMin: cleanInt(src.travelMin, 1, 600),
      type: TYPES.includes(src.type) ? src.type : (date ? 'personal' : 'task'),
      status: STATUSES.includes(src.status) ? src.status : 'open',
      notes: typeof src.notes === 'string' ? src.notes.slice(0, 2000) : '',
      deleted: !!src.deleted,
      createdAt: Number.isFinite(created) ? created : 0,
      updatedAt: Number.isFinite(updated) ? updated : 0,
    };
    // an undated task can't be "slipped"; it just waits on the shelf
    if (!it.date && it.status === 'slipped') it.status = 'open';
    return it;
  }
  function itemEndDate(it) { return it.endDate && it.endDate > it.date ? it.endDate : it.date; }
  function isMultiDay(it) { return !!it.date && itemEndDate(it) !== it.date; }
  function isTimed(it) { return !!it.date && !!it.time && !isMultiDay(it); }
  function isVisible(it) { return !!it && !it.deleted && it.status !== 'dismissed'; }
  function durationOf(it) { return it.durationMin || DEFAULT_DURATION; }
  function startMs(it) { return isTimed(it) ? atTime(it.date, timeToMin(it.time)).getTime() : null; }
  function endMs(it) {
    if (!it.date) return null;
    if (isTimed(it)) return startMs(it) + durationOf(it) * 60000;
    return fromISO(addDays(itemEndDate(it), 1)).getTime();
  }
  function covers(it, iso) { return !!it.date && it.date <= iso && iso <= itemEndDate(it); }

  // ids of open, scheduled items whose end has passed: they quietly become "slipped"
  function dueToSlip(items, nowMs) {
    return items
      .filter((it) => !it.deleted && it.status === 'open' && it.date && endMs(it) <= nowMs)
      .map((it) => it.id);
  }

  // shift a timed item by some minutes, rolling over midnight into the next/previous day
  function shiftTime(it, minutes) {
    if (!isTimed(it)) return { date: it.date, time: it.time };
    const total = timeToMin(it.time) + minutes;
    const dayShift = Math.floor(total / 1440);
    return { date: addDays(it.date, dayShift), time: minToTime(total) };
  }
  // move an item to a new start day, keeping a multi-day item's length
  function moveToDate(it, iso) {
    if (!it.date) return { date: iso, endDate: null };
    const span = daysBetween(it.date, itemEndDate(it));
    return { date: iso, endDate: span > 0 ? addDays(iso, span) : null };
  }

  function compareItems(a, b) {
    const ta = isTimed(a) ? timeToMin(a.time) : -1;
    const tb = isTimed(b) ? timeToMin(b.time) : -1;
    if (ta !== tb) return ta - tb;
    return a.title.localeCompare(b.title);
  }

  // each day an item touches inside [startISO, endISO], sorted by day then time
  function occurrences(items, startISO, endISO) {
    const out = [];
    if (!startISO || !endISO || startISO > endISO) return out;
    for (const it of items) {
      if (!isVisible(it) || !it.date) continue;
      const last = itemEndDate(it);
      const a = it.date > startISO ? it.date : startISO;
      const b = last < endISO ? last : endISO;
      if (a > b) continue;
      const dayCount = daysBetween(it.date, last) + 1;
      for (let iso = a; iso <= b; iso = addDays(iso, 1)) {
        out.push({ iso, item: it, dayIndex: daysBetween(it.date, iso) + 1, dayCount });
      }
    }
    out.sort((x, y) => (x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : compareItems(x.item, y.item)));
    return out;
  }

  // ── ranges for the calendar views ────────────────────────────────────────
  function rangeFor(view, anchor, weekStart) {
    switch (view) {
      case 'week': {
        const s = startOfWeek(anchor, weekStart);
        return { start: s, end: addDays(s, 6) };
      }
      case 'month':
        return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
      case 'month2':
        return { start: startOfMonth(anchor), end: endOfMonth(addMonths(startOfMonth(anchor), 1)) };
      case 'month3':
        return { start: startOfMonth(anchor), end: endOfMonth(addMonths(startOfMonth(anchor), 2)) };
      case 'year': {
        const y = anchor.slice(0, 4);
        return { start: `${y}-01-01`, end: `${y}-12-31` };
      }
      default:
        return { start: anchor, end: anchor };
    }
  }
  // step the anchor one view-length; lands on today whenever today is in the new range
  function stepAnchor(view, anchor, dir, todayISO, weekStart) {
    const months = { month: 1, month2: 2, month3: 3, year: 12 }[view];
    let next;
    if (view === 'week') next = addDays(anchor, 7 * dir);
    else if (months) next = addMonths(startOfMonth(anchor), months * dir);
    else next = addDays(anchor, dir);
    if (todayISO && view !== 'day') {
      const r = rangeFor(view, next, weekStart);
      if (r.start <= todayISO && todayISO <= r.end) return todayISO;
    }
    return next;
  }

  // ── right now ────────────────────────────────────────────────────────────
  // What deserves the user's eyes: the thing on now, the next timed thing today,
  // today's any-time things, and the first timed thing on a later day.
  function rightNow(items, nowMs) {
    const today = toISO(new Date(nowMs));
    const live = items.filter((it) => isVisible(it) && it.status === 'open');
    const yesterday = addDays(today, -1);
    // yesterday's timed items count too: a night shift runs on past midnight
    const timedToday = live
      .filter((it) => isTimed(it) && (it.date === today || (it.date === yesterday && endMs(it) > nowMs)))
      .map((it) => ({ it, s: startMs(it), e: endMs(it) }))
      .sort((a, b) => a.s - b.s || a.e - b.e || a.it.title.localeCompare(b.it.title));
    const onNow = timedToday.filter((x) => x.s <= nowMs && nowMs < x.e).sort((a, b) => a.e - b.e);
    const upcoming = timedToday.filter((x) => x.s > nowMs).map((x) => x.it);
    const anyTime = live
      .filter((it) => it.date && !isTimed(it) && covers(it, today))
      .sort((a, b) => Number(isMultiDay(a)) - Number(isMultiDay(b)) || a.title.localeCompare(b.title));
    const later = live
      .filter((it) => isTimed(it) && it.date > today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : compareItems(a, b)))[0] || null;
    return {
      current: onNow.length ? onNow[0].it : null,
      alsoNow: onNow.slice(1).map((x) => x.it),
      next: upcoming[0] || null,
      upcoming,
      anyTime,
      later,
    };
  }
  function leaveAtMs(it) {
    return it && it.travelMin && isTimed(it) ? startMs(it) - it.travelMin * 60000 : null;
  }

  // things "Pick for me" can choose: undated open tasks and today's any-time items
  function pickCandidates(items, nowMs) {
    const today = toISO(new Date(nowMs));
    return items.filter((it) => isVisible(it) && it.status === 'open'
      && (!it.date || (!isTimed(it) && covers(it, today))));
  }

  // ── free time ────────────────────────────────────────────────────────────
  // merged busy intervals (minutes of the day) for timed items on a day;
  // travel time before an item counts as busy too
  function busyBlocks(items, iso, ignoreId) {
    const prev = addDays(iso, -1);
    const blocks = items
      .filter((it) => isVisible(it) && isTimed(it) && (it.date === iso || it.date === prev) && it.id !== ignoreId)
      .map((it) => {
        const s = timeToMin(it.time);
        // an item from the day before that runs past midnight blocks the early hours
        if (it.date === prev) return [0, s + durationOf(it) - 1440];
        return [Math.max(0, s - (it.travelMin || 0)), Math.min(1440, s + durationOf(it))];
      })
      .filter((b) => b[1] > b[0])
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const b of blocks) {
      const last = merged[merged.length - 1];
      if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
      else merged.push([b[0], b[1]]);
    }
    return merged;
  }
  function freeGaps(items, iso, fromMin, toMin, ignoreId) {
    const gaps = [];
    let cursor = fromMin;
    for (const [s, e] of busyBlocks(items, iso, ignoreId)) {
      if (e <= cursor) continue;
      if (s >= toMin) break;
      if (s > cursor) gaps.push([cursor, s]);
      cursor = Math.max(cursor, e);
      if (cursor >= toMin) break;
    }
    if (cursor < toMin) gaps.push([cursor, toMin]);
    return gaps.filter((g) => g[1] > g[0]);
  }
  // first start (on a 15-minute mark) where `durationMin` fits before `toMin`
  function findSlot(items, iso, durationMin, fromMin, toMin, ignoreId) {
    for (const [s, e] of freeGaps(items, iso, fromMin, toMin, ignoreId)) {
      const start = Math.ceil(s / 15) * 15;
      if (e - start >= durationMin) return start;
    }
    return null;
  }
  // greedy lanes so overlapping blocks sit side by side; input sorted by start
  function assignLanes(blocks) {
    const laneEnds = [];
    const lanes = blocks.map((b) => {
      let lane = laneEnds.findIndex((end) => end <= b.s);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.e); } else laneEnds[lane] = b.e;
      return lane;
    });
    return { lanes, count: Math.max(1, laneEnds.length) };
  }

  // ── quick add parser ─────────────────────────────────────────────────────
  const WEEKDAYS = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, weds: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
  };
  const MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
    july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12,
  };
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const WEEKDAY_RE = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|weds?|thu(?:rs?)?|fri|sat|sun)';
  const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const TYPE_TAGS = {
    personal: 'personal', appointment: 'appointment', appt: 'appointment', health: 'health',
    task: 'task', todo: 'task', adventure: 'adventure', fun: 'adventure',
  };
  const TYPE_HINTS = [
    ['health', /\b(dentist|doctors?|gp|hospital|physio|therapy|therapist|counsell?ing|pharmacy|chemist|meds|prescription|vaccine|jab|clinic|optician|nurse|blood test|check-?up)\b/i],
    ['appointment', /\b(meeting|appointment|appt|interview|haircut|hairdresser|barber|vet|mechanic|garage|mot|viewing|call with|zoom|teams call)\b/i],
    ['adventure', /\b(trip|holiday|hike|beach|party|concert|gig|festival|cinema|movie|film|flight|camping|day out|date night|birthday|wedding)\b/i],
  ];

  function ord(dayStr) { return Number(dayStr); }
  function makeDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  // a day/month with no year means the next time that date comes round
  function upcomingDate(today, m, d) {
    const y = Number(today.slice(0, 4));
    const thisYear = makeDate(y, m, d);
    if (thisYear && thisYear >= today) return thisYear;
    return makeDate(y + 1, m, d) || thisYear;
  }
  function fullYear(y) {
    const n = Number(y);
    return n < 100 ? 2000 + n : n;
  }
  function to24(h, suffix) {
    const s = suffix.toLowerCase().replace(/\./g, '');
    if (h === 12) return s === 'am' ? 0 : 12;
    return s === 'pm' ? h + 12 : h;
  }

  // an hour typed without am/pm: a lone digit 1-7 means the afternoon ("at 3",
  // "4:30"); 8-11 stay in the morning; "07:30" and 13+ are literal 24-hour times
  function guessHour(raw) {
    const h = Number(raw);
    return raw.length === 1 && h >= 1 && h <= 7 ? h + 12 : h;
  }
  const BEFORE_SUN = /\b(?:the|a|an|in|of|my|some|your|our|no|any)\s*$/i;

  // "dentist 3pm tomorrow" → { title: 'Dentist', date, time: '15:00', type: 'health', ... }
  function parseQuick(input, nowMs, opts) {
    const weekStart = opts && opts.weekStart != null ? opts.weekStart : 1;
    const now = new Date(nowMs);
    const today = toISO(now);
    const out = {
      title: '', date: null, endDate: null, time: null, durationMin: null, travelMin: null,
      type: null, assumedTomorrow: false,
    };
    let s = ` ${String(input == null ? '' : input).replace(/\s+/g, ' ').trim()} `;
    if (!s.trim()) return out;
    let ambiguous = false; // the hour had no am/pm, so "tonight" may still need to make it evening
    let evening = false;

    // Find the first match; if the handler accepts it, cut it (and a dangling
    // "at"/"on"/"from"/"by" just before it) out of the working text.
    function take(re, fn) {
      const m = re.exec(s);
      if (!m) return false;
      if (fn(m) === false) return false;
      const before = s.slice(0, m.index).replace(/\s(?:at|on|from|by|@)\s*$/i, ' ');
      s = `${before} ${s.slice(m.index + m[0].length)}`;
      return true;
    }

    // #type tags
    take(/(^|\s)#([a-z]+)\b/i, (m) => {
      const t = TYPE_TAGS[m[2].toLowerCase()];
      if (!t) return false;
      out.type = t;
    });

    // travel time with a unit: "travel 20m", "drive 1.5 hours", "20 min travel".
    // A bare "travel 20" is only read as minutes once everything else is cut (below),
    // so "drive 2 kids to school" keeps its words.
    const unitMin = (n, unit) => (/^h/i.test(unit) ? Math.round(Number(n) * 60) : Math.round(Number(n)));
    take(/\b(?:travel|drive|commute|journey)\s+(\d{1,3}(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?)(?=[\s,.!?])/i, (m) => {
      out.travelMin = unitMin(m[1], m[2]);
    }) || take(/\b(\d{1,3})\s*(m|mins?|minutes?)\s+(?:travel|drive|commute)\b/i, (m) => {
      out.travelMin = Number(m[1]);
    });

    // duration: "for 30m", "for 1.5 hours", "for 1h 30", "for an hour", "for half an hour"
    take(/\bfor\s+half\s+an?\s+hour\b/i, () => { out.durationMin = 30; })
      || take(/\bfor\s+(?:an?|one)\s+hour(\s+and\s+a\s+half)?\b/i, (m) => { out.durationMin = m[1] ? 90 : 60; })
      || take(new RegExp(`\\bfor\\s+(\\d+(?:\\.\\d+)?)\\s*(h|hrs?|hours?)(?:\\s*(\\d{1,2})(?:\\s*(?:m|mins?|minutes?))?(?!\\d)(?![/.]\\d)(?!(?:st|nd|rd|th)\\b)(?!\\s+(?:of\\s+)?${MONTH_RE}\\b))?(?=[\\s,.!?])`, 'i'), (m) => {
        out.durationMin = Math.round(Number(m[1]) * 60) + (m[3] ? Number(m[3]) : 0);
      })
      || take(/\bfor\s+(\d{1,4})\s*(m|mins?|minutes?)\b/i, (m) => { out.durationMin = Number(m[1]); });

    // time ranges: "6-7pm", "11-1pm", "3:30pm to 5pm", "15:00-16:30", "4:00-5:00"
    const setRange = (startMin, endMin) => {
      let len = endMin - startMin;
      if (len <= 0) len += 1440;
      out.time = minToTime(startMin);
      if (out.durationMin == null) out.durationMin = len;
    };
    take(/\b(?:from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to|till|until)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=[\s,.!?])/i, (m) => {
      const h1 = Number(m[1]); const h2 = Number(m[4]);
      const m1 = Number(m[2] || 0); const m2 = Number(m[5] || 0);
      if (h1 < 1 || h1 > 12 || h2 < 1 || h2 > 12 || m1 > 59 || m2 > 59) return false;
      const end = to24(h2, m[6]) * 60 + m2;
      let start;
      if (m[3]) start = to24(h1, m[3]) * 60 + m1;
      else {
        start = to24(h1, m[6]) * 60 + m1;
        if (start > end) start = to24(h1, /p/i.test(m[6]) ? 'am' : 'pm') * 60 + m1;
      }
      setRange(start, end);
    }) || take(/\b(?:from\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:-|–|—|to|till|until)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i, (m) => {
      const a = guessHour(m[1]);
      if (a < 12 && m[1][0] !== '0') ambiguous = true;
      setRange(a * 60 + Number(m[2]), guessHour(m[3]) * 60 + Number(m[4]));
    });

    // single times: "3pm", "3:30 pm", "7.30pm", "14:30", "4:30", "at 15.30", "noon", "at 3"
    const setGuessed = (rawHour, mm) => {
      const h = guessHour(rawHour);
      out.time = minToTime(h * 60 + mm);
      if (h < 12 && rawHour[0] !== '0') ambiguous = true;
    };
    if (!out.time) {
      take(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=[\s,.!?])/i, (m) => {
        const h = Number(m[1]); const mm = Number(m[2] || 0);
        if (h < 1 || h > 12 || mm > 59) return false;
        out.time = minToTime(to24(h, m[3]) * 60 + mm);
      })
      || take(/(?<![£$€\d.:])\b([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => { setGuessed(m[1], Number(m[2])); })
      || take(/(?:\bat\s+|@\s*)([01]?\d|2[0-3])\.([0-5]\d)\b/i, (m) => { setGuessed(m[1], Number(m[2])); })
      || take(/\b(noon|midday)\b/i, () => { out.time = '12:00'; })
      || take(new RegExp(`(?:\\bat\\s+|@\\s*)(\\d{1,2})(?=[\\s,.!?])(?!\\s+(?:${MONTH_RE}\\b|st\\b|nd\\b|rd\\b|th\\b))`, 'i'), (m) => {
        if (Number(m[1]) > 23) return false;
        setGuessed(m[1], 0);
      });
    }

    // dates. A weekday written right before an explicit date ("Fri 9 Oct") is
    // dropped; the date wins.
    take(new RegExp(`\\b${WEEKDAY_RE}\\b,?\\s+(?=\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b|${MONTH_RE}\\s+\\d|\\d{1,2}/\\d{1,2}\\b|\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}\\b)`, 'i'), () => {});

    // a range with no year: the current year while it still covers today or
    // later, else the next one
    const rangeDates = (mon1, d1, mon2, d2, yearStr) => {
      const years = yearStr ? [Number(yearStr)] : [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1];
      for (const y of years) {
        const start = makeDate(y, mon1, d1);
        let end = makeDate(y, mon2, d2);
        if (!start) continue;
        if (!end || end < start) end = makeDate(y + 1, mon2, d2);
        if (!end) continue;
        if (yearStr || end >= today) return [start, end];
      }
      return null;
    };
    const setRangeDates = (r) => {
      if (!r) return false;
      out.date = r[0];
      out.endDate = r[1] > r[0] ? r[1] : null;
    };
    const nextWeekDay = (target) => addDays(startOfWeek(today, weekStart), 7 + ((target - weekStart + 7) % 7));

    take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to|until|till)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i'), (m) => {
      const mon = MONTHS[m[3].toLowerCase()];
      return setRangeDates(rangeDates(mon, ord(m[1]), mon, ord(m[2]), m[4]));
    })
    || take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\s*(?:-|–|to|until|till)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i'), (m) => {
      return setRangeDates(rangeDates(MONTHS[m[2].toLowerCase()], ord(m[1]), MONTHS[m[4].toLowerCase()], ord(m[3]), m[5]));
    })
    || take(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to|until|till)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i'), (m) => {
      const mon = MONTHS[m[1].toLowerCase()];
      return setRangeDates(rangeDates(mon, ord(m[2]), mon, ord(m[3]), m[4]));
    })
    || take(/\b(?:the\s+)?day\s+after\s+tomorrow\b/i, () => { out.date = addDays(today, 2); })
    || take(/\b(today|tonight|this\s+evening)\b/i, (m) => {
      out.date = today;
      if (/^(tonight|this)/i.test(m[1])) evening = true;
    })
    || take(/\b(tomorrow|tmrw|tmr|tomoz|2moro)\b/i, () => { out.date = addDays(today, 1); })
    || take(/\bin\s+(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?)\b/i, (m) => {
      const n = WORD_NUM[m[1].toLowerCase()] || Number(m[1]);
      const unit = m[2].toLowerCase();
      out.date = unit.startsWith('day') ? addDays(today, n)
        : unit.startsWith('week') ? addDays(today, 7 * n) : addMonths(today, n);
    })
    || take(/\bnext\s+weekend\b/i, () => { out.date = nextWeekDay(6); })
    || take(new RegExp(`\\b${WEEKDAY_RE}\\s+next\\s+week\\b`, 'i'), (m) => { out.date = nextWeekDay(WEEKDAYS[m[1].toLowerCase()]); })
    || take(/\bnext\s+week\b/i, () => { out.date = addDays(startOfWeek(today, weekStart), 7); })
    || take(/\b(?:this\s+)?weekend\b/i, () => {
      const wd = weekday(today);
      out.date = wd === 6 || wd === 0 ? today : addDays(today, 6 - wd);
    })
    || take(/(?<![£$€\d.])\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/, (m) => {
      // UK order: day/month
      const d = Number(m[1]); const mon = Number(m[2]);
      const iso = m[3] ? makeDate(fullYear(m[3]), mon, d) : (makeDate(2000, mon, d) ? upcomingDate(today, mon, d) : null);
      if (!iso) return false;
      out.date = iso;
    })
    || take(/(?<![£$€\d.])\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/, (m) => {
      const iso = makeDate(fullYear(m[3]), Number(m[2]), Number(m[1]));
      if (!iso) return false;
      out.date = iso;
    })
    || take(new RegExp(`\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i'), (m) => {
      const mon = MONTHS[m[2].toLowerCase()];
      const iso = m[3] ? makeDate(Number(m[3]), mon, ord(m[1])) : upcomingDate(today, mon, ord(m[1]));
      if (!iso) return false;
      out.date = iso;
    })
    || take(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i'), (m) => {
      const mon = MONTHS[m[1].toLowerCase()];
      const iso = m[3] ? makeDate(Number(m[3]), mon, ord(m[2])) : upcomingDate(today, mon, ord(m[2]));
      if (!iso) return false;
      out.date = iso;
    })
    || take(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i, (m) => {
      const d = Number(m[1]);
      const y = Number(today.slice(0, 4)); const mon = Number(today.slice(5, 7));
      let iso = makeDate(y, mon, d);
      if (!iso || iso < today) {
        const nextMonth = addMonths(startOfMonth(today), 1);
        iso = makeDate(Number(nextMonth.slice(0, 4)), Number(nextMonth.slice(5, 7)), d);
      }
      if (!iso) return false;
      out.date = iso;
    })
    || take(new RegExp(`\\b(?:(next|this|on)\\s+)?${WEEKDAY_RE}\\b`, 'i'), (m) => {
      const word = m[2].toLowerCase();
      // "sun" and "sat" are also ordinary words ("sun cream", "sat nav", "sit in
      // the sun"); only read them as days when they look like one
      if ((word === 'sun' || word === 'sat') && !m[1]) {
        const rest = s.slice(m.index + m[0].length);
        if (!/^\s*($|\d|at\b|@)/i.test(rest) || BEFORE_SUN.test(s.slice(0, m.index))) return false;
      }
      const target = WEEKDAYS[word];
      if (m[1] && m[1].toLowerCase() === 'next') out.date = nextWeekDay(target);
      else out.date = addDays(today, (target - weekday(today) + 7) % 7);
    });

    // a time written with a dot and no "at" ("10.30", "15.30"); it can't be a date now
    if (!out.time) {
      take(/(?<![£$€\d.:])\b([01]?\d|2[0-3])\.([0-5]\d)\b(?![.\d])/, (m) => { setGuessed(m[1], Number(m[2])); });
    }

    // "tonight 8" / "dinner at 8 tonight" mean the evening
    if (evening && ambiguous && out.time) {
      const t = timeToMin(out.time);
      if (t < 720) out.time = minToTime(t + 720);
    }

    // a bare "travel 20" is minutes, once nothing else is left after it
    take(/\b(?:travel|drive|commute|journey)\s+(\d{1,3})(?=\s*$)/i, (m) => { out.travelMin = Number(m[1]); });

    // a time with no day: today, unless that time has already gone
    if (out.time && !out.date) {
      const nowMin = minutesOfDay(now);
      if (timeToMin(out.time) <= nowMin) {
        out.date = addDays(today, 1);
        out.assumedTomorrow = true;
      } else out.date = today;
    }

    // tidy what's left into a title. Only a connector word cut off a date or
    // time was dropped above, so "check in" and "turn heating on" stay whole.
    let title = s.replace(/\s+/g, ' ').trim().replace(/^[-–,]+\s*|\s*[-–,]+$/g, '').trim();
    title = title.replace(/\s+([,.!?])/g, '$1');
    if (/^(at|on|for|in|by|from|this|next|the|@)$/i.test(title)) title = '';
    out.title = title ? title.charAt(0).toUpperCase() + title.slice(1) : '';

    if (!out.type) {
      const hint = TYPE_HINTS.find(([, re]) => re.test(out.title));
      out.type = hint ? hint[0] : (out.date ? 'personal' : 'task');
    }
    return out;
  }

  // ── store ────────────────────────────────────────────────────────────────
  // One JSON blob in storage. Every write bumps updatedAt (strictly increasing per
  // record), and deletes are soft, so a backup merge — or Firebase later — can
  // simply keep the newest copy of each record.
  function createStore(options) {
    const opts = options || {};
    const storage = opts.storage || null;
    const key = opts.key || 'easycal.v1';
    const clock = opts.now || (() => Date.now());
    const subs = new Set();
    let saveOk = !!storage;
    let state = load();

    function blank() {
      return { version: 1, items: {}, settings: { ...DEFAULT_SETTINGS }, meta: { deviceId: newId() } };
    }
    function sanitize(data) {
      const st = blank();
      if (!data || typeof data !== 'object') return st;
      const list = Array.isArray(data.items) ? data.items : Object.values(data.items || {});
      for (const raw of list) {
        const it = normalizeItem(raw);
        st.items[it.id] = it;
      }
      st.settings = sanitizeSettings(data.settings);
      if (data.meta && typeof data.meta === 'object') st.meta = { ...st.meta, ...data.meta };
      return st;
    }
    function load() {
      if (!storage) return blank();
      try {
        const raw = storage.getItem(key);
        return raw ? sanitize(JSON.parse(raw)) : blank();
      } catch (e) {
        return blank();
      }
    }
    function save() {
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify(state));
        saveOk = true;
      } catch (e) {
        saveOk = false;
      }
    }
    function emit(change) { subs.forEach((fn) => fn(change)); }
    function commit(change) { save(); emit(change); }
    function stamp(prev) {
      const t = clock();
      return prev && t <= prev ? prev + 1 : t;
    }

    return {
      all() { return Object.values(state.items).filter((it) => !it.deleted); },
      get(id) {
        const it = state.items[id];
        return it && !it.deleted ? it : null;
      },
      add(fields) {
        const t = stamp(0);
        const it = normalizeItem({ ...fields, id: newId(), status: 'open', deleted: false, createdAt: t, updatedAt: t });
        state.items[it.id] = it;
        commit({ type: 'add', ids: [it.id] });
        return it;
      },
      update(id, patch) {
        const cur = state.items[id];
        if (!cur) return null;
        const it = normalizeItem({ ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: stamp(cur.updatedAt) });
        state.items[id] = it;
        commit({ type: 'update', ids: [id] });
        return it;
      },
      updateMany(ids, patch) {
        const done = [];
        for (const id of ids) {
          const cur = state.items[id];
          if (!cur) continue;
          state.items[id] = normalizeItem({ ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: stamp(cur.updatedAt) });
          done.push(id);
        }
        if (done.length) commit({ type: 'update', ids: done });
        return done.length;
      },
      remove(id) {
        const cur = state.items[id];
        if (!cur || cur.deleted) return false;
        state.items[id] = { ...cur, deleted: true, updatedAt: stamp(cur.updatedAt) };
        commit({ type: 'remove', ids: [id] });
        return true;
      },
      restore(id) {
        const cur = state.items[id];
        if (!cur || !cur.deleted) return false;
        state.items[id] = { ...cur, deleted: false, updatedAt: stamp(cur.updatedAt) };
        commit({ type: 'restore', ids: [id] });
        return true;
      },
      settings() { return { ...state.settings }; },
      setSettings(patch) {
        state.settings = sanitizeSettings({ ...state.settings, ...patch });
        commit({ type: 'settings' });
        return { ...state.settings };
      },
      meta(k) { return state.meta[k]; },
      setMeta(k, v) {
        state.meta[k] = v;
        save();
      },
      exportData() {
        return {
          app: 'easy-cal',
          version: 1,
          exportedAt: new Date(clock()).toISOString(),
          items: Object.values(state.items),
          settings: { ...state.settings },
        };
      },
      importData(data) {
        if (!data || typeof data !== 'object' || data.app !== 'easy-cal' || !Array.isArray(data.items)) {
          throw new Error('That file is not an Easy Cal backup.');
        }
        const result = mergeItems(state.items, data.items);
        if (result.added || result.updated) commit({ type: 'import' });
        return result;
      },
      clearAll() {
        state = blank();
        commit({ type: 'clear' });
      },
      reload() {
        state = load();
        emit({ type: 'reload' });
      },
      canSave() { return saveOk; },
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
    };
  }

  function sanitizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS };
    const r = raw && typeof raw === 'object' ? raw : {};
    if (typeof r.clock24 === 'boolean') s.clock24 = r.clock24;
    if (r.weekStart === 0 || r.weekStart === 1) s.weekStart = r.weekStart;
    if (typeof r.sound === 'boolean') s.sound = r.sound;
    const dd = cleanInt(r.defaultDuration, 5, 480);
    if (dd) s.defaultDuration = dd;
    const fm = cleanInt(r.focusMin, 1, 180);
    if (fm) s.focusMin = fm;
    if (VIEWS.includes(r.view)) s.view = r.view;
    if (r.filter === 'next' || r.filter === 'all') s.filter = r.filter;
    if (typeof r.full === 'boolean') s.full = r.full;
    return s;
  }

  // newest updatedAt wins per id; returns counts for a friendly message
  function mergeItems(itemsById, incoming) {
    let added = 0;
    let updated = 0;
    for (const raw of incoming) {
      if (!raw || raw.id == null) continue;
      const it = normalizeItem(raw);
      const cur = itemsById[it.id];
      if (!cur) {
        itemsById[it.id] = it;
        if (!it.deleted) added++;
      } else if (it.updatedAt > cur.updatedAt) {
        itemsById[it.id] = it;
        updated++;
      }
    }
    return { added, updated };
  }

  return {
    TYPES, TYPE_LABEL, STATUSES, VIEWS, DEFAULT_DURATION, DEFAULT_SETTINGS,
    WD_SHORT, WD_LONG, MON_SHORT, MON_LONG,
    pad2, toISO, fromISO, isISO, isTime, addDays, daysBetween, weekday, startOfWeek,
    daysInMonth, startOfMonth, endOfMonth, addMonths, timeToMin, minToTime, minutesOfDay, atTime,
    fmtTime, fmtDuration, fmtDay, fmtDateLong, fmtShortDate,
    newId, normalizeItem, itemEndDate, isMultiDay, isTimed, isVisible, durationOf, startMs, endMs,
    covers, dueToSlip, shiftTime, moveToDate, compareItems, occurrences,
    rangeFor, stepAnchor, rightNow, leaveAtMs, pickCandidates,
    busyBlocks, freeGaps, findSlot, assignLanes,
    parseQuick, createStore, sanitizeSettings, mergeItems,
  };
});
