import { migrate } from './db/migrate.js';
import { seedItemIcons } from './db/seedItemIcons.js';
import { createApp } from './app.js';
import { PORT } from './config.js';

migrate();
seedItemIcons();

const app = createApp();
app.listen(PORT, () => {
  console.log(`[backend] escutando em http://localhost:${PORT}`);
});
