# 🚀 Guía Rápida - Firestore en TuRuta PWA

## ⏱️ 10 minutos para tener Firestore funcionando

### Paso 1: Habilitar Firestore en Firebase Console ✅

1. Abre https://console.firebase.google.com/
2. Selecciona tu proyecto `tunja-pwa`
3. En el menú izquierdo, ve a **"Firestore Database"**
4. Haz clic en **"Crear base de datos"**
5. Modo: **"Empezar en modo de prueba"** (para desarrollo)
6. Ubicación: **"us-central1"** (o la más cercana)
7. Haz clic en **"Crear"**

⏳ Espera a que se cree (toma ~1 minuto)

### Paso 2: Configurar Reglas de Seguridad 🔒

En Firebase Console, ve a Firestore → Pestaña **"Reglas"** y reemplaza el contenido con:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Los usuarios solo pueden leer/escribir sus propios documentos
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Los usuarios solo ven sus propios favoritos
    match /favorites/{userId}/routes/{routeId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Los usuarios solo ven sus propias búsquedas recientes
    match /recentSearches/{userId}/{searchId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

Haz clic en **"Publicar"**

### Paso 3: Verificar que la implementación está completa ✨

El código ya está 100% implementado. Solo verifica que estos archivos existan:

```
✓ src/firebase/config.js           (actualizado)
✓ src/firebase/firestoreService.js (nuevo)
✓ src/context/AuthContext.jsx      (actualizado)
✓ src/pages/FavoritosPage.jsx      (actualizado)
✓ src/pages/RutasPage.jsx          (actualizado)
✓ src/pages/PerfilPage.jsx         (actualizado)
```

### Paso 4: Reiniciar el servidor de desarrollo

Si tenías `npm run dev` ejecutándose:

```bash
# Presiona Ctrl+C para detener
npm run dev
```

Vite recompilará con los cambios.

### Paso 5: Prueba el flujo completo

#### 5.1 Crear cuenta y perfil

1. Abre http://localhost:5173/login
2. Haz clic en **"Regístrate aquí"**
3. Llena el formulario:
   - Email: `test@example.com`
   - Contraseña: `password123`
   - Confirmar: `password123`
4. Haz clic en **"Registrarse"**
5. Deberías llegar a `/inicio`

✅ **Perfil creado automáticamente en Firestore**

**Verifica en Firebase Console:**
- Firestore → Colección `users` → Documento con tu `uid`
- Deberías ver: `email`, `displayName`, `photoURL`, `createdAt`, `updatedAt`

#### 5.2 Guardar una ruta como favorita

1. Navega a `/rutas`
2. Llena los campos:
   - Donde estás: `Plaza de Bolivar`
   - A donde quieres ir: `UPTC`
3. Haz clic en **"Buscar rutas de buses"**
4. Verás 3 rutas sugeridas
5. Haz clic en el botón **❤️** de cualquier ruta para guardarla

✅ **Favorito guardado en Firestore**

**Verifica en Firebase Console:**
- Firestore → Colección `favorites` → Documento `{tuIdDeUsuario}` → Subcol `routes`
- Deberías ver los campos de la ruta guardada

#### 5.3 Ver favoritos guardados

1. Navega a `/favoritos`
2. Deberías ver la ruta que acabas de guardar
3. Intenta guardar otra ruta desde `/rutas`
4. Recarga `/favoritos` - se actualiza en tiempo real ✨

✅ **Sincronización en tiempo real funcionando**

#### 5.4 Editar perfil

1. Navega a `/perfil`
2. Haz clic en el botón **"✏️ Editar perfil"**
3. Cambia el nombre, ej: `Juan Pérez`
4. Haz clic en **"Guardar cambios"**
5. Verás un mensaje de éxito

✅ **Perfil actualizado en Firestore**

#### 5.5 Búsquedas recientes

1. Desde `/rutas`, realiza 3 búsquedas diferentes:
   - Centro → Terminal
   - UPTC → Hospital
   - Terminal → Barrio Norte
2. Verás mensajes "Búsqueda registrada" ✅

**Verifica en Firebase Console:**
- Firestore → Colección `recentSearches` → Documento `{tuIdDeUsuario}`
- Deberías ver tus 3 búsquedas ordenadas por fecha

### Paso 6: Probar el flujo de datos

#### Guardar favorito → Verlo en Firestore → Verlo en la app

```
1. App: Click en ❤️ de una ruta
            ↓
2. RutasPage: Llama a addFavorite()
            ↓
3. Firebase: Almacena en /favorites/{userId}/routes/{routeId}
            ↓
4. Firestore Console: Puedes ver el documento
            ↓
5. FavoritosPage: Suscripción en tiempo real
            ↓
6. App: Se actualiza automáticamente sin recargar ✨
```

---

## 📊 Estructura de datos en Firestore

### Colección: `users`

```
users/
  {userId}/
    ├── email: "test@example.com"
    ├── displayName: "Juan Pérez"
    ├── photoURL: ""
    ├── createdAt: timestamp
    └── updatedAt: timestamp
```

### Colección: `favorites` (subcol `routes`)

```
favorites/
  {userId}/
    routes/
      {routeId}/
        ├── origin: "Plaza de Bolivar"
        ├── destination: "UPTC"
        ├── distance: "5.2 km"
        ├── estimatedTime: "25 min"
        ├── transportModes: ["Autobús"]
        ├── createdAt: timestamp
        └── addedAt: timestamp
```

### Colección: `recentSearches`

```
recentSearches/
  {userId}/
    {searchId}/
      ├── origin: "Plaza de Bolivar"
      ├── destination: "UPTC"
      ├── distance: "5.2 km"
      ├── duration: "25 min"
      └── timestamp: timestamp
```

---

## 🔧 Funciones disponibles en `firestoreService.js`

### Usuarios
- `createUserProfile(userId, userData)` - Crear perfil al registrar
- `getUserProfile(userId)` - Obtener datos del usuario
- `updateUserProfile(userId, updates)` - Editar perfil

### Favoritos
- `addFavorite(userId, routeData)` - Guardar ruta como favorita
- `removeFavorite(userId, routeId)` - Eliminar favorito
- `getFavorites(userId)` - Obtener lista de favoritos
- `subscribeToFavorites(userId, callback)` - Escuchar cambios en tiempo real

### Búsquedas
- `addRecentSearch(userId, searchData)` - Guardar búsqueda
- `getRecentSearches(userId, limitCount)` - Obtener últimas búsquedas
- `subscribeToRecentSearches(userId, callback, limitCount)` - Escuchar cambios

---

## 🐛 Troubleshooting

| Error | Solución |
|-------|----------|
| `Cannot read property 'db'` | Verifica que `config.js` exporta `db` |
| `Permission denied` | Revisa que las reglas de Firestore estén publicadas |
| No se guarda el favorito | Asegúrate que estés autenticado (`currentUser` no es null) |
| Cambios no se sincronizan | Recarga la página, verifica conexión a internet |
| `Firestore not initialized` | Reinicia `npm run dev` |

---

## 📱 Características implementadas

### ✅ Autenticación
- Crear cuenta → Perfil automático en Firestore
- Login → Cargar datos del perfil
- Logout → Limpiar datos locales

### ✅ Perfil de Usuario
- Ver datos en `/perfil`
- Editar nombre desde `/perfil`
- Sincronizar cambios a Firestore

### ✅ Favoritos
- Guardar rutas desde `/rutas`
- Ver favoritos en `/favoritos`
- Eliminar favoritos
- **Sincronización en tiempo real** ✨

### ✅ Búsquedas Recientes
- Guardar automáticamente al buscar
- Últimas 10 búsquedas
- Ordenadas por fecha más reciente

### ✅ Seguridad
- Cada usuario ve solo sus datos
- Reglas de Firestore validadas
- Variables de entorno protegidas

---

## 🚀 Comandos útiles

```bash
# Iniciar desarrollo
npm run dev

# Compilar para producción
npm run build

# Ver logs de Firestore en navegador
# Abre DevTools (F12) → Console
# import.meta.env.VITE_FIREBASE_PROJECT_ID
```

---

## 📚 Recursos

- [Firebase Console](https://console.firebase.google.com/)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Real-time Updates](https://firebase.google.com/docs/firestore/query-data/listen)

---

## ✅ Checklist de completitud

- [ ] Firestore habilitado en Firebase Console
- [ ] Reglas de seguridad publicadas
- [ ] `npm run dev` ejecutándose
- [ ] Crear cuenta y perfil en Firestore ✅
- [ ] Guardar favorito y verlo en Firestore ✅
- [ ] Ver favoritos en `/favoritos` sincronizados ✅
- [ ] Editar perfil desde `/perfil` ✅
- [ ] Búsquedas guardadas en Firestore ✅
- [ ] Cerrar sesión funciona correctamente ✅
- [ ] Datos persisten al recargar ✅

---

¡Firestore está 100% integrado en tu PWA! 🎉

## Próximos pasos opcionales

1. 📊 Crear índices de Firestore para queries más complejas
2. 📸 Agregar fotos de perfil (Cloud Storage)
3. 🔔 Notificaciones cuando alguien valora tus rutas
4. 📍 Geolocalización y búsqueda por distancia
5. ⭐ Sistema de calificación de rutas
