# Ezycal

A simple calendar. Single page: `index.html` (logic in `core.js`). It also shows as the
Ezycal tab inside Mission Possible Plus.

## Moving events
Drag an event to another day: with a mouse, press and move it; on a phone, press and hold,
then move. Drop it on a day, or on an hour in the Day view to change its time. While
dragging, a bar at the bottom offers **Day before**, **Next day** and **Next week**, and
holding it over the ‹ › arrows turns the page. Every move can be undone from the message
that pops up.

## Sahara skin
Open Ezycal with `?theme=sahara` (e.g. `index.html?theme=sahara`, or `?embed=1&theme=sahara`
inside another app) and it wears the Sahara app's look: night purple, a dotted background,
chunky borders with hard shadows and a pixel font for headings. It's the same calendar with the
same events and sync; only the look changes. Mission Possible Pro's Sahara section shows Ezycal
this way. Without the parameter Ezycal looks exactly as before.

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
