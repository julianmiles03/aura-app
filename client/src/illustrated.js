import { createAvatar } from '@dicebear/core';
import * as personas from '@dicebear/personas';

// Everyone without an uploaded main photo gets an illustrated avatar (DiceBear "Personas"),
// drawn in the browser from their user id, so the same person always looks the same and no
// profile is blank. Nothing is fetched or stored. Results are cached per id + colour.
const cache = new Map();

export function illustratedAvatar(id, color = '#ECE8FF') {
  const key = `${id}|${color}`;
  if (!cache.has(key)) {
    cache.set(key, createAvatar(personas, {
      seed: `aura-user-${id}`,
      backgroundColor: [color.replace('#', '').toLowerCase()],
    }).toDataUri());
  }
  return cache.get(key);
}
