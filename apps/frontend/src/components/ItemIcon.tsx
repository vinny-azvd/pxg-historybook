interface ItemIconProps {
  name: string;
  iconUrl: string | null;
}

export function ItemIcon({ name, iconUrl }: ItemIconProps) {
  if (!iconUrl) {
    return (
      <span className="item-icon placeholder" title={name} aria-hidden="true">
        ?
      </span>
    );
  }
  return <img className="item-icon" src={iconUrl} alt="" title={name} loading="lazy" />;
}
