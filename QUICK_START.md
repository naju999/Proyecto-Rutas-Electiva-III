# 🚀 Quick Start - Autenticación con Firebase

## ⏱️ 5 minutos para tener autenticación funcionando

### Paso 1: Verificar que Firebase está instalado ✅

```bash
npm list firebase
# Debería mostrar: firebase@X.X.X
```

### Paso 2: Crear proyecto en Firebase Console 🔧

1. Abre https://console.firebase.google.com/
2. Haz clic en **"Crear un proyecto"**
3. Nombre: `tunja-pwa` (o el que prefieras)
4. Haz clic en **"Crear proyecto"**
5. Espera a que termine de crear

### Paso 3: Habilitar Email/Contraseña Authentication

1. En Firebase Console, ve a **"Authentication"** (menú izquierdo)
2. Ve a la pestaña **"Métodos de inicio de sesión"**
3. Haz clic en **"Email/Contraseña"**
4. Activa el toggle de **"Contraseña"**
5. Haz clic en **"Guardar"**

✅ **Listo!** Email/Contraseña está habilitado

### Paso 4: Obtener credenciales de Firebase

1. Ve a **"Configuración del proyecto"** (ícono ⚙️ arriba a la izquierda)
2. Ve a la pestaña **"Aplicaciones"**
3. Haz clic en el ícono **`</>`** (Web)
4. Registra la app con nombre: `tunja-pwa`
5. Haz clic en **"Registrar app"**
6. Se abrirá un modal con tu configuración

**Copia este objeto:**
```javascript
const firebaseConfig = {
  apiKey: "AIza...",                    // Copia esto
  authDomain: "....firebaseapp.com",    // Copia esto
  projectId: ".....",                   // Copia esto
  storageBucket: "....appspot.com",     // Copia esto
  messagingSenderId: "123456789",       // Copia esto
  appId: "1:123456:web:abc...",         // Copia esto
};
```

### Paso 5: Configurar variables de entorno

En la raíz de tu proyecto (junto a `package.json`), crea un archivo `.env`:

```bash
# En Windows PowerShell (desde la carpeta del proyecto)
New-Item -Path ".env" -ItemType File

# En Linux/Mac
touch .env
```

Abre `.env` con tu editor y pegalo esto:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=....firebaseapp.com
VITE_FIREBASE_PROJECT_ID=....
VITE_FIREBASE_STORAGE_BUCKET=....appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456:web:abc...
```

Reemplaza los valores con los que copiaste del paso anterior.

### Paso 6: Agregar .env a .gitignore

Abre `.gitignore` (en la raíz) y agrega estas líneas:

```
.env
.env.local
.env.*.local
```

Esto evita que subas tus credenciales a Git por accidente.

### Paso 7: Reiniciar servidor de desarrollo

Si tenías `npm run dev` ejecutándose, detente presionando `Ctrl+C` en la terminal, luego:

```bash
npm run dev
```

Vite necesita reiniciar para leer las variables del `.env` nuevo.

### Paso 8: Prueba el flujo de autenticación

1. Abre http://localhost:5173 en tu navegador
2. Deberías ser redirigido a `/login` automáticamente
3. Haz clic en **"Regístrate aquí"**
4. Llena el formulario de registro:
   - Email: `test@example.com`
   - Contraseña: `password123`
   - Confirmar: `password123`
5. Haz clic en **"Registrarse"**
6. Deberías llegar a `/inicio`

✅ **¡Registro exitoso!**

### Paso 9: Prueba el login

1. Abre http://localhost:5173/login
2. Ingresa las credenciales que acabas de crear
3. Haz clic en **"Iniciar Sesión"**
4. Deberías llegar a `/inicio`

✅ **¡Login exitoso!**

### Paso 10: Prueba las rutas protegidas

1. Intenta acceder a http://localhost:5173/rutas
2. Deberías ver la página de rutas (está autenticado)
3. Recarga la página: la sesión persiste ✅

### Paso 11: Prueba el logout (opcional)

Para agregar un botón de logout, abre `src/pages/PerfilPage.jsx` y agrega:

```jsx
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function PerfilPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Error:', err);
    }
  }

  return (
    <div>
      {/* Tu contenido del perfil aquí */}
      <button onClick={handleLogout}>Cerrar Sesión</button>
    </div>
  );
}
```

---

## Troubleshooting rápido

| Error | Solución |
|-------|----------|
| `TypeError: Cannot read property 'currentUser'` | Asegúrate que `<AuthProvider>` envuelve tu app en `main.jsx` |
| `Cannot find module 'firebase'` | Ejecuta `npm install firebase` |
| `VITE_FIREBASE_API_KEY is undefined` | Verifica que el `.env` está en la raíz y reinicia `npm run dev` |
| No se redirige a `/login` | Revisa la consola del navegador (F12) para errores |
| Formulario no responde | Verifica que Firebase Console tiene Email/Contraseña habilitado |
| "Usuario no encontrado" al login | El usuario no fue registrado aún, prueba registro primero |

---

## Comandos útiles

```bash
# Instalar Firebase (si falta)
npm install firebase

# Iniciar desarrollo
npm run dev

# Compilar para producción
npm build

# Ver variable de entorno (para verificar que se cargó)
# En Chrome DevTools Console:
# > import.meta.env.VITE_FIREBASE_PROJECT_ID
```

---

## Estructura de archivos que se creó

```
tu-proyecto/
├── .env (CREA ESTO MANUALMENTE)
├── .env.example
├── SETUP_AUTH.md
├── AUTH_ARCHITECTURE.md
├── QUICK_START.md (ESTE ARCHIVO)
├── src/
│   ├── firebase/
│   │   └── config.js (NUEVO)
│   ├── context/
│   │   └── AuthContext.jsx (NUEVO)
│   ├── components/
│   │   └── ProtectedRoute.jsx (NUEVO)
│   ├── pages/
│   │   ├── LoginPage.jsx (NUEVO)
│   │   ├── RegisterPage.jsx (NUEVO)
│   │   └── ...otros
│   ├── App.jsx (ACTUALIZADO)
│   ├── main.jsx (ACTUALIZADO)
│   └── styles.css (ACTUALIZADO)
└── package.json (firebase fue agregado)
```

---

## ✅ Checklist de completitud

- [ ] Firebase Console proyecto creado
- [ ] Email/Contraseña habilitado
- [ ] Credenciales copiadas
- [ ] `.env` creado con valores reales
- [ ] `.env` agregado a `.gitignore`
- [ ] `npm run dev` ejecutado
- [ ] Login en http://localhost:5173 carga
- [ ] Registro funciona ✅
- [ ] Login funciona ✅
- [ ] Rutas protegidas redirigen a login si no estás autenticado ✅
- [ ] Sesión persiste al recargar ✅

---

## Próximos pasos

**Ahora que autenticación funciona, puedes:**

1. ✏️ Estilizar los formularios en `src/styles.css`
2. 👤 Agregar datos del usuario (perfil, foto, etc.)
3. 🔒 Implementar "Olvidé contraseña"
4. 🔑 Agregar login con Google/GitHub
5. 📧 Enviar email de verificación
6. 💾 **[IMPLEMENTADO] Sincronizar datos con Firestore** ← Ver [SETUP_FIRESTORE.md](SETUP_FIRESTORE.md)

---

## Recursos útiles

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Docs - Authentication](https://firebase.google.com/docs/auth)
- [React Context API Docs](https://react.dev/reference/react/createContext)
- [React Router v6 Docs](https://reactrouter.com/)

---

¡Listo! Ya tienes autenticación profesional en tu PWA. 🎉
