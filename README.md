# Ezycal

A simple calendar. Single page: `index.html` (logic in `core.js`). It also shows as the
Ezycal tab inside Mission Possible Plus.

## Day planner
**Day** shows one day hour by hour. Timed events are blocks sized by how long they take (pick **How long** when adding one), overlaps sit side by side, untimed events sit in an **All day** strip, and a pink line marks now. Tap an empty hour (top half = :00, bottom half = :30) to add an event at that time.

## Data
Saved in this browser. **Save backup** and **Load backup** (bottom of the page) move events
between devices by hand; loading merges.

## ☁️ Sync across your phone and other devices
**Sign in to sync** (bottom of the page) keeps every device on the same calendar. It uses
the same free Firebase project and Google sign-in as Mission Board and The Hood, so signing
in on the board signs you in here too.

Events merge by id, the newest edit wins, and a deleted event stays deleted, so two devices
never overwrite each other. View and display settings stay per device.

One-time setup: in **Firestore → Rules** add the `calendar` rule. The full set is in
[`firestore.rules`](https://github.com/asciikat/mission-possible-plus/blob/main/firestore.rules)
in Mission Possible Plus. Your calendar is one private document per Google account.
Put `asciikat.github.io` under Authentication → Authorized domains if it isn't there already.
