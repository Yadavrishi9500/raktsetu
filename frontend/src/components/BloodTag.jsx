/** The blood-bag label: RaktSetu's signature visual for a blood group. */
export default function BloodTag({ group, size = 'md', caption, className = '' }) {
  const abo = group.replace(/[+-]$/, '');
  const neg = group.endsWith('-');
  return (
    <div className={`tag ${size} ${neg ? 'neg' : ''} ${className}`} role="img" aria-label={`Blood group ${abo} ${neg ? 'negative' : 'positive'}`}>
      <div className="tag-head" aria-hidden="true">
        <span>RAKTSETU</span>
        <span>1 UNIT</span>
      </div>
      <div className="tag-body" aria-hidden="true">
        <div className="tag-group">
          {abo}
          <span className="tag-rh">{neg ? '\u2212' : '+'}</span>
        </div>
        <div className="tag-sub">{caption || `Rh ${neg ? 'negative' : 'positive'}`}</div>
      </div>
      <div className="tag-code" aria-hidden="true" />
    </div>
  );
}
