import { useCallback, useState } from 'react';
import { LocaleProvider } from './i18n';
import { SessionForm } from './components/SessionForm';
import { Popup } from './pages/Popup';
import { mount, useAppState } from './shell';

function PopupApp() {
    const { snapshot, run, busy, loading, messages } = useAppState({ popup: true });
    const [manual, setManual] = useState(false);
    const close = useCallback(() => setManual(false), []);
    if (!snapshot)
        return loading;
    const shared = { state: snapshot.state, run, busy, detection: snapshot.detection };
    return <LocaleProvider language={snapshot.state.settings.language}>{messages}<Popup {...shared} manual={() => setManual(true)}/>{manual && <SessionForm {...shared} close={close}/>}</LocaleProvider>;
}
mount(<PopupApp />);
