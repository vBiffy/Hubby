import { FamilySetup } from './components/FamilySetup.jsx';
import { useEffect, useState } from 'react';
import { Groceries } from './components/Groceries.jsx';
import { Agenda } from './components/Agenda.jsx';
import { Notes } from './components/Notes.jsx';
import { Calendar, dayKey } from './components/Calendar.jsx';
import { EventDetails } from './components/EventDetails.jsx';
import { EventEditor } from './components/EventEditor.jsx';
import { Weather, WeatherSummary } from './components/Weather.jsx';
import { useWeather } from './hooks/useWeather.js';
import { useSportsCalendar } from './hooks/useSportsCalendar.js';
import { Sports } from './components/Sports.jsx';
import { Customize } from './components/Customize.jsx';
import { HubOverview } from './components/HubOverview.jsx';
import { ReminderCenter } from './components/ReminderCenter.jsx';
import { useReminders } from './hooks/useReminders.js';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { moveOccurrence, occurrences, overlaps, localDateTime } from '../shared/calendar.js';
function calendarConflicts(draft, items) {
  if (!draft.endsAt && !draft.allDay) return [];
  const start = new Date(draft.startsAt);
  const end = new Date(draft.endsAt || draft.startsAt);
  if (draft.allDay) {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  const candidate = { ...draft, startsAt: start.toISOString(), endsAt: end.toISOString() };
  return occurrences(items, start, end).filter(
    (item) => item.id !== draft.id && overlaps(candidate, item),
  );
}
const pageTitles = {
  calendar: 'A little planning goes a long way',
  notes: 'The family notebook',
  groceries: 'Stock up on the little things',
  weather: 'A look outside',
  sports: 'Make room for game day',
  settings: 'Make yourself at home',
};

const defaults = {
  name: 'Our kitchen',
  accent: '#264e42',
  dark: false,
  large: false,
  weekStart: 0,
  notes: true,
  agenda: true,
  sportsFavorites: {},
  sportsCalendarTeams: {},
};
function readSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('hubby.settings') || '{}') };
  } catch {
    return defaults;
  }
}

