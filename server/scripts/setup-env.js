/** Crea el archivo .env (no versionado) con contraseñas aleatorias para los perfiles de prueba. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (fs.existsSync(envFile)) {
  console.log('.env ya existe; no se modifica. Las contraseñas están en ese archivo.');
} else {
  const pw = () => crypto.randomBytes(6).toString('base64url');
  const a = pw(); const d = pw();
  fs.writeFileSync(envFile, `PORT=3001\nANALISTA_PASSWORD=${a}\nADMIN_PASSWORD=${d}\n`);
  console.log(`.env creado.\n  Analista      -> ${a}\n  Administrador -> ${d}\n(El perfil Público no requiere contraseña.)`);
}
