import { ChoreRow } from './Chores.jsx';
import { activeChores } from '../../shared/chores.js';
import { QuickReminders } from './QuickReminders.jsx';
import { SportsCalendarDialog } from './SportsCalendar.jsx';
import { HubNotes } from './HubNotes.jsx';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  dateKey,
  occurrences,
  occursOnDay,
  planStyle,
  assignedMemberIds,
} from '../../shared/calendar.js';

const timeLabel = (item) =>
  item.sportsTimeTbd
    ? 'Time TBD'
    : item.allDay
      ? 'All day'
      : new Date(item.startsAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

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
  const track = useRef(null);
  const [picked, setPicked] = useState(null);
  const today = dateKey(now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  });
  const through = new Date(days[6]);
  through.setHours(23, 59, 59, 999);
  const entries = occurrences(
    items.filter((item) => !item.sportsSource),
    days[0],
    through,
  ).filter((item) => !item.done);
  const selected = days.some((day) => dateKey(day) === picked) ? picked : today;
  // Day dots and cards describe household plans only.
  const plans = entries.filter((item) => occursOnDay(item, selected));
  const dayChores = activeChores(chores, selected);
  const dayCount = plans.length + dayChores.length;
  const people = [{ id: 'everyone', title: 'Everyone', color: null }, ...members];
  const selectedPerson = members.some((member) => member.id === person) ? person : 'everyone';
  const visiblePeople = members.filter(
    (member) => selectedPerson === 'everyone' || member.id === selectedPerson,
  );
  const previousView = useRef(null);
  useLayoutEffect(() => {
    const view = `${selectedPerson}:${selected}`;
    const changed = previousView.current !== null && previousView.current !== view;
    previousView.current = view;
    if (!changed || !track.current) return;
    track.current.scrollTo({ left: 0, behavior: 'instant' });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Animate the content without scaling the cards or interfering with touch
    // scrolling. Cancel on rapid selections so only the latest view finishes.
    const animation = track.current.animate(
      [
        { opacity: 0, transform: 'translateX(16px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 350, easing: 'ease-in-out' },
    );
    return () => animation.cancel();
  }, [selectedPerson, selected]);
  function choosePerson(id) {
    setPerson(id);
  }
  return (
    <div className="hub-overview">
      <section className="panel hub-week">
        <div className="panel-heading">
          <h2>Your week</h2>
          <a href="#calendar">Open calendar</a>
        </div>
        <div className="hub-day-strip" role="group" aria-label="Choose a day">
          {days.map((day) => {
            const key = dateKey(day);
            const dayPlans = [
              ...entries.filter((item) => occursOnDay(item, key)),
              ...activeChores(chores, key),
            ];
            return (
              <button
                key={key}
                aria-pressed={selected === key}
                aria-label={`${day.toLocaleDateString(undefined, { dateStyle: 'full' })}, ${dayPlans.length} plans`}
                onClick={() => setPicked(key)}
              >
                <span>
                  {key === today
                    ? 'Today'
                    : day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <strong>{day.getDate()}</strong>
                <span className="hub-day-dots" aria-hidden="true">
                  {dayPlans.slice(0, 3).map((item) => (
                    <i
                      key={item.occurrenceKey || `${item.id}:${item.occurrenceDate || ''}`}
                      style={planStyle(item, members)}
                    />
                  ))}
                  {dayPlans.length > 3 && <small>+{dayPlans.length - 3}</small>}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      {showAgenda && (
        <section className="panel hub-plans">
          <div className="panel-heading">
            <div>
              <h2>
                {selected === today
                  ? "Today's plans"
                  : new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: 'long',
                    })}
              </h2>
              <p className="hub-day-summary">
                {dayCount
                  ? `${dayCount} ${dayCount === 1 ? 'item' : 'items'} for the day`
                  : 'Your day at a glance'}
              </p>
            </div>
            <div className="actions">
              {repository && <QuickReminders repository={repository} />}
              <button onClick={() => setSportsOpen(true)}>Sports calendar</button>
              {showNotes && (
                <button onClick={() => setNotesOpen(true)}>Notes ({notes.length})</button>
              )}
              <a href="#calendar">Full calendar</a>
            </div>
          </div>
          <div className="hub-family-picker" role="group" aria-label="Choose whose plans to view">
            {people.map((member) => (
              <button
                key={member.id}
                aria-pressed={selectedPerson === member.id}
                onClick={() => choosePerson(member.id)}
              >
                <span
                  className="hub-member-avatar"
                  style={
                    member.color
                      ? {
                          backgroundColor: member.color,
                          ...planStyle({ memberIds: [member.id] }, members),
                        }
                      : {}
                  }
                  aria-hidden="true"
                >
                  {member.id === 'everyone' ? 'All' : member.title.slice(0, 1).toUpperCase()}
                </span>
                {member.title}
              </button>
            ))}
          </div>
          <div
            className="hub-family-track"
            ref={track}
            tabIndex={0}
            role="region"
            aria-label="Daily family plans; swipe left or right"
          >
            {visiblePeople.map((member) => {
              // Whole-household plans belong in each person's day. Multi-person
              // plans appear for each assigned member; Everyone shows every plan once.
              const personal = plans.filter(
                (item) =>
                  member.id === 'everyone' ||
                  !assignedMemberIds(item).length ||
                  assignedMemberIds(item).includes(member.id),
              );
              const personalChores = dayChores.filter((item) => item.memberId === member.id);
              return (
                <section
                  className="hub-person-day"
                  key={member.id}

                  aria-label={`${member.title}'s daily plans`}
                >
                  <div className="hub-person-heading">
                    <span
                      className="hub-member-avatar"
                      aria-hidden="true"
                      style={member.color ? planStyle({ memberIds: [member.id] }, members) : {}}
                    >
                      {member.id === 'everyone' ? 'All' : member.title.slice(0, 1).toUpperCase()}
                    </span>
                    <h3>{member.title}</h3>
                    <span className="hint">{personal.length + personalChores.length} items</span>
                  </div>
                  <div
                    className="hub-plan-list"
                    tabIndex={0}
                    role="region"
                    aria-label={`${member.title}'s plans`}
                  >
                    {personal.map((item) => (
                      <button
                        className="hub-plan"
                        key={item.occurrenceKey}
                        onClick={() => onOpenEvent(item)}
                      >
                        <span className="hub-plan-color" style={planStyle(item, members)} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {timeLabel(item)}
                            {item.sportsSource
                              ? ' - Sports'
                              : item.type === 'reminder'
                                ? ' - Reminder'
                                : ''}
                          </small>
                        </span>
                      </button>
                    ))}
                    {personalChores.map((item) => (
                      <ChoreRow
                        key={`${item.id}:${item.occurrenceDate || 'single'}`}
                        item={item}
                        day={selected}
                        onSave={onSaveChore}
                      />
                    ))}
                    {!personal.length && !personalChores.length && (
                      <p className="empty">Nothing planned for this day.</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="hint hub-swipe-hint">
            Swipe to see each person's day, or tap a name above.
          </p>
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
