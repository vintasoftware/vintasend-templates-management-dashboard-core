'use client';

/**
 * A text input for a filter that lives in the URL.
 *
 * Binding an input straight to `filters.name` does not work. The URL is read
 * back trimmed, so a trailing space disappears the moment it is typed and
 * "appointment reminder" comes out as "appointmentreminder". Every keystroke is
 * also a navigation and a list request.
 *
 * This keeps what is typed locally, writes the trimmed value once typing
 * pauses, and follows the URL when it changes from outside — Clear filters,
 * the back button, a shared link:
 *
 * ```tsx
 * const { filters, setFilter } = useTemplateFilters();
 * const search = useFilterText(filters.name, (name) => setFilter('name', name));
 *
 * <input value={search.text} onChange={(event) => search.setText(event.target.value)} />
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long typing has to pause before the value is written. */
export const DEFAULT_FILTER_TEXT_DELAY_MS = 300;

export type FilterTextState = {
  /** What the input shows: exactly what was typed, spaces included. */
  text: string;
  /** Updates the input now and writes the trimmed value once typing pauses. */
  setText: (next: string) => void;
  /** Writes what was typed now — on Enter, or on blur. */
  flush: () => void;
};

/**
 * @param filterValue the filter's current value, as the URL holds it. `null`
 *   reads as unset.
 * @param onCommit writes a value: the trimmed text, or `undefined` when only
 *   blanks were typed, which clears the filter.
 * @param delayMs how long typing has to pause before the value is written.
 */
export function useFilterText(
  filterValue: string | null | undefined,
  onCommit: (next: string | undefined) => void,
  delayMs: number = DEFAULT_FILTER_TEXT_DELAY_MS,
): FilterTextState {
  const value = filterValue ?? undefined;
  const [text, setTextState] = useState(value ?? '');

  // Refs, so a timer started on one render reads the latest of each when it
  // fires, and a new `onCommit` on every render does not restart it.
  const textRef = useRef(text);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /**
   * What this hook has written and the URL has not shown yet, oldest first, to
   * tell its own writes coming back from anyone else's. More than one when the
   * router is slower than the typing.
   */
  const pendingRef = useRef<(string | undefined)[]>([]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const flush = useCallback(() => {
    cancel();
    const next = textRef.current.trim() || undefined;
    const pending = pendingRef.current;
    const current = pending.length > 0 ? pending[pending.length - 1] : valueRef.current;

    // A trailing space changes what is typed, not the filter: nothing to write.
    if (next === current) {
      return;
    }

    pending.push(next);
    onCommitRef.current(next);
  }, [cancel]);

  const setText = useCallback(
    (next: string) => {
      textRef.current = next;
      setTextState(next);
      cancel();
      timerRef.current = setTimeout(flush, delayMs);
    },
    [cancel, flush, delayMs],
  );

  useEffect(() => {
    valueRef.current = value;

    // One of our own writes arriving back from the router. What was typed may
    // already differ — a trailing space, or more typing while the router caught
    // up — and is kept.
    const pending = pendingRef.current;
    const own = pending.indexOf(value);
    if (own !== -1) {
      pending.splice(0, own + 1);
      return;
    }

    // Someone else changed the filter: show it, and drop a write still waiting.
    pending.length = 0;
    cancel();
    textRef.current = value ?? '';
    setTextState(value ?? '');
  }, [value, cancel]);

  // A write still waiting when the input goes away is dropped, not made.
  useEffect(() => cancel, [cancel]);

  return { text, setText, flush };
}
