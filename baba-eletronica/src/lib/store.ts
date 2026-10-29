import { useSyncExternalStore } from 'react'

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  patch(partial: Partial<T>): void
  subscribe(fn: () => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((fn) => fn())
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next
      if (value === state) return
      state = value
      emit()
    },
    patch(partial) {
      state = { ...state, ...partial }
      emit()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

/** Assina um store. O seletor deve devolver valores estáveis (primitivos ou referências existentes). */
export function useStore<T extends object, S = T>(store: Store<T>, selector?: (s: T) => S): S {
  const get = () => (selector ? selector(store.get()) : (store.get() as unknown as S))
  return useSyncExternalStore(store.subscribe, get, get)
}

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* armazenamento indisponível (aba privada) */
  }
}

export function readJson<T>(key: string): T | null {
  const raw = safeGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
