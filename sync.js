/* Ezycal cloud sync (optional). Firebase's free tier: Google sign-in plus one small
   document per person at calendar/{uid}. Switches on only when firebase-config.js has
   the project's settings. Events merge by id, newest edit wins, and a deleted event
   stays deleted (the store keeps a tombstone), so two devices never overwrite each other. */
(function () {
  'use strict';
  const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

  // Does the cloud copy lack something this device has?
  function cloudIsBehind(local, remote) {
    const theirs = new Map(remote.map((it) => [String(it.id), it]));
    return local.some((it) => {
      const t = theirs.get(String(it.id));
      return !t || it.updatedAt > (Number(t.updatedAt) || 0);
    });
  }

  function attach(opts) {
    const cfg = window.MISSION_BOARD_FIREBASE;
    if (!cfg || !cfg.apiKey) return;
    const { store, toast, box, statusEl, btn } = opts;
    box.hidden = false;
    const deviceId = Math.random().toString(36).slice(2, 10); // per open page, to ignore our own echoes
    let auth = null, docRef = null, user = null, unsub = null;
    let ready = false, applying = false, timer = 0;
    const setStatus = (t) => { statusEl.textContent = t; };
    const who = () => (user && user.email) || 'your account';
    const local = () => store.exportData().items;

    const loadScript = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.append(s);
    });

    function parse(v) {
      if (!v || typeof v.items !== 'string') return null;
      try { const a = JSON.parse(v.items); return Array.isArray(a) ? a : null; } catch (e) { return null; }
    }

    function apply(items, quiet) {
      let r = { added: 0, updated: 0 };
      applying = true;
      try { r = store.importData({ app: 'easy-cal', items }); } finally { applying = false; }
      if (!quiet && (r.added || r.updated)) toast('Synced · ' + [r.added && r.added + ' new', r.updated && r.updated + ' updated'].filter(Boolean).join(' · '));
      if (cloudIsBehind(local(), items)) schedule(1500);
      else setStatus('Synced · ' + who());
    }

    function schedule(delay) {
      if (!ready || applying) return;
      clearTimeout(timer);
      timer = setTimeout(push, delay == null ? 1200 : delay);
      setStatus('Saving…');
    }
    async function push() {
      if (!ready) return;
      try {
        await docRef.set({ items: JSON.stringify(local()), device: deviceId, updatedAt: Date.now() });
        setStatus('Synced · ' + who());
      } catch (e) {
        setStatus("Sync failed · it'll retry on your next change");
      }
    }

    async function start() {
      docRef = firebase.firestore().collection('calendar').doc(user.uid);
      setStatus('Syncing…');
      const slow = setTimeout(() => {
        if (!ready) setStatus('Still connecting · if this stays, allow this site in your ad or tracker blocker');
      }, 15000);
      try {
        const snap = await docRef.get();
        clearTimeout(slow);
        ready = true;
        const remote = snap.exists ? parse(snap.data()) : null;
        if (remote) apply(remote, true); else await push();
        unsub = docRef.onSnapshot((s) => {
          if (!s.exists || (s.metadata && s.metadata.hasPendingWrites)) return;
          const v = s.data();
          const items = parse(v);
          if (!items || v.device === deviceId) return;
          apply(items, false);
        }, () => setStatus('Sync paused · reload to reconnect'));
      } catch (e) {
        clearTimeout(slow);
        ready = false;
        const code = (e && e.code) || 'unknown';
        setStatus(code === 'permission-denied'
          ? 'Sync blocked · add the calendar rule in Firestore (see README)'
          : code === 'unavailable'
            ? "Can't reach the database · check your connection or ad blocker, then reload"
            : 'Sync failed (' + code + ') · reload to try again');
      }
    }
    function stop() {
      ready = false;
      clearTimeout(timer);
      if (unsub) unsub();
      unsub = null;
    }

    async function init() {
      btn.disabled = true;
      setStatus('Connecting…');
      try {
        await loadScript(FB + 'firebase-app-compat.js');
        await loadScript(FB + 'firebase-auth-compat.js');
        await loadScript(FB + 'firebase-firestore-compat.js');
        firebase.initializeApp(cfg);
        auth = firebase.auth();
        auth.onAuthStateChanged((u) => {
          user = u;
          btn.disabled = false;
          btn.textContent = u ? 'Sign out' : 'Sign in to sync';
          if (u) start();
          else { stop(); setStatus('Sync off · sign in on each device'); }
        });
      } catch (e) {
        btn.disabled = false;
        setStatus("Couldn't reach the sync service · tap to retry");
      }
    }

    btn.addEventListener('click', async () => {
      if (!auth) { init(); return; }
      if (user) { await auth.signOut(); toast('Signed out · this device keeps its copy'); return; }
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        const code = (e && e.code) || '';
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') auth.signInWithRedirect(provider);
        else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') toast("Sign-in didn't finish");
      }
    });

    store.subscribe((change) => { if (!applying && change && change.type !== 'reload') schedule(); });
    init();
  }

  window.EasySync = { attach, cloudIsBehind };
})();
