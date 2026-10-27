import type { AirspaceFile, StoredFlight } from '../storage/storage';
import { formatDuration, igcFileName } from './format';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function button(text: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function listItem(label: string, ...buttons: HTMLButtonElement[]) {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.textContent = label;
  li.append(span, ...buttons);
  return li;
}

export function renderAirspaceFiles(files: AirspaceFile[], counts: Map<number, number>, onRemove: (id: number) => void) {
  $('airspace-files').replaceChildren(
    ...files.map((f) => listItem(`${f.name} (${counts.get(f.id) ?? 0})`, button('Remove', () => onRemove(f.id)))),
  );
}

export function renderAirspaceClasses(classes: string[], hidden: string[], onChange: (hidden: string[]) => void) {
  const container = $('airspace-classes');
  container.replaceChildren(
    ...classes.map((c) => {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !hidden.includes(c);
      box.addEventListener('change', () => {
        const boxes = [...container.querySelectorAll<HTMLInputElement>('input')];
        onChange(classes.filter((_, i) => !boxes[i]!.checked));
      });
      label.append(box, ` ${c}`);
      return label;
    }),
  );
}

export function renderFlights(flights: StoredFlight[], onExport: (flight: StoredFlight, fileName: string) => void, onDelete: (id: number) => void) {
  // Number Flights per day in launch order, as IGC file names expect.
  const ordered = [...flights].sort((a, b) => a.launchTime - b.launchTime);
  const numbers = new Map<number, number>();
  const perDay = new Map<string, number>();
  for (const f of ordered) {
    const day = new Date(f.launchTime).toISOString().slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    numbers.set(f.id, perDay.get(day)!);
  }

  $('flight-list').replaceChildren(
    ...(flights.length === 0
      ? [listItem('No Flights yet')]
      : flights.map((f) => {
          const when = new Date(f.launchTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
          const label = `${when} · ${formatDuration(f.landingTime - f.launchTime)}${f.recovered ? ' · recovered' : ''}`;
          const name = igcFileName(f.launchTime, numbers.get(f.id)!);
          return listItem(
            label,
            button('Export IGC', () => onExport(f, name)),
            button('Delete', () => {
              if (confirm(`Delete the Flight of ${when}?`)) onDelete(f.id);
            }),
          );
        })),
  );
}

export function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
