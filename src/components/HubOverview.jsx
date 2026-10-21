import { Select } from './Select.jsx';
import { HubTimeline } from './HubTimeline.jsx';
import { QuickReminders } from './QuickReminders.jsx';
import { SportsCalendarDialog } from './SportsCalendar.jsx';
import { HubNotes } from './HubNotes.jsx';
import { useState } from 'react';
import { dateKey } from '../../shared/calendar.js';

// The hub is a glanceable overview. Full lists and editing stay in their feature screens.
export function HubOverview({
  items,
  chores = [],
  onSaveChore,
  notes,
  members,
  showAgenda,
  showNotes,
  onOpenEvent,
  now,
  onSaveNote,
  onDeleteNote,
  sportsItems = [],
  sportsError,
  weekStart = 0,
  repository,
}) {
  const [sportsOpen, setSportsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [person, setPerson] = useState('everyone');
  const [weekOffset, setWeekOffset] = useState(0);
  const anchor = new Date(now);
  anchor.setDate(anchor.getDate() + weekOffset * 7);
  const selected = dateKey(anchor);
  const people = [{ id: 'everyone', title: 'Everyone', color: null }, ...members];
  const selectedPerson = members.some((member) => member.id === person) ? person : 'everyone';
  function choosePerson(id) {
    setPerson(id);
  }
  function changeWeek(direction) {
    setWeekOffset((offset) => offset + direction);
  }
  return (
    <div className="hub-overview">
      {showAgenda && (
        <section className="panel hub-plans">
          <div className="panel-heading">
            <div>
              <h2>Our week at a glance</h2>
            </div>
            <div className="actions">
              {repository && <QuickReminders repository={repository} />}
              <button onClick={() => setSportsOpen(true)}>Sports calendar</button>
              {showNotes && (
                <button onClick={() => setNotesOpen(true)}>Notes ({notes.length})</button>
              )}
              <Select
                aria-label="Choose whose plans to view"
                value={selectedPerson}
                onChange={(event) => choosePerson(event.target.value)}
              >
                {people.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.title}
                  </option>
                ))}
              </Select>
              <a href="#calendar">Full calendar</a>
            </div>
          </div>
          <HubTimeline
            items={items}
            chores={chores}
            members={members}
            person={selectedPerson}
            selected={selected}
            onChangeWeek={changeWeek}
            now={now}
            onOpenEvent={onOpenEvent}
            onSaveChore={onSaveChore}
          />
        </section>
      )}
      {!showAgenda && repository && <QuickReminders repository={repository} />}
      {!showAgenda && showNotes && (
        <button onClick={() => setNotesOpen(true)}>Open notes ({notes.length})</button>
      )}
      {sportsOpen && (
        <SportsCalendarDialog
          items={sportsItems}
          error={sportsError}
          weekStart={weekStart}
          onClose={() => setSportsOpen(false)}
        />
      )}
      {!showAgenda && <button onClick={() => setSportsOpen(true)}>Sports calendar</button>}
      {notesOpen && (
        <HubNotes
          items={notes}
          onSave={onSaveNote}
          onDelete={onDeleteNote}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  );
}
