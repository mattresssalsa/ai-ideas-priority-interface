# AI Ideas Priority Interface

Static Vercel app with a small shared backend.

## Deploy

1. Push this folder to GitHub or deploy it with Vercel CLI.
2. In the Vercel project, open `Storage`.
3. Create a new `Blob` store.
4. Choose `Private` access.
5. Make sure Vercel adds `BLOB_READ_WRITE_TOKEN` to this project.
6. Redeploy.

The app reads and writes shared state through `/api/state`. If the Blob token is missing on Vercel, the app will still load, but shared saving will be disabled.

Anyone with the live URL can edit the shared list.
