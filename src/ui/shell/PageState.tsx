import { createContext, useContext, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

type PageMemory = Map<string, unknown>;
const Context = createContext<PageMemory | null>(null);
/** Session-only presentation state. Nothing here belongs in the game save. */
export function PageStateProvider({ children }: { children: ReactNode }) {
  const memory = useRef<PageMemory>(new Map());
  return <Context.Provider value={memory.current}>{children}</Context.Provider>;
}
export function usePageMemory() { return useContext(Context); }
export function usePageState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const memory = usePageMemory();
  const [value, setValue] = useState<T>(() => memory?.has(key) ? memory.get(key) as T : typeof initial === 'function' ? (initial as () => T)() : initial);
  useLayoutEffect(() => { memory?.set(key, value); }, [memory, key, value]);
  return [value, setValue];
}