// Shell owns composition and navigation. Feature components only receive their
// own data/actions. Hash navigation also supports direct #notes/#calendar links.
export function App({ repository }) {
  const weatherProps = useWeather(repository);
  const [tab, setTab] = useState(location.hash.slice(1) || 'home');
  const [settings, setSettings] = useState(readSettings);
  // Calendar inclusion is opt-in and independent of favorite sorting in Sports.
  const calendarTeams = Object.fromEntries(
    Object.entries(settings.sportsFavorites || {}).map(([league, ids]) => [
      league,
      ids.filter((id) => (settings.sportsCalendarTeams?.[league] || []).includes(id)),
    ]),
  );
  const sportsCalendar = useSportsCalendar(repository, calendarTeams);
  const [data, setData] = useState({ notes: [], events: [], groceries: [], members: [] });
  const [loaded, setLoaded] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const calendarEvents = [...data.events, ...sportsCalendar.events];
  const reminderProps = useReminders(data.events);
  const [status, setStatus] = useState('Connecting…');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [details, setDetails] = useState(null);
  const selectedPlan = draft || details;
  const [scope, setScope] = useState('occurrence');
  const [undo, setUndo] = useState(null);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 30000);
    return () => clearTimeout(timer);
  }, [undo]);
  async function undoChange() {
    setBusy(true);
    try {
      const current = await repository.list('events');
      const live = current.find((item) => item.id === undo.before.id);
      if (undo.deleted) {
        const restored = await repository.restore(undo.before);
        setData((previous) => ({ ...previous, events: [restored, ...previous.events] }));
      } else {
        if (!live || live.updatedAt !== undo.after.updatedAt) {
          throw new Error('This plan changed again. Undo would overwrite a newer edit.');
        }
        await save('events', undo.before);
      }
      setUndo(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const listener = () => setTab(location.hash.slice(1) || 'home');
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('hubby.settings', JSON.stringify(settings));
    } catch {
      setError('Browser settings could not be saved.');
    }
  }, [settings]);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [notes, events, groceries, members, health] = await Promise.all([
          repository.list('notes'),
          repository.list('events'),
          repository.list('groceries'),
          repository.list('members'),
          repository.request('health'),
        ]);
        if (active) {
          setData({ notes, events, groceries, members });
          setLoaded(true);
          if (!members.length) setSettingUp(true);
          setStatus(
            health.storage === 'memory'
              ? 'Temporary demo · not persisted'
              : 'Connected to PostgreSQL',
          );
          setError('');
        }
      } catch (err) {
        if (active) {
          setError(err.message);
          setStatus('Disconnected · showing last loaded data');
        }
      }
    }
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [repository]);
  async function save(kind, item) {
    const saved = await repository.save(kind, item);
    setData((previous) => ({
      ...previous,
      [kind]: [saved, ...previous[kind].filter((x) => x.id !== saved.id)],
    }));
    return saved;
  }
  async function remove(kind, id) {
    await repository.remove(kind, id);
    setData((previous) => ({ ...previous, [kind]: previous[kind].filter((x) => x.id !== id) }));
  }
  async function moveEvent(occurrence, day) {
    const series = data.events.find((event) => event.id === occurrence.id);
    const after = await save('events', moveOccurrence(series, occurrence, day));
    setUndo({ before: series, after, label: 'Plan moved' });
  }
  async function deletePlan() {
    setBusy(true);
    try {
      const before = data.events.find((item) => item.id === selectedPlan.id);
      if (scope === 'occurrence' && selectedPlan.occurrenceDate) {
        const after = await save('events', {
          ...before,
          excludedDates: [
            ...new Set([...(before.excludedDates || []), selectedPlan.occurrenceDate]),
          ],
        });
        setUndo({ before, after, label: 'Occurrence deleted' });
      } else {
        await remove('events', selectedPlan.id);
        setUndo({ before, deleted: true, label: 'Plan deleted' });
      }
      setConfirmDelete(false);
      setDetails(null);
      setDraft(null);
      setError('');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  function showEvent(item) {
    setError('');
    if (!item) {
      editEvent(null);
      return;
    }
    setScope('occurrence');
    setDetails(item);
  }
  function editEvent(item, day = dayKey(new Date())) {
    setDetails(null);
    setError('');
    // datetime-local represents local wall time. Convert to ISO only on save,
    // and back to local wall time on edit to avoid timezone shifts.
    // Series edits use the source; occurrence edits retain the clicked date and identity.
    if (item && scope === 'series') {
      item = data.events.find((event) => event.id === item.id) || item;
    }
    const date = item ? new Date(item.startsAt) : null;
    const hour = date ? String(date.getHours()).padStart(2, '0') : '';
    const minute = date ? String(date.getMinutes()).padStart(2, '0') : '';

    setDraft(
      item
        ? {
            ...item,
            endsAt: item.endsAt ? localDateTime(item.endsAt) : '',
            startsAt: `${dayKey(date)}T${hour}:${minute}`,
          }
        : {
            title: '',
            type: 'event',
            startsAt: `${day}T09:00`,
            done: false,
            repeat: 'none',
            repeatUntil: '',
            memberId: null,
            reminderMinutes: 15,
          },
    );
  }
  async function submitEvent(event) {
    event.preventDefault();
    setBusy(true);

    try {
      const changes = {
        ...draft,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      };
      const series = data.events.find((item) => item.id === draft.id);
      const saved =
        draft.occurrenceDate && scope === 'occurrence'
          ? {
              ...series,
              occurrenceOverrides: {
                ...series.occurrenceOverrides,
                [draft.occurrenceDate]: changes,
              },
            }
          : changes;
      await save('events', saved);
      setDraft(null);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const notesProps = {
    items: data.notes,
    onSave: (item) => save('notes', item),
    onDelete: (id) => remove('notes', id),
  };
  const agendaProps = {
    items: calendarEvents,
    onEdit: showEvent,
    members: data.members,
    onSave: (item) => {
      const series = data.events.find((event) => event.id === item.id);
      if (!item.occurrenceDate) return save('events', item);
      const completed = new Set(series.completedDates || []);
      if (item.done) completed.add(item.occurrenceDate);
      else completed.delete(item.occurrenceDate);
      return save('events', { ...series, completedDates: [...completed] });
    },
    onDelete: (item) => {
      showEvent(item);
      setConfirmDelete(true);
    },
  };
  // Gate the shell itself rather than placing a dismissible overlay over active screens.
  // Failed initial loading offers retry instead of treating unknown data as an empty family.
  if (!loaded || settingUp || !data.members.length) {
    return (
      <div
        className={`app setup-shell ${settings.dark ? 'dark' : ''}`}
        style={{ '--accent': settings.accent }}
      >
        {!loaded ? (
          <main className="family-setup">
            <h1>Connecting to your kitchen</h1>
            <p role="status">{error || 'Loading family members...'}</p>
            {error && <button onClick={() => location.reload()}>Try again</button>}
          </main>
        ) : (
          <FamilySetup
            members={data.members}
            onSave={(member) => save('members', member)}
            onContinue={() => setSettingUp(false)}
          />
        )}
      </div>
    );
  }
  return (
    <div
      className={`app ${settings.dark ? 'dark' : ''} ${settings.large ? 'large' : ''}`}
      style={{ '--accent': settings.accent }}
    >
      <aside>
        <a className="brand" href="#home">
          <span className="brand-icon">h.</span>hubby
        </a>
        <p className="eyebrow">A LITTLE MORE TOGETHER</p>
        <nav>
          {[
            ['home', '⌂', 'Kitchen hub'],
            ['calendar', '▦', 'Calendar'],
            ['notes', '≡', 'Notes'],
            ['groceries', '\u2637', 'Groceries'],
            ['weather', '\u2600', 'Weather'],
            ['sports', '\u26bd', 'Sports'],
            ['settings', '⚙', 'Customize'],
          ].map(([id, icon, label]) => (
            <a key={id} href={`#${id}`} className={tab === id ? 'active' : ''}>
              <span>{icon}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          {status}
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">
              {clock.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <h1>{tab === 'home' ? settings.name : pageTitles[tab] || pageTitles.calendar}</h1>
          </div>
          {tab === 'home' && <WeatherSummary {...weatherProps} />}
          {tab === 'home' && (
            <button className="primary" onClick={() => editEvent(null)}>
              + Add a plan
            </button>
          )}
          <time>
            {clock.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </time>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {['home', 'calendar'].includes(tab) && sportsCalendar.error && (
          <p role="status" className="hint">
            {sportsCalendar.error}
          </p>
        )}
        {tab === 'home' && (
          <HubOverview
            items={calendarEvents}
            notes={data.notes}
            members={data.members}
            showAgenda={settings.agenda}
            showNotes={settings.notes}
            onOpenEvent={showEvent}
            now={clock}
          />
        )}
        {tab === 'calendar' && (
          <>
            <Calendar
              items={calendarEvents}
              members={data.members}
              weekStart={Number(settings.weekStart)}
              onSelect={(day) => editEvent(null, day)}
              onEdit={showEvent}
              onMove={moveEvent}
            />
            <Agenda {...agendaProps} />
          </>
        )}
        {tab === 'weather' && <Weather {...weatherProps} />}
        {tab === 'sports' && (
          <Sports repository={repository} favorites={settings.sportsFavorites} />
        )}
        {tab === 'notes' && <Notes {...notesProps} />}
        {tab === 'groceries' && (
          <Groceries
            items={data.groceries}
            onSave={(item) => save('groceries', item)}
            onDelete={(id) => remove('groceries', id)}
          />
        )}
        {tab === 'settings' && (
          <Customize
            settings={settings}
            onChange={setSettings}
            onReset={() => setSettings(defaults)}
            members={data.members}
            onSaveMember={(member) => save('members', member)}
            onDeleteMember={(id) => remove('members', id)}
            repository={repository}
          />
        )}

        {!['home', 'calendar', 'notes', 'groceries', 'weather', 'sports', 'settings'].includes(
          tab,
        ) && (
          <p>
            View not found. <a href="#home">Go home</a>
          </p>
        )}
        {details && (
          <EventDetails
            item={details}
            members={data.members}
            busy={busy}
            error={error}
            scope={scope}
            onScope={setScope}
            onEdit={() => editEvent(details)}
            onClose={() => setDetails(null)}
            onDelete={() => {
              setError('');
              setConfirmDelete(true);
            }}
          />
        )}
        {draft && (
          <EventEditor
            members={data.members}
            draft={draft}
            occurrenceOnly={scope === 'occurrence' && Boolean(draft.occurrenceDate)}
            conflicts={calendarConflicts(draft, data.events)}
            onChange={setDraft}
            onSubmit={submitEvent}
            onCancel={() => setDraft(null)}
            onDelete={() => {
              setError('');
              setConfirmDelete(true);
            }}
            weekStart={Number(settings.weekStart)}
            busy={busy}
            error={error}
          />
        )}
        {confirmDelete && selectedPlan && (
          <ConfirmDialog
            title={`Delete ${selectedPlan.type === 'reminder' ? 'Reminder' : 'Event'}?`}
            message={`Remove '${selectedPlan.title}'? ${
              scope === 'series' && selectedPlan.repeat && selectedPlan.repeat !== 'none'
                ? 'This will delete the entire recurring series and all its occurrences.'
                : `This will remove this ${selectedPlan.type === 'reminder' ? 'reminder' : 'event'} from your calendar.`
            } You can undo this for 30 seconds.`}
            confirmLabel="Delete"
            cancelLabel="Keep it"
            busy={busy}
            error={error}
            onConfirm={deletePlan}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </main>
      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          <button disabled={busy} onClick={undoChange}>
            Undo
          </button>
          <button aria-label="Close undo notification" onClick={() => setUndo(null)}>
            Close
          </button>
        </div>
      )}
      {!draft && !details && <ReminderCenter {...reminderProps} members={data.members} />}
    </div>
  );
}
