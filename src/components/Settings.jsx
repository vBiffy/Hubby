// Display-only settings view; the shell owns persistence and defaults.
export function Settings({ settings, onChange, onReset }) {
  return (
    <section className="panel settings">
      <h2>Your hub, your way</h2>
      <p>
        Display preferences are saved on this screen. Notes and events are shared through the
        database.
      </p>
      <label>
        Hub name
        <input
          maxLength={80}
          value={settings.name}
          onChange={(e) => onChange({ ...settings, name: e.target.value })}
        />
      </label>
      <label>
        Accent color
        <input
          type="color"
          value={settings.accent}
          onChange={(e) => onChange({ ...settings, accent: e.target.value })}
        />
      </label>
      <label>
        Week starts on
        <select
          value={settings.weekStart}
          onChange={(e) => onChange({ ...settings, weekStart: Number(e.target.value) })}
        >
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
        </select>
      </label>
      {[
        ['dark', 'Dark theme'],
        ['large', 'Larger text'],
        ['agenda', 'Show coming up widget'],
        ['notes', 'Show notes widget'],
      ].map(([key, label]) => (
        <label className="toggle" key={key}>
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(e) => onChange({ ...settings, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <button onClick={onReset}>Reset display preferences</button>
    </section>
  );
}
