import { LocaleProvider } from './i18n';
import { Popup } from './pages/Popup';
import { mount, useAppState } from './shell';

function PopupApp() {
    const { snapshot, run, busy, loading, messages } = useAppState({ popup: true });
    if (!snapshot)
        return loading;
    return <LocaleProvider language={snapshot.state.settings.language}>{messages}<Popup state={snapshot.state} run={run} busy={busy} detection={snapshot.detection}/></LocaleProvider>;
}
mount(<PopupApp />);
