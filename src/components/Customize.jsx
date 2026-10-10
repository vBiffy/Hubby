import { useId, useState } from 'react';
import { Settings } from './Settings.jsx';
import { FamilyMembers } from './FamilyMembers.jsx';
import { SportsFavorites } from './SportsFavorites.jsx';

const sections = [
  ['display', 'Display'],
  ['family', 'Family'],
  ['sports', 'Sports'],
];

// Render one settings section at a time; persistence remains with the app shell.
export function Customize({
  settings,
  onChange,
  onReset,
  members,
  onSaveMember,
  onDeleteMember,
  repository,
}) {
  const [section, setSection] = useState('display');
  const id = useId();
  return (
    <div className="customize">
      <div className="customize-tabs" role="tablist" aria-label="Customize sections">
        {sections.map(([key, label], index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-${key}`}
            aria-controls={`${id}-panel`}
            aria-selected={section === key}
            tabIndex={section === key ? 0 : -1}
            onClick={() => setSection(key)}
            onKeyDown={(event) => {
              let next;
              if (event.key === 'ArrowRight') next = (index + 1) % sections.length;
              if (event.key === 'ArrowLeft') next = (index + sections.length - 1) % sections.length;
              if (event.key === 'Home') next = 0;
              if (event.key === 'End') next = sections.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                setSection(sections[next][0]);
                document.getElementById(`${id}-${sections[next][0]}`).focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${section}`}>
        {section === 'display' && (
          <Settings settings={settings} onChange={onChange} onReset={onReset} />
        )}
        {section === 'family' && (
          <FamilyMembers members={members} onSave={onSaveMember} onDelete={onDeleteMember} />
        )}
        {section === 'sports' && (
          <SportsFavorites
            repository={repository}
            favorites={settings.sportsFavorites}
            calendarTeams={settings.sportsCalendarTeams}
            onCalendarChange={(sportsCalendarTeams) =>
              onChange({ ...settings, sportsCalendarTeams })
            }
            onChange={(sportsFavorites) => onChange({ ...settings, sportsFavorites })}
          />
        )}
      </div>
    </div>
  );
}
