import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RareEvent } from '../../api/types';
import { formatDateTime, formatInt } from '../../format';
import { RareBadges, RareSprite } from './RareSprite';
import { ORIGIN_LABEL, entryPath } from './rareUtils';

// Long histories would push the rest of the page far down; the first rows
// cover the usual "what dropped lately" question and the rest is one click away.
const INITIAL_ROWS = 25;

// On a phone the Qtd. and Origem columns fold into their neighbours ("× 3"
// after the name, "Hunt" under the link) so the count and the link stay on
// screen without a sideways scroll nobody would notice. Each copy is
// display:none on the other layout, so screen readers read it only once.
export function RareEventsTable({ events }: { events: RareEvent[] }) {
  const [showAll, setShowAll] = useState(false);
  if (events.length === 0) return <div className="empty-state">Nenhum raro identificado no período.</div>;
  const visible = showAll ? events : events.slice(0, INITIAL_ROWS);
  return (
    <>
      <div className="rares-table-wrap">
        <table className="data-table rares-table">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Inimigo</th>
              <th scope="col" className="num rares-col-wide">
                Qtd.
              </th>
              <th scope="col" className="rares-col-wide">
                Origem
              </th>
              <th scope="col">Onde</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((event) => (
              <tr key={event.id}>
                <td className="rares-table-date">{formatDateTime(event.startTime)}</td>
                <td>
                  <span className="rares-enemy-cell">
                    <RareSprite name={event.enemy} size={32} />
                    <span>
                      {event.enemy}
                      <span className="rares-inline-narrow">
                        {' '}
                        × {formatInt(event.count)}
                      </span>
                    </span>
                    {event.fromNightmareCrystal && <RareBadges name="" nightmareCrystal />}
                  </span>
                </td>
                <td className="num rares-col-wide">{formatInt(event.count)}</td>
                <td className="rares-col-wide">{ORIGIN_LABEL[event.origin]}</td>
                <td>
                  <Link to={entryPath(event.origin, event.entryId)}>{event.entryName ?? ORIGIN_LABEL[event.origin]}</Link>
                  {event.entryName && (
                    <span className="rares-inline-narrow rares-origin-narrow"> {ORIGIN_LABEL[event.origin]}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {events.length > INITIAL_ROWS && (
        <div className="rares-table-more">
          <button type="button" className="secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Mostrar todos (${formatInt(events.length)})`}
          </button>
        </div>
      )}
    </>
  );
}
