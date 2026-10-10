import { useState } from 'react';
import { dateKey, occurrences, occursOnDay, planStyle } from '../../shared/calendar.js';

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
export function HubOverview({ items, notes, members, showAgenda, showNotes, onOpenEvent, now }) {
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
  const entries = occurrences(items, days[0], through).filter((item) => !item.done);
  const selected = days.some((day) => dateKey(day) === picked) ? picked : today;
  // Dots and agenda must describe the same collection, including enabled sports games.
  const plans = entries.filter((item) => occursOnDay(item, selected));
  const nextGame = items
    .filter(
      (item) =>
        item.sportsSource &&
        !occursOnDay(item, selected) &&
        (Date.parse(item.startsAt) >= now.getTime() ||
          (item.sportsTimeTbd && dateKey(new Date(item.startsAt)) >= today)),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
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
            const dayPlans = entries.filter((item) => occursOnDay(item, key));
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
                    <i key={item.occurrenceKey} style={planStyle(item, members)} />
                  ))}
                  {dayPlans.length > 3 && <small>+{dayPlans.length - 3}</small>}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <div className="hub-cards">
        {showAgenda && (
          <section className="panel hub-plans">
            <div className="panel-heading">
              <div>
                <h2>
                  {selected === today
                    ? 'Today’s plans'
                    : new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
                        weekday: 'long',
                      })}
                </h2>
                <p className="hub-day-summary">
                  {plans.length
                    ? `${plans.length} ${plans.length === 1 ? 'plan' : 'plans'} for the day`
                    : 'Your day at a glance'}
                </p>
              </div>
              <a href="#calendar">Full calendar</a>
            </div>
            <div
              className="hub-plan-list"
              tabIndex={0}
              role="region"
              aria-label="Selected day's plans"
            >
              {plans.map((item) => (
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
                        ? ' · Sports'
                        : item.type === 'reminder'
                          ? ' · Reminder'
                          : ''}
                    </small>
                  </span>
                </button>
              ))}
              {!plans.length && (
                <p className="empty">
                  Nothing on the calendar for this day. Choose another day above or add a plan.
                </p>
              )}
            </div>
          </section>
        )}
        <div className="hub-side-cards">
          <section className="panel hub-sports">
            <div className="panel-heading">
              <h2>Next game</h2>
              <a href="#sports">Sports</a>
            </div>
            {nextGame ? (
              <button className="hub-plan" onClick={() => onOpenEvent(nextGame)}>
                <span className="hub-plan-color" style={planStyle(nextGame, members)} />
                <span>
                  <strong>{nextGame.title}</strong>
                  <small>
                    {new Date(nextGame.startsAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {' · '}
                    {timeLabel(nextGame)}
                  </small>
                </span>
              </button>
            ) : (
              <p className="empty">
                Games for this day appear in your plans. Open Sports for schedules and scores.
              </p>
            )}
          </section>
          {showNotes && (
            <section className="panel hub-notes">
              <div className="panel-heading">
                <h2>Notes</h2>
                <a href="#notes">Open notebook</a>
              </div>
              {notes.slice(0, 2).map((note) => (
                <a className="hub-note-preview" key={note.id} href="#notes">
                  <strong>{note.title}</strong>
                  <small>{note.body || 'No text yet.'}</small>
                </a>
              ))}
              {!notes.length && <p className="empty">Your family notebook is ready.</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
