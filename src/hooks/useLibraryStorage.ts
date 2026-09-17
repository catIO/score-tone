import { createContext, useContext } from 'react';
import type { LibraryStorage } from '../services/storageService';

// Each mounted app tree keeps its own database reference. Async work and
// debounced saves can never be redirected into another account's database.
export const LibraryStorageContext = createContext<LibraryStorage | null>(null);

export function useLibraryStorage(): LibraryStorage {
    const storage = useContext(LibraryStorageContext);
    if (!storage) throw new Error('Library storage provider is missing.');
    return storage;
}