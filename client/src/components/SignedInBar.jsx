import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Prototype stand-in for real login: pick which seeded user you are.
export default function SignedInBar({ userId, activeGroupId, onChange, stacked = false }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    api('/users').then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, [userId, activeGroupId]); // refetch so the label shows the current active group
  return (
    <div className={`signed-in-bar ${stacked ? 'signed-in-bar--stacked' : ''}`}>
      <label htmlFor="signed-in-as">Signed in as</label>
      <select id="signed-in-as" value={userId} onChange={(e) => onChange(Number(e.target.value) || null)}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.firstName} {u.lastName}{u.activeGroupName ? ` · ${u.activeGroupName}` : ''}
          </option>
        ))}
        <option value="">Sign out…</option>
      </select>
      <span className="signed-in-bar__tag">Prototype</span>
    </div>
  );
}
