/** Crea el archivo .env (no versionado) con usuarios y contraseñas aleatorias para el personal (Analista y Administrador). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (fs.existsSync(envFile)) {
  console.log('.env ya existe; no se modifica. Las credenciales están en ese archivo (si falta ANALISTA_USER o ADMIN_USER se usan "analista" y "admin").');
} else {
  const pw = () => crypto.randomBytes(6).toString('base64url');
  const a = pw(); const d = pw();
  fs.writeFileSync(envFile, `PORT=3001\nANALISTA_USER=analista\nANALISTA_PASSWORD=${a}\nADMIN_USER=admin\nADMIN_PASSWORD=${d}\n`);
  console.log(`.env creado.\n  Analista      -> usuario analista / contraseña ${a}\n  Administrador -> usuario admin / contraseña ${d}\n(El perfil Público no requiere contraseña.)`);
}
