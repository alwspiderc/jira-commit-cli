// Select com busca: sem termo, mostra a lista com o cursor no default (como o select); ao digitar,
// a lista é refeita na hora e, em paralelo, uma busca remota (ex.: no Jira) completa os
// resultados quando chega. O @inquirer/search não serve aqui: ele não tem default e só mostra a
// lista nova depois que a busca assíncrona termina, então o filtro local esperaria a rede.
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

const DEBOUNCE_MS = 300; // espera a pessoa parar de digitar antes de ir à rede

const baseTheme = {
  icon: { cursor: '❯' },
  style: {
    searchTerm: (text) => text,
    description: (text) => text,
    keysHelpTip: (keys) => keys.map(([key, action]) => `${key} ${action}`).join(' • '),
  },
};

const selectable = (item) => item && !Separator.isSeparator(item) && !item.disabled;

/**
 * config.items(term, remote) → lista de opções e Separators a mostrar.
 *   term: o que foi digitado ('' = lista inicial)
 *   remote: { status: 'idle' | 'loading' | 'done' | 'error', results } da busca remota daquele termo
 * config.remote(term, { signal }) → Promise com os resultados remotos (opcional; se rejeitar, status 'error')
 * config.default: valor em que o cursor começa quando não há termo
 */
export default createPrompt((config, done) => {
  const { pageSize = 15 } = config;
  const theme = makeTheme(baseTheme, config.theme);
  const [status, setStatus] = useState('idle');
  const [term, setTerm] = useState('');
  const [remote, setRemote] = useState({ term: '', status: 'idle', results: [] });
  // undefined = cursor automático (default sem termo, primeira opção com termo)
  const [picked, setPicked] = useState();

  // O "loading" é marcado no keypress, junto com o termo: um setState feito dentro do efeito, num
  // render disparado por tecla, não redesenha a tela (o @inquirer/core junta as atualizações).
  useEffect(() => {
    if (!term || !config.remote) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      // busca remota é um extra: se falhar, fica a lista local e o status "error" para avisar
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
        rl.write(term); // o Enter limpa a linha do readline; devolve o termo
      }
    } else if (isUpKey(key) || isDownKey(key)) {
      rl.clearLine(0);
      rl.write(term);
      const step = isUpKey(key) ? -1 : 1;
      let next = active;
      do next += step;
      while (next >= 0 && next < items.length && !selectable(items[next]));
      if (selectable(items[next])) setPicked(items[next].value); // para no começo/fim da lista
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
