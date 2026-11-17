import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { api } from '../api.js';
import { friendlyError } from '../friendlyError.js';
import { Loader } from './Loading.jsx';
import MemberProfile from './MemberProfile.jsx';
import { Sheet } from './ui.jsx';

// Tap anyone's photo to see their profile (main photo, the 3 more, bio, details, interests).
// One viewer for the whole app: wrap a person's avatar in <PersonButton> with the group they're
// in, and it opens here, on top of whatever is open (even another sheet).
const ProfileViewerContext = createContext(() => {});
export const useProfileViewer = () => useContext(ProfileViewerContext);

export function ProfileViewerProvider({ children }) {
  const [viewing, setViewing] = useState(null); // { person, profile?, error? }
  const opener = useRef(null);
  const request = useRef(0);

  const open = useCallback(async (person, groupId) => {
    opener.current = document.activeElement;
    const id = ++request.current;
    setViewing({ person });
    try {
      const { profile } = await api(`/groups/${groupId}/members/${person.id}/profile`);
      if (id === request.current) setViewing({ person, profile });
    } catch (error) {
      if (id === request.current) setViewing({ person, error });
    }
  }, []);

  const close = () => {
    request.current += 1;
    setViewing(null);
    // Back to the photo that opened it, so keyboard users don't land at the top of the page.
    opener.current?.focus?.();
  };

  return (
    <ProfileViewerContext.Provider value={open}>
      {children}
      {viewing && (
        <Sheet title={`${viewing.person.firstName}'s profile`} onClose={close}>
          {viewing.profile ? (
            <MemberProfile profile={viewing.profile} />
          ) : viewing.error ? (
            <div className="form-error" role="alert">{friendlyError(viewing.error)}</div>
          ) : (
            <div aria-busy="true"><Loader label={`Loading ${viewing.person.firstName}'s profile…`} /></div>
          )}
        </Sheet>
      )}
    </ProfileViewerContext.Provider>
  );
}

// A person's avatar (or anything that stands for them) as a button that opens their profile.
// Without a groupId there's nothing to look them up by, so it renders the children as they are.
export function PersonButton({ person, groupId, className = '', children }) {
  const open = useProfileViewer();
  if (groupId == null) return children;
  return (
    <button
      type="button"
      className={`person-btn ${className}`}
      aria-label={`View ${person.firstName}'s profile`}
      onClick={() => open(person, groupId)}
    >
      {children}
    </button>
  );
}
