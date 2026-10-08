import { Link } from 'react-router-dom';

interface DetailNotFoundProps {
  /** Where the "back" link goes, e.g. "/hunts". */
  to: string;
  /** Link text, e.g. "Voltar para Hunts". */
  linkLabel: string;
}

/** Shown when a detail route points at a record that does not exist (stale deep link, emptied browser data). */
export function DetailNotFound({ to, linkLabel }: DetailNotFoundProps) {
  return (
    <div className="empty-state" role="status">
      <p style={{ margin: '0 0 12px' }}>Não foi possível carregar este registro. Ele pode ter sido removido.</p>
      <Link to={to}>{linkLabel}</Link>
    </div>
  );
}
