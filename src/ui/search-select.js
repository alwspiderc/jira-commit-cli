import {
  createPrompt,
  useState,
  useEffect,
  useKeypress,
  usePrefix,
  usePagination,
  makeTheme,
  isEnterKey,
  isUpKey,
  isDownKey,
  Separator,
} from '@inquirer/core';

const DEBOUNCE_MS = 300;

const baseTheme = {
  icon: { cursor: '❯' },
  style: {
    searchTerm: (text) => text,
    description: (text) => text,
    keysHelpTip: (keys) => keys.map(([key, action]) => `${key} ${action}`).join(' • '),
  },
};

const selectable = (item) => item && !Separator.isSeparator(item) && !item.disabled;

export default createPrompt((config, done) => {
  const { pageSize = 15 } = config;
  const theme = makeTheme(baseTheme, config.theme);
  const [status, setStatus] = useState('idle');
  const [term, setTerm] = useState('');
  const [remote, setRemote] = useState({ term: '', status: 'idle', results: [] });
  const [picked, setPicked] = useState();

  // O "loading" é marcado no keypress: um setState dentro do efeito, num render disparado por
  // tecla, não redesenha a tela (o @inquirer/core junta as atualizações)
  useEffect(() => {
    if (!term || !config.remote) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let next;
      try {
        next = { term, status: 'done', results: await config.remote(term, { signal: controller.signal }) };
      } catch {
        next = { term, status: 'error', results: [] };
      }
      if (!controller.signal.aborted) setRemote(next);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const listed = config.items(term, remote.term === term ? remote : { status: 'idle', results: [] });
  const items = listed.length ? listed : [new Separator(' ')]; // a paginação não aceita lista vazia
  const auto = term ? undefined : config.default;
  let active = items.findIndex((item) => selectable(item) && item.value === (picked ?? auto));
  if (active < 0) active = items.findIndex(selectable);
  const selected = items[active];

  useKeypress((key, rl) => {
    if (isEnterKey(key)) {
      if (selectable(selected)) {
        setStatus('done');
        done(selected.value);
      } else {
        rl.write(term);
      }
    } else if (isUpKey(key) || isDownKey(key)) {
      rl.clearLine(0);
      rl.write(term);
      const step = isUpKey(key) ? -1 : 1;
      let next = active;
      do next += step;
      while (next >= 0 && next < items.length && !selectable(items[next]));
      if (selectable(items[next])) setPicked(items[next].value);
    } else if (rl.line !== term) {
      setTerm(rl.line);
      setPicked(undefined);
      setRemote({ term: rl.line, status: rl.line && config.remote ? 'loading' : 'idle', results: [] });
    }
  });

  const prefix = usePrefix({ status: remote.term === term && remote.status === 'loading' ? 'loading' : status, theme });
  const page = usePagination({
    items,
    active: Math.max(active, 0),
    renderItem({ item, isActive }) {
      if (Separator.isSeparator(item)) return ` ${item.separator}`;
      const cursor = isActive ? theme.icon.cursor : ' ';
      return (isActive ? theme.style.highlight : (x) => x)(`${cursor} ${item.name}`);
    },
    pageSize,
    loop: false,
  });

  const message = theme.style.message(config.message, status);
  if (status === 'done') {
    return [prefix, message, theme.style.answer(selected.short ?? selected.name)].join(' ');
  }

  const header = [prefix, message, term ? theme.style.searchTerm(term) : ''].filter(Boolean).join(' ');
  const body = [
    page,
    ' ',
    selected?.description ? theme.style.description(selected.description) : '',
    theme.style.keysHelpTip([
      ['↑↓', 'navigate'],
      ['⏎', 'select'],
    ]),
  ]
    .filter(Boolean)
    .join('\n')
    .trimEnd();
  return [header, body];
});
