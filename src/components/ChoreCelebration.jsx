// Short, silent celebrations keep the shared kitchen display pleasant to use.
// Phrases cycle in order, rather than randomly repeating the same message.
export const celebrationPhrases = [
  'Great job!',
  'You did it!',
  'Thanks for lending a hand!',
  'Teamwork makes our home happier!',
  'One less thing to do!',
  'Way to go!',
];

export function ChoreCelebration({ celebration }) {
  if (!celebration) return null;
  return (
    <div className="chore-celebration" key={celebration.id}>
      <div className="chore-confetti" aria-hidden="true">
        {Array.from({ length: 64 }, (_, piece) => (
          <i
            key={piece}
            style={{
              left: `${(piece * 37) % 100}%`,
              '--confetti-drift': `${((piece * 29) % 160) - 80}px`,
              '--confetti-delay': `${(piece % 8) * 0.06}s`,
              '--confetti-spin': `${piece % 2 ? 720 : -720}deg`,
              background: ['#efb94b', '#a64b78', '#326d9c', '#4caf80', '#d69dcc'][piece % 5],
            }}
          />
        ))}
      </div>
      <div className="chore-celebration-message" role="status" aria-live="polite">
        <strong>{celebration.phrase}</strong>
        <span>{celebration.member ? `${celebration.member}, thank you!` : 'Thank you!'}</span>
      </div>
    </div>
  );
}
