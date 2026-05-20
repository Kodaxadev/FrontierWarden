// useSortable — reusable hook for sortable table columns.
// Returns sorted data + a SortHeader component helper.

import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function useSortable<T, K extends string>(
  data: T[],
  defaultKey: K,
  defaultDir: SortDir = 'asc',
  accessor: (item: T, key: K) => string | number,
) {
  const [sort, setSort] = useState<SortState<K>>({ key: defaultKey, dir: defaultDir });

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const av = accessor(a, sort.key);
      const bv = accessor(b, sort.key);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av;
      }
      const sa = String(av).toLowerCase();
      const sb = String(bv).toLowerCase();
      const cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sort.key, sort.dir, accessor]);

  function toggle(key: K) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }

  return { sorted, sort, toggle };
}

/** Returns the sort indicator arrow for a column header. */
export function sortArrow<K extends string>(sort: SortState<K>, key: K): string {
  if (sort.key !== key) return '';
  return sort.dir === 'asc' ? ' ▲' : ' ▼';
}
