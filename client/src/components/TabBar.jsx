import Icon from './Icon.jsx';

const TABS = [
  { id: 'find', label: 'Find', icon: 'find' },
  { id: 'messages', label: 'Messages', icon: 'messages' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

export default function TabBar({ current, unread }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <a key={tab.id} href={`#/${tab.id}`} className="tabbar__item" aria-current={current === tab.id ? 'page' : undefined}>
          <Icon name={tab.icon} size={26} />
          {tab.label}
          {tab.id === 'messages' && unread > 0 && (
            <span className="tabbar__badge" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>
          )}
        </a>
      ))}
    </nav>
  );
}
