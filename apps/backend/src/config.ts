import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

export const PORT = Number(process.env.PORT ?? 3001);
export const DB_PATH = path.resolve(backendRoot, process.env.DB_PATH ?? './data/hunts.sqlite3');
export const BD_DIR = path.resolve(backendRoot, process.env.BD_DIR ?? '../../bd');
export const ITEM_DATABASE_JSON = path.join(BD_DIR, 'image-database.json');
export const IMAGES_DIR = path.join(BD_DIR, 'images');
