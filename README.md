<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ab82a5c0-169f-46c3-a8fe-a5e46839c3ac

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Add your Gemini key to a local `.env.local` file:

```env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

3. Start the app and the local API server together:
   `npm run dev`

## Security Note

The Gemini key is read only on the server from `process.env.GEMINI_API_KEY`.
It is not injected into the Vite client bundle, so browser users cannot read it from frontend code.
