# 💬 Messaging App

Aplicación de mensajería en tiempo real con autenticación, construida con HTML/CSS/JS puro, Supabase y desplegada en Render.

---

## 🚀 Setup completo paso a paso

### 1. Configurar Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita
2. Crea un nuevo proyecto (guarda la contraseña de la base de datos)
3. Ve a **SQL Editor** → **New query**
4. Pega el contenido de `supabase-schema.sql` y ejecuta
5. Ve a **Project Settings** → **API**
6. Copia:
   - **Project URL** → `https://XXXXXX.supabase.co`
   - **anon public key**

### 2. Configurar las credenciales en el proyecto

Abre el archivo `js/supabase.js` y reemplaza:

```js
const SUPABASE_URL = 'https://TU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';
```

### 3. Subir a GitHub

```bash
# En la carpeta del proyecto
git init
git add .
git commit -m "first commit"

# Crea un repositorio en github.com, luego:
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git branch -M main
git push -u origin main
```

### 4. Desplegar en Render

1. Ve a [render.com](https://render.com) y crea una cuenta gratuita
2. Dashboard → **New** → **Static Site**
3. Conecta tu repositorio de GitHub
4. Configuración:
   - **Name**: messaging-app (o el nombre que quieras)
   - **Branch**: main
   - **Publish directory**: `.` (punto, la raíz)
   - Build command: *(dejar vacío)*
5. Clic en **Create Static Site**
6. En unos segundos tendrás una URL pública tipo `https://messaging-app.onrender.com`

### 5. (Opcional) Configurar URL en Supabase

Para mayor seguridad, en Supabase ve a:
**Authentication** → **URL Configuration** → agrega tu URL de Render en **Site URL**.

---

## 📁 Estructura del proyecto

```
messaging-app/
├── index.html          # Página de login
├── register.html       # Página de registro
├── chat.html           # App de mensajería
├── css/
│   ├── auth.css        # Estilos del login/registro
│   └── chat.css        # Estilos del chat
├── js/
│   ├── supabase.js     # Configuración de Supabase ← editar aquí
│   ├── auth.js         # Helpers de autenticación
│   └── chat.js         # Lógica del chat + realtime
└── supabase-schema.sql # Schema de base de datos
```

## ✨ Funcionalidades

- Registro e inicio de sesión con email/contraseña
- Búsqueda de otros usuarios
- Mensajes en tiempo real (Supabase Realtime)
- Soporte modo oscuro automático
- Diseño responsive
