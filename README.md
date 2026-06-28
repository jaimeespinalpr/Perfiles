# Perfiles

Sitio estatico para crear cuentas de usuario (atleta, entrenador o padre/madre) y llenar el
perfil de atleta. Usa **el mismo proyecto de Firebase** que
[wrest8858](https://github.com/jaimeespinalpr/wrest8858) (Wrestling Performance Lab), por lo
que las cuentas y perfiles creados aqui quedan guardados en la misma coleccion `users` de
Firestore y son visibles desde la app principal (por ejemplo, un entrenador puede ver ahi los
perfiles de sus atletas).

## Como funciona

- **Autenticacion**: Firebase Auth (correo + contrasena).
- **Datos**: Firestore, coleccion `users`, un documento por usuario (ID = UID de Firebase Auth).
- **Fotos de perfil**: Firebase Storage, ruta `media_uploads/{uid}/...`, igual que el original.
- Todo el front-end es estatico (`index.html` + `styles.css` + `app.js`), sin backend propio:
  Firebase es la unica base de datos, igual que en wrest8858.

## Diferencias con el formulario original (simplificaciones)

Para mantener este sitio pequeno y facil de mantener, no se copio el archivo monolitico
`app.js` de wrest8858 (1.2+ MB) tal cual. En su lugar se construyo una app nueva, mas chica,
pero **compatible con el mismo esquema de datos**, con estas simplificaciones:

- No incluye el recortador de fotos (crop) al registrarse; en el registro solo se puede pegar
  una URL de foto. Subir y reemplazar la foto con recorte automatico a 512px si esta disponible
  una vez iniciada la sesion, desde la pantalla de perfil.
- Las "tags" se ingresan como texto separado por comas en lugar de un selector visual.
- No incluye la grilla de tecnicas (neutral/arriba/abajo/defensa) que se usa en otras vistas de
  wrest8858 (esa parte pertenece a la vista de entrenador/partido, no al perfil propio del
  atleta).

## Publicar con GitHub Pages

Este repo incluye un workflow (`.github/workflows/pages.yml`) que despliega automaticamente el
sitio a GitHub Pages en cada push a la rama principal. **Falta un paso manual una sola vez**
porque la API de GitHub usada en esta sesion no puede activar la opcion de Pages por ti:

1. Ve a **Settings -> Pages** en este repositorio.
2. En "Build and deployment" -> "Source", elige **GitHub Actions**.
3. Guarda. El workflow se ejecutara y el sitio quedara publicado en:
   `https://jaimeespinalpr.github.io/Perfiles/`

## Desarrollo local

No requiere build ni dependencias: es HTML/CSS/JS plano. Basta abrir `index.html` en un
navegador o servirlo con cualquier servidor estatico.
